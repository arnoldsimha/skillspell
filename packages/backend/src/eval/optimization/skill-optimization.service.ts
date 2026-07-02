import { Injectable, Inject, Logger, NotFoundException, OnModuleDestroy } from '@nestjs/common';
import { Subject } from 'rxjs';
import { v4 as uuidv4 } from 'uuid';
import type {
  EvalCase,
  EvalRun,
  Skill,
  SkillDraft,
  SkillOptimizationConfig,
  IterationState,
  OptimizationEvent,
  OptimizationResult,
  CoverageGapReport,
} from '@skillspell/shared';
import {
  EVAL_REPOSITORY,
  MIN_EVAL_CASES_FOR_BLINDED_SPLIT,
  type IEvalRepository,
} from '@skillspell/shared';
import { SkillsService } from '../../skills/skills.service.js';
import { GenerationService } from '../../generation/generation.service.js';
import { EvalRunnerService } from '../eval-runner.service.js';
import { GradingService } from '../grading.service.js';
import { EvalFeedbackService } from '../eval-feedback.service.js';
import { EvalSuggestionService } from '../eval-suggestion.service.js';
import { PromptLoaderService } from '../../generation/prompts/prompt-loader.service.js';
import { runInBatches } from '../../common/utils/run-in-batches.js';
import { DRAFT_STORE, type IDraftStore } from './draft-store.interface.js';

interface FailureCluster {
  name: 'format' | 'tone' | 'completeness' | 'accuracy' | 'length' | 'other';
  count: number;
  failedAssertionDescriptions: string[];
}

/** Sub-steps reported via the `iteration-progress` SSE event. */
type ProgressSubStep = 'running-train' | 'analyzing' | 'improving' | 'running-test';

/** Run-level mutable accumulators threaded through the optimization loop. */
interface OptimizationLoopState {
  currentDraft: SkillDraft;
  iterations: IterationState[];
  accumulatedCost: number;
  /** Highest-scoring iteration so far, used by the regression guard. */
  bestDraft: { iteration: number; draft: SkillDraft } | null;
}

/** Message shared by the cancellation error and the catch-block detection. */
const OPTIMIZATION_CANCELLED_MESSAGE = 'Optimization cancelled';

/**
 * Thrown when an optimization run is aborted mid-flight. Carries the name
 * 'AbortError' so callers (and the loop's own catch) recognise it as a clean
 * cancellation rather than a failure.
 */
class OptimizationCancelledError extends Error {
  constructor() {
    super(OPTIMIZATION_CANCELLED_MESSAGE);
    this.name = 'AbortError';
  }
}

/**
 * Orchestrates the automated optimization loop (C2).
 *
 * For each iteration:
 *   1. Runs train evals against the current in-memory draft
 *   2. Analyzes failures
 *   3. Improves the draft via optimizeDraft(draftContext)
 *   4. Runs test evals (blinded — never shown to improvement)
 *   5. Saves draft + scores to DraftStore
 *
 * Emits progress events via an rxjs Subject piped to SSE.
 * Cancellation is handled via AbortSignal from req.on('close').
 */
@Injectable()
export class SkillOptimizationService implements OnModuleDestroy {
  private readonly logger = new Logger(SkillOptimizationService.name);

  /** Concurrency limit for eval execution within the optimization loop.
   *  Higher than EvalExecutionService.EVAL_CONCURRENCY (3) because optimization
   *  reports progress at iteration level — no per-eval SSE events to manage. */
  private static readonly OPT_EVAL_CONCURRENCY = 5;

  /** Error message thrown when the optimization loop is cancelled via AbortSignal.
   *  Used to distinguish clean cancellation from real errors in the catch block. */
  private static readonly CANCELLATION_MESSAGE = OPTIMIZATION_CANCELLED_MESSAGE;

  /**
   * Per-token cost used to ESTIMATE eval/grading cost from raw token counts.
   *
   * NOTE: these are Anthropic Claude Sonnet list prices ($3/$15 per MTok). The
   * runtime is provider-agnostic (Strands), so for Azure/Bedrock/OpenAI/Google
   * this figure is an approximation only — it is a rough budget signal, not a
   * billed amount. Agent calls report real cost via stats.costUsd separately.
   */
  private static readonly INPUT_COST_PER_TOKEN = 3 / 1_000_000;   // $3/MTok
  private static readonly OUTPUT_COST_PER_TOKEN = 15 / 1_000_000; // $15/MTok

  /**
   * Multiplier approximating grading cost on top of execution token cost
   * (grading calls sendMessage, but its usage isn't returned to this loop).
   */
  private static readonly GRADING_COST_MULTIPLIER = 1.25;

  /** Track active optimization signals so we can abort them on server shutdown. */
  private readonly activeSignals = new Set<AbortController>();

  constructor(
    @Inject(DRAFT_STORE) private readonly draftStore: IDraftStore,
    @Inject(EVAL_REPOSITORY) private readonly evalRepository: IEvalRepository,
    private readonly skillsService: SkillsService,
    private readonly generationService: GenerationService,
    private readonly evalRunnerService: EvalRunnerService,
    private readonly gradingService: GradingService,
    private readonly evalFeedbackService: EvalFeedbackService,
    private readonly promptLoader: PromptLoaderService,
    private readonly evalSuggestionService: EvalSuggestionService,
  ) {}

  /** Abort all active optimization loops on server shutdown (SIGTERM/SIGINT). */
  onModuleDestroy(): void {
    if (this.activeSignals.size > 0) {
      this.logger.warn(`Aborting ${this.activeSignals.size} active optimization loop(s) on shutdown`);
      for (const ac of this.activeSignals) {
        if (!ac.signal.aborted) ac.abort();
      }
      this.activeSignals.clear();
    }
  }

  /**
   * Run the full optimization loop, emitting progress via the Subject.
   * The Subject is created by the controller and piped to the SSE response.
   */
  async runLoop(
    skillId: string,
    config: SkillOptimizationConfig,
    subject: Subject<MessageEvent>,
    abortController: AbortController,
  ): Promise<void> {
    const signal = abortController.signal;
    const optimizationId = uuidv4();
    const startTime = Date.now();

    // Track active loop so onModuleDestroy can abort it on server shutdown
    this.activeSignals.add(abortController);

    try {
      const skill = await this.skillsService.findById(skillId);
      if (!skill) throw new NotFoundException(`Skill ${skillId} not found`);

      const allCases = await this.evalRepository.getEvalCases(skillId);
      if (allCases.length === 0) {
        throw new Error('No eval cases found — create test cases before optimizing');
      }

      const { train, test } = this.splitEvalSet(allCases);

      const feedbackPreamble = await this.loadFeedbackPreamble(skillId, skill.version, config);
      const effectiveConfig = this.resolveEffectiveConfig(config, feedbackPreamble != null);
      // Default eval execution to the deployment model ('main') so the skill is
      // tuned for the model it actually ships on — not the cheaper 'light' model.
      // Optimization accuracy depends on matching the production deployment model.
      const evalModel: 'main' | 'light' = effectiveConfig.evalModel ?? 'main';

      const state: OptimizationLoopState = {
        currentDraft: {
          name: skill.name,
          description: skill.description,
          skillContent: skill.skillContent,
          scripts: skill.scripts ?? [],
          references: skill.references ?? [],
          assets: skill.assets ?? [],
          trainScore: 0,
          testScore: 0,
        },
        iterations: [],
        accumulatedCost: 0,
        bestDraft: null,
      };

      for (let i = 0; i < effectiveConfig.maxIterations; i++) {
        if (signal.aborted) break;
        const iterNum = i + 1;
        const iterStartTime = Date.now();

        // ── Step A: Run evals on TRAIN set ──
        const { trainResults, trainScore, trainPassed } = await this.runTrainEvalPhase(
          state,
          { iterNum, train, test, evalModel, subject, signal },
        );
        if (signal.aborted) break;

        // ── Step B: Analyze failures & improve (except last iteration) ──
        // When feedback is available on the first iteration, force improvement
        // even if all train evals pass — the feedback captures issues not
        // covered by the eval test cases.
        const hasPendingFeedback = i === 0 && feedbackPreamble != null;
        const needsImprovement =
          trainScore < (effectiveConfig.targetPassRate ?? 1.0) || hasPendingFeedback;
        if (i < effectiveConfig.maxIterations - 1 && needsImprovement) {
          await this.runImprovePhase(state, {
            iterNum,
            iterationIndex: i,
            skillId,
            train,
            test,
            trainResults,
            trainScore,
            trainPassed,
            feedbackPreamble,
            subject,
            signal,
          });
          if (signal.aborted) break;
        }

        if (signal.aborted) break;

        // ── Step C: Run evals on TEST set (blinded) ──
        const { testScore, testPassed } = await this.runTestEvalPhase(
          state,
          { iterNum, train, test, trainScore, trainPassed, evalModel, subject, signal },
        );
        if (signal.aborted) break;

        // ── Steps D/E/F/G: regression guard → peak tracking → save → emit ──
        // These share prevBestScore / didRegress / isNewPeak, so they stay
        // together here rather than being split into separate methods.
        const prevBestScore = state.bestDraft?.draft.testScore ?? 0;
        const didRegress = state.bestDraft !== null && testScore < prevBestScore;

        if (didRegress) {
          this.logger.warn(
            `Iteration ${iterNum}: Test score regressed from ${prevBestScore} to ${testScore} — reverting to iteration ${state.bestDraft!.iteration}`,
          );
          this.emit(subject, {
            type: 'regression-detected',
            data: {
              iteration: iterNum,
              prevScore: prevBestScore,
              currentScore: testScore,
              revertedTo: state.bestDraft!.iteration,
            },
          });
          state.currentDraft = { ...state.bestDraft!.draft };
        }

        // isNewPeak = true suppresses early exit so the loop runs one more iteration
        // to validate stability before committing to stop — otherwise the first time
        // we reach the target we might stop without knowing if it holds.
        const isNewPeak = state.bestDraft === null || testScore > prevBestScore;
        if (isNewPeak) {
          state.bestDraft = {
            iteration: iterNum,
            draft: { ...state.currentDraft, trainScore, testScore },
          };
        }

        // If we just reverted due to regression, keep the reverted draft's scores
        // intact. Otherwise stamp the current iteration's scores before saving.
        if (!didRegress) {
          state.currentDraft = { ...state.currentDraft, trainScore, testScore };
        }
        await this.draftStore.save(optimizationId, iterNum, state.currentDraft);

        const iterState: IterationState = {
          iteration: iterNum,
          subStep: 'done',
          trainScore,
          testScore,
          trainPassed,
          trainTotal: train.length,
          testPassed,
          testTotal: test.length,
          totalCost: state.accumulatedCost,
          durationMs: Date.now() - iterStartTime,
        };
        state.iterations.push(iterState);
        this.emit(subject, { type: 'iteration-complete', data: iterState });

        // ── Step H: stop conditions ──
        if (this.shouldStop(state, effectiveConfig, { testScore, hasPendingFeedback, isNewPeak, iterNum })) {
          break;
        }
      }

      this.logger.log(`Optimization loop completed — total cost: $${state.accumulatedCost.toFixed(4)}`);

      await this.assembleAndEmitResult(state, {
        subject,
        optimizationId,
        allCases,
        feedbackApplied: feedbackPreamble != null && state.iterations.length > 1,
        startTime,
      });
    } catch (err) {
      if (!this.isCancellation(err, signal)) {
        this.emit(subject, {
          type: 'optimization-error',
          data: { message: (err as Error).message },
        });
      }
    } finally {
      this.activeSignals.delete(abortController);
      await this.draftStore.cleanup(optimizationId);
    }
  }

  // ── Loop orchestration helpers ───────────────────────────────────────

  /**
   * Load the feedback preamble (user feedback + historical failed runs) when
   * `includeFeedback` is set. Non-fatal: returns undefined on error or when
   * feedback is disabled.
   */
  private async loadFeedbackPreamble(
    skillId: string,
    version: number | undefined,
    config: SkillOptimizationConfig,
  ): Promise<string | undefined> {
    if (!config.includeFeedback) return undefined;
    try {
      return await this.buildFeedbackSection(skillId, version);
    } catch (err) {
      this.logger.warn(`Failed to load feedback for optimization: ${(err as Error).message}`);
      return undefined;
    }
  }

  /**
   * Feedback needs at least 2 iterations: iteration 1 improves with feedback,
   * iteration 2 evaluates the feedback-improved draft. Bump maxIterations when
   * feedback is present but only 1 was requested.
   */
  private resolveEffectiveConfig(
    config: SkillOptimizationConfig,
    hasFeedback: boolean,
  ): SkillOptimizationConfig {
    if (hasFeedback && config.maxIterations < 2) {
      this.logger.log('Bumping maxIterations from 1 to 2 because feedback is included');
      return { ...config, maxIterations: 2 };
    }
    return config;
  }

  /** Emit an `iteration-progress` SSE event, filling shared fields from state. */
  private emitProgress(
    subject: Subject<MessageEvent>,
    state: OptimizationLoopState,
    iterNum: number,
    subStep: ProgressSubStep,
    trainTotal: number,
    testTotal: number,
    fields: {
      trainScore?: number;
      testScore?: number;
      trainPassed?: number;
      evalProgress?: { completed: number; total: number };
    } = {},
  ): void {
    this.emit(subject, {
      type: 'iteration-progress',
      data: {
        iteration: iterNum,
        subStep,
        trainScore: fields.trainScore ?? 0,
        testScore: fields.testScore ?? 0,
        ...(fields.trainPassed !== undefined ? { trainPassed: fields.trainPassed } : {}),
        trainTotal,
        testTotal,
        totalCost: state.accumulatedCost,
        ...(fields.evalProgress ? { evalProgress: fields.evalProgress } : {}),
      },
    });
  }

  /** Step A — run the TRAIN eval set against the current draft. */
  private async runTrainEvalPhase(
    state: OptimizationLoopState,
    p: {
      iterNum: number;
      train: EvalCase[];
      test: EvalCase[];
      evalModel: 'main' | 'light';
      subject: Subject<MessageEvent>;
      signal: AbortSignal;
    },
  ): Promise<{ trainResults: EvalRun[]; trainScore: number; trainPassed: number }> {
    this.emitProgress(p.subject, state, p.iterNum, 'running-train', p.train.length, p.test.length, {
      evalProgress: { completed: 0, total: p.train.length },
    });
    const trainResults = await this.runEvalsInMemory(
      state.currentDraft,
      p.train,
      p.signal,
      p.evalModel,
      (completed, total) =>
        this.emitProgress(p.subject, state, p.iterNum, 'running-train', p.train.length, p.test.length, {
          evalProgress: { completed, total },
        }),
    );
    const { passRate: trainScore, passed: trainPassed } = this.computePassStats(trainResults);
    state.accumulatedCost += this.computeEvalRunsCost(trainResults);
    return { trainResults, trainScore, trainPassed };
  }

  /**
   * Step B — analyze failures and improve the draft. Honors the abort signal at
   * each await point (returns early; the loop then breaks). A draft that fails
   * validation is rejected, keeping the current draft.
   */
  private async runImprovePhase(
    state: OptimizationLoopState,
    p: {
      iterNum: number;
      iterationIndex: number;
      skillId: string;
      train: EvalCase[];
      test: EvalCase[];
      trainResults: EvalRun[];
      trainScore: number;
      trainPassed: number;
      feedbackPreamble?: string;
      subject: Subject<MessageEvent>;
      signal: AbortSignal;
    },
  ): Promise<void> {
    const progressFields = { trainScore: p.trainScore, trainPassed: p.trainPassed };
    this.emitProgress(p.subject, state, p.iterNum, 'analyzing', p.train.length, p.test.length, progressFields);

    // Small delay so the UI shows the "analyzing" step before transitioning.
    await new Promise((r) => setTimeout(r, 500));
    if (p.signal.aborted) return;

    // On the first iteration, include user feedback from the DB if available.
    const feedbackForThisIteration = p.iterationIndex === 0 ? p.feedbackPreamble : undefined;
    const improvementPrompt = await this.buildImprovementPrompt(p.trainResults, feedbackForThisIteration);

    this.emitProgress(p.subject, state, p.iterNum, 'improving', p.train.length, p.test.length, progressFields);

    const improved = await this.generationService.optimizeDraft(
      p.skillId,
      improvementPrompt,
      {
        name: state.currentDraft.name,
        description: state.currentDraft.description,
        skillContent: state.currentDraft.skillContent,
        scripts: state.currentDraft.scripts,
        references: state.currentDraft.references,
        assets: state.currentDraft.assets,
      },
      p.signal,
    );

    // Accumulate cost from the improvement call (agent provides costUsd).
    if (improved.stats?.costUsd) {
      state.accumulatedCost += improved.stats.costUsd;
    } else if (improved.stats) {
      state.accumulatedCost += this.estimateCostFromTokens(
        improved.stats.inputTokens,
        improved.stats.outputTokens,
      );
    }

    if (p.signal.aborted) return;

    // Reject a structurally broken improvement (e.g. removed >30% of section
    // headings, dropped all files in a category) and keep the current draft.
    const hasValidationErrors = improved.validationIssues?.some(
      (issue) => issue.severity === 'error',
    );
    if (hasValidationErrors) {
      this.logger.warn(
        `Iteration ${p.iterNum}: Rejecting improved draft due to validation errors: ` +
          improved
            .validationIssues!.filter((i) => i.severity === 'error')
            .map((i) => i.message)
            .join('; '),
      );
      return;
    }

    state.currentDraft = {
      name: improved.name,
      description: improved.description,
      skillContent: improved.skillContent,
      scripts: improved.scripts ?? [],
      references: improved.references ?? [],
      assets: improved.assets ?? [],
      explanation: improved.explanation,
      trainScore: 0,
      testScore: 0,
    };
  }

  /** Step C — run the (blinded) TEST eval set against the current draft. */
  private async runTestEvalPhase(
    state: OptimizationLoopState,
    p: {
      iterNum: number;
      train: EvalCase[];
      test: EvalCase[];
      trainScore: number;
      trainPassed: number;
      evalModel: 'main' | 'light';
      subject: Subject<MessageEvent>;
      signal: AbortSignal;
    },
  ): Promise<{ testScore: number; testPassed: number }> {
    const progressFields = { trainScore: p.trainScore, trainPassed: p.trainPassed };
    this.emitProgress(p.subject, state, p.iterNum, 'running-test', p.train.length, p.test.length, {
      ...progressFields,
      evalProgress: { completed: 0, total: p.test.length },
    });
    const testResults = await this.runEvalsInMemory(
      state.currentDraft,
      p.test,
      p.signal,
      p.evalModel,
      (completed, total) =>
        this.emitProgress(p.subject, state, p.iterNum, 'running-test', p.train.length, p.test.length, {
          ...progressFields,
          evalProgress: { completed, total },
        }),
    );
    const { passRate: testScore, passed: testPassed } = this.computePassStats(testResults);
    state.accumulatedCost += this.computeEvalRunsCost(testResults);
    return { testScore, testPassed };
  }

  /**
   * Step H — decide whether to stop. Stops when the target pass rate is reached
   * and confirmed stable (not a new peak, no pending feedback), or on plateau.
   */
  private shouldStop(
    state: OptimizationLoopState,
    effectiveConfig: SkillOptimizationConfig,
    p: { testScore: number; hasPendingFeedback: boolean; isNewPeak: boolean; iterNum: number },
  ): boolean {
    if (
      p.testScore >= (effectiveConfig.targetPassRate ?? 1.0) &&
      !p.hasPendingFeedback &&
      !p.isNewPeak
    ) {
      this.logger.log(
        `Target pass rate ${effectiveConfig.targetPassRate} reached at iteration ${p.iterNum} (testScore=${p.testScore})`,
      );
      return true;
    }
    if (this.isPlateaued(state.iterations)) {
      this.logger.log(`Score plateaued at iteration ${p.iterNum}`);
      return true;
    }
    return false;
  }

  /** Assemble the final OptimizationResult and emit `optimization-complete`. */
  private async assembleAndEmitResult(
    state: OptimizationLoopState,
    p: {
      subject: Subject<MessageEvent>;
      optimizationId: string;
      allCases: EvalCase[];
      feedbackApplied: boolean;
      startTime: number;
    },
  ): Promise<void> {
    const best = await this.draftStore.getBest(p.optimizationId);

    // Include the full draft if test score improved over the baseline (iteration
    // 1), OR feedback was applied and the skill was modified (scores may be flat
    // because eval tests don't cover the feedback issues, but content improved).
    const baselineTestScore = state.iterations[0]?.testScore ?? 0;
    const hasImprovement =
      best != null && (best.draft.testScore > baselineTestScore || p.feedbackApplied);

    let coverageGaps: CoverageGapReport | undefined;
    try {
      coverageGaps = this.evalSuggestionService.analyzeCoverageGaps(p.allCases);
      this.logger.log(
        `Coverage gap analysis: score=${coverageGaps.coverageScore}, gaps=[${coverageGaps.gaps.map(({ dimension }) => dimension).join(', ')}]`,
      );
    } catch (err) {
      this.logger.warn(`Coverage gap analysis failed (non-fatal): ${(err as Error).message}`);
    }

    const result: OptimizationResult = {
      bestIteration: hasImprovement ? best : null,
      iterations: state.iterations,
      improvement: {
        trainDelta:
          best && state.iterations.length ? best.draft.trainScore - state.iterations[0].trainScore : 0,
        testDelta:
          best && state.iterations.length ? best.draft.testScore - state.iterations[0].testScore : 0,
      },
      totalCost: state.accumulatedCost,
      durationMs: Date.now() - p.startTime,
      coverageGaps,
    };

    this.emit(p.subject, { type: 'optimization-complete', data: result });
  }

  /** True when an error represents a clean cancellation rather than a failure. */
  private isCancellation(err: unknown, signal: AbortSignal): boolean {
    return (
      signal.aborted ||
      (err as Error)?.message === SkillOptimizationService.CANCELLATION_MESSAGE ||
      (err as Error)?.name === 'AbortError'
    );
  }

  // ── Private helpers ──────────────────────────────────────────────────

  /**
   * Run eval cases against in-memory skill content (no DB writes).
   * Executes with limited concurrency.
   */
  private async runEvalsInMemory(
    skill: Pick<Skill, 'skillContent' | 'scripts' | 'references' | 'assets'>,
    evalCases: EvalCase[],
    signal: AbortSignal,
    evalModel: 'main' | 'light',
    onBatchComplete?: (completed: number, total: number) => void,
  ): Promise<EvalRun[]> {
    // Model selection: execution uses `evalModel` (defaults to 'main' so the skill
    // is tuned for the model it ships on; callers can pass 'light' for cheaper,
    // faster iterations at the cost of fidelity). Grading and skill improvement
    // always use the main model for reasoning precision.
    //
    // Output length is driven by both the skill content (system prompt) and the eval
    // case prompt (user message). Include the longest eval prompt in the budget so
    // complex code-generation cases aren't truncated mid-response, capped at 16000.
    return runInBatches(
      evalCases,
      SkillOptimizationService.OPT_EVAL_CONCURRENCY,
      async (evalCase) => {
        if (signal.aborted) {
          this.logger.warn(`⛔ Optimization eval "${evalCase.name}" cancelled before execution`);
          throw new OptimizationCancelledError();
        }
        // Per-case token budget: use explicit maxOutputTokens when set, otherwise
        // estimate from skill content + prompt length. This prevents truncation for
        // cases that intentionally generate long outputs (full microservices, etc.)
        // while keeping the default low for cheap fast cases.
        // Budget from the full input the model receives: skill content (system),
        // the case prompt, AND the injected context block (eval-runner prepends it
        // to the user message). Omitting context here under-budgets long-context
        // cases and can truncate their output mid-response.
        const inputChars =
          skill.skillContent.length +
          evalCase.prompt.length +
          (evalCase.context?.length ?? 0);
        const maxTokens = evalCase.maxOutputTokens ?? Math.max(
          8192,
          Math.min(Math.ceil(inputChars / 3.5) + 2000, 16000),
        );
        const config = { model: evalModel, maxTokens, temperature: 0, compareBaseline: false };
        const runResult = await this.evalRunnerService.executeEval(evalCase, skill, config, signal);
        if (signal.aborted) {
          this.logger.warn(`⛔ Optimization eval "${evalCase.name}" cancelled after execution, before grading`);
          throw new OptimizationCancelledError();
        }
        const grading = await this.gradingService.gradeRun(
          runResult, evalCase.assertions, evalCase.expectedOutput, skill.skillContent, signal,
        );
        return { ...runResult, grading } as EvalRun;
      },
      { signal, onBatchComplete },
    );
  }

  /** Compute pass statistics from eval runs. */
  private computePassStats(runs: EvalRun[]): { passRate: number; passed: number; total: number } {
    // Exclude runs whose AI grading hit an infrastructure error (gradingError):
    // a transient grader API/timeout failure isn't a skill-quality signal, and
    // counting it as a failure would drag train/test scores down and can trip
    // the regression guard into reverting a genuinely-improved draft. This
    // mirrors the exclusion the benchmark applies to the same runs.
    const scored = runs.filter((r) => !r.grading?.gradingError);
    if (scored.length === 0) return { passRate: 0, passed: 0, total: 0 };
    const passed = scored.filter((r) => r.grading?.overall === 'pass').length;
    return { passRate: passed / scored.length, passed, total: scored.length };
  }

  /**
   * Split eval cases into train (60%) and test (40%) sets.
   * Uses deterministic shuffle based on case ID for reproducibility.
   */
  private splitEvalSet(cases: EvalCase[]): { train: EvalCase[]; test: EvalCase[] } {
    // Deterministic sort by ID for reproducibility
    const sorted = [...cases].sort((a, b) => a.id.localeCompare(b.id));

    // A 60/40 split needs enough cases for the test set to be meaningful. Below
    // MIN_EVAL_CASES_FOR_BLINDED_SPLIT the holdout is empty (≤2 cases) or a single
    // case, which makes the test score a coarse 0/100 and the regression guard
    // fire on noise. For tiny suites, evaluate on the full set for both phases
    // (no blinding) so the score is at least stable — and warn the author to add
    // more cases.
    if (sorted.length < MIN_EVAL_CASES_FOR_BLINDED_SPLIT) {
      this.logger.warn(
        `Only ${sorted.length} eval case(s) — too few for a train/test holdout. ` +
          `Using the full set for both phases (results are not blinded; add ≥${MIN_EVAL_CASES_FOR_BLINDED_SPLIT} cases for a proper split).`,
      );
      // Separate array copies (not the same reference) so downstream logic can't
      // accidentally mutate train and see it reflected in test, or vice versa.
      return { train: [...sorted], test: [...sorted] };
    }

    const splitIndex = Math.ceil(sorted.length * 0.6);
    return {
      train: sorted.slice(0, splitIndex),
      test: sorted.slice(splitIndex),
    };
  }

  /**
   * Detect score plateau: no improvement across the last 3 iterations.
   * Requires at least 3 completed iterations to fire, preventing premature
   * termination when two consecutive iterations happen to score the same.
   * Fires only when the most recent score is no better than the score
   * from 2 iterations ago (covers both regression and persistent flat).
   */
  private isPlateaued(iterations: IterationState[]): boolean {
    if (iterations.length < 3) return false;
    const last3 = iterations.slice(-3);
    return last3[2].testScore <= last3[0].testScore;
  }

  /**
   * Build an improvement prompt from train eval failures using the
   * `optimize-improvement` template.
   *
   * Data-formatting helpers produce the strings that get injected into
   * {{failureSummaries}}, {{feedbackSection}}, {{passingAssertions}},
   * {{focusSection}}, and {{uncertainPassesSection}} placeholders.
   *
   * @param trainResults - Fresh eval run results from the current iteration's train set.
   * @param feedbackPreamble - Optional user feedback from DB, included on the first iteration
   *   when `includeFeedback` is enabled. Subsequent iterations pass undefined.
   */
  private async buildImprovementPrompt(trainResults: EvalRun[], feedbackPreamble?: string): Promise<string> {
    const failureSummaries = this.formatFailureSummaries(trainResults);
    const feedbackSection = feedbackPreamble
      ? `## User Feedback (from previous runs)\n\n${feedbackPreamble}\n\n---\n`
      : '';
    const passingAssertions = this.formatPassingAssertions(trainResults);

    // Cluster failures and target only the top cluster
    const clusters = this.clusterFailures(trainResults);
    const topCluster = clusters[0];
    const focusSection = topCluster
      ? [
          `## Focus for this iteration`,
          `Fix: **${topCluster.name}** (${topCluster.count} failure${topCluster.count !== 1 ? 's' : ''})`,
          clusters.length > 1
            ? `Defer: ${clusters.slice(1).map(c => `${c.name} (${c.count} failure${c.count !== 1 ? 's' : ''})`).join(', ')} — fix these in a future iteration, not this one`
            : '',
        ].filter(Boolean).join('\n')
      : '';

    // Surface low-confidence passes as fragile behaviors
    const uncertainPasses = this.formatUncertainPasses(trainResults);
    const uncertainPassesSection = uncertainPasses
      ? `## Uncertain Passes — Grader confidence was low on these, treat as fragile\n${uncertainPasses}`
      : '';

    return this.promptLoader.render('optimize-improvement', {
      failureSummaries,
      feedbackSection,
      passingAssertions,
      focusSection,
      uncertainPassesSection,
    });
  }

  /**
   * Group failed assertion results from train eval runs into clusters by theme.
   * Uses keyword matching on evidence strings — deterministic, no LLM call.
   * Returns clusters sorted by count descending (largest cluster first).
   */
  private clusterFailures(runs: EvalRun[]): FailureCluster[] {
    const CLUSTER_KEYWORDS: Record<FailureCluster['name'], string[]> = {
      format:       ['structure', 'heading', 'list', 'markdown', 'format', 'section header'],
      tone:         ['formal', 'casual', 'assertive', 'hedging', 'tone', 'voice'],
      completeness: ['missing', 'omitted', 'not included', 'absent', 'incomplete'],
      accuracy:     ['incorrect', 'wrong', 'contradicts', 'inaccurate', 'factually wrong', 'false claim'],
      length:       ['too long', 'too short', 'verbose', 'brief', 'concise', 'truncated'],
      other:        [],
    };

    const clusterMap = new Map<FailureCluster['name'], FailureCluster>();

    for (const run of runs) {
      const failedResults = run.grading?.assertionResults?.filter(a => !a.passed) ?? [];
      for (const result of failedResults) {
        const evidence = (result.evidence ?? '').toLowerCase();
        let matched: FailureCluster['name'] = 'other';

        for (const [clusterName, keywords] of Object.entries(CLUSTER_KEYWORDS) as Array<[FailureCluster['name'], string[]]>) {
          if (clusterName === 'other') continue;
          if (keywords.some(kw => evidence.includes(kw))) {
            matched = clusterName;
            break;
          }
        }

        if (!clusterMap.has(matched)) {
          clusterMap.set(matched, { name: matched, count: 0, failedAssertionDescriptions: [] });
        }
        const cluster = clusterMap.get(matched)!;
        cluster.count++;
        const label = result.assertion?.description ?? result.assertion?.value ?? 'unknown';
        if (!cluster.failedAssertionDescriptions.includes(label)) {
          cluster.failedAssertionDescriptions.push(label);
        }
      }
    }

    return [...clusterMap.values()].sort((a, b) => b.count - a.count);
  }

  /**
   * Return a numbered list of passing assertions with confidence < 0.7.
   * These are surfaced in the improvement prompt as "uncertain passes" —
   * behaviors the grader wasn't confident about, so the optimizer should
   * treat them as fragile and avoid changing them.
   */
  private formatUncertainPasses(runs: EvalRun[]): string {
    const UNCERTAIN_THRESHOLD = 0.7;
    const MAX_UNCERTAIN = 8;
    const uncertain: string[] = [];

    for (const run of runs) {
      const results = run.grading?.assertionResults ?? [];
      for (const r of results) {
        if (r.passed && typeof r.confidence === 'number' && r.confidence < UNCERTAIN_THRESHOLD) {
          const label = r.assertion?.description ?? r.assertion?.value ?? 'unknown assertion';
          if (!uncertain.includes(label)) uncertain.push(label);
        }
        if (uncertain.length >= MAX_UNCERTAIN) break;
      }
      if (uncertain.length >= MAX_UNCERTAIN) break;
    }

    if (uncertain.length === 0) return '';
    return uncertain.map((d, i) => `${i + 1}. ${d}`).join('\n');
  }

  /**
   * Format train eval results into a structured summary for the template.
   * Extracts failed cases with their assertion evidence.
   */
  private formatFailureSummaries(trainResults: EvalRun[]): string {
    const failed = trainResults.filter(r => r.grading?.overall !== 'pass');

    if (failed.length === 0) {
      return 'All training eval cases passed. Focus on improving edge case handling and output quality.';
    }

    const summaries = failed.map((r) => {
      const failedAssertions = r.grading?.assertionResults
        ?.filter(a => !a.passed)
        .map(a => `  ✗ ${a.assertion?.type ?? 'unknown'}: <grader_evidence>${a.evidence ?? 'No evidence'}</grader_evidence>`)
        .join('\n') ?? 'No details';

      const raw = r.outputWithSkill ?? '';
      const truncated = raw.length > 300 ? raw.substring(0, 300) + '...' : raw;

      return (
        `FAILED: <eval_prompt>${r.prompt}</eval_prompt>\n` +
        `Output: <eval_output>${truncated}</eval_output>\n` +
        `Failed assertions:\n${failedAssertions}`
      );
    });

    return (
      `${failed.length} out of ${trainResults.length} training eval cases FAILED:\n\n` +
      summaries.join('\n\n---\n\n')
    );
  }

  /**
   * Format currently-passing assertions from train eval results
   * into a flat numbered list for the preservation contract in the improvement prompt.
   *
   * Filters at the assertion level (not run level) to capture passing assertions
   * from partial runs. Deduplicates by label string. Capped at 10 to bound prompt growth.
   * Never returns empty string — returns a clear message when nothing passes.
   */
  private formatPassingAssertions(trainResults: EvalRun[]): string {
    const MAX_PASSING = 10;

    const passingDescriptions: string[] = [];
    for (const r of trainResults) {
      const passingResults = r.grading?.assertionResults?.filter(a => a.passed) ?? [];
      for (const a of passingResults) {
        const label = a.assertion.description ?? a.assertion.value;
        if (label && !passingDescriptions.includes(label)) {
          passingDescriptions.push(label);
        }
        if (passingDescriptions.length >= MAX_PASSING) break;
      }
      if (passingDescriptions.length >= MAX_PASSING) break;
    }

    if (passingDescriptions.length === 0) {
      return 'No assertions are currently passing.';
    }

    return passingDescriptions
      .map((d, i) => `${i + 1}. <assertion>${d}</assertion>`)
      .join('\n');
  }

  /**
   * Build the feedback section string from DB-stored feedback and historical
   * failed runs. Returns undefined if no improvement data is found.
   */
  private async buildFeedbackSection(skillId: string, version?: number): Promise<string | undefined> {
    const [feedbackList, evalRuns] = await Promise.all([
      this.evalFeedbackService.getFeedbackBySkill(skillId),
      this.evalRepository.getEvalRuns(skillId, version),
    ]);

    // Filter feedback to only include items linked to current-version runs
    const runIds = new Set(evalRuns.map(r => r.id));
    const negativeFeedback = feedbackList.filter(
      fb => (fb.rating === 'bad' || fb.rating === 'neutral') && runIds.has(fb.runId),
    );
    const problemRuns = evalRuns.filter(r =>
      r.status === 'failed' || r.grading?.overall === 'fail' || r.grading?.overall === 'partial',
    );

    if (negativeFeedback.length === 0 && problemRuns.length === 0) {
      return undefined;
    }

    const parts: string[] = [];

    if (negativeFeedback.length > 0) {
      parts.push(`### User Feedback (${negativeFeedback.length} negative/neutral)\n`);
      for (const fb of negativeFeedback.slice(0, 10)) {
        parts.push(`- [${fb.rating}] <user_feedback>${fb.feedback}</user_feedback>`);
        if (fb.suggestedFix) {
          parts.push(`  - Suggested fix: <user_feedback>${fb.suggestedFix}</user_feedback>`);
        }
      }
      parts.push('');
    }

    if (problemRuns.length > 0) {
      parts.push(`### Historical Failed/Partial Runs (${problemRuns.length})\n`);
      for (const run of problemRuns.slice(0, 8)) {
        const failedAssertions = run.grading?.assertionResults
          ?.filter(a => !a.passed)
          .slice(0, 3)
          .map(a => `  ✗ ${a.assertion?.type ?? 'unknown'}: ${a.evidence ?? 'No evidence'}`)
          .join('\n') ?? '';
        parts.push(`- <eval_prompt>${run.prompt}</eval_prompt> → ${run.grading?.overall ?? 'failed'}`);
        if (failedAssertions) parts.push(failedAssertions);
      }
      parts.push('');
    }

    this.logger.log(
      `Loaded ${negativeFeedback.length} feedback items + ${problemRuns.length} problem runs for first iteration`,
    );

    return parts.join('\n');
  }

  /**
   * Compute estimated cost from a batch of eval runs based on token usage.
   * Covers both eval execution tokens and grading tokens (grading typically
   * uses ~1/4 as many tokens as execution — included as a 1.25x multiplier).
   */
  private computeEvalRunsCost(runs: EvalRun[]): number {
    let totalInput = 0;
    let totalOutput = 0;
    for (const run of runs) {
      totalInput += run.timing?.inputTokens ?? 0;
      totalOutput += run.timing?.outputTokens ?? 0;
    }
    return (
      this.estimateCostFromTokens(totalInput, totalOutput) *
      SkillOptimizationService.GRADING_COST_MULTIPLIER
    );
  }

  /**
   * Estimate USD cost from raw token counts. Uses Anthropic Sonnet list pricing
   * as an approximation — see INPUT/OUTPUT_COST_PER_TOKEN for the caveat on
   * non-Anthropic providers.
   */
  private estimateCostFromTokens(inputTokens: number, outputTokens: number): number {
    return (
      inputTokens * SkillOptimizationService.INPUT_COST_PER_TOKEN +
      outputTokens * SkillOptimizationService.OUTPUT_COST_PER_TOKEN
    );
  }

  /** Emit a typed SSE event via the rxjs Subject. */
  private emit(subject: Subject<MessageEvent>, event: OptimizationEvent): void {
    subject.next({ data: JSON.stringify(event) } as MessageEvent);
  }
}
