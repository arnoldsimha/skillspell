import {
  Injectable,
  Inject,
  NotFoundException,
  Logger,
} from '@nestjs/common';
import { Subject } from 'rxjs';
import { formatError } from '../common/utils/format-error.js';
import { runInBatches } from '../common/utils/run-in-batches.js';
import {
  EVAL_REPOSITORY,
  type IEvalRepository,
  type EvalCase,
  type EvalRun,
  type EvalRunEvent,
  type EvalGrading,
  type EvalBenchmark,
  type Skill,
} from '@skillspell/shared';
import { SkillsService } from '../skills/skills.service.js';
import { EvalRunnerService } from './eval-runner.service.js';

import { GradingService } from './grading.service.js';
import { BenchmarkService } from './benchmark.service.js';
import type { RunEvalsDto } from './dto/run-evals.dto.js';
import { v4 as uuidv4 } from 'uuid';

/**
 * Handles eval execution, grading, benchmark aggregation, and run management.
 *
 * Extracted from EvalService to follow single-responsibility.
 */
@Injectable()
export class EvalExecutionService {
  private readonly logger = new Logger(EvalExecutionService.name);

  /** Maximum number of eval cases to run concurrently. */
  private static readonly EVAL_CONCURRENCY = 3;

  /**
   * N5: In-flight dedup map — prevents duplicate eval runs when users
   * double-click "Run Evals". Key = `skillId:evalCaseId:skillVersion`,
   * value = the Promise of the in-progress run. Cleaned up in `finally`.
   * Same pattern as `diagramInflight` in generation.service.ts.
   */
  private readonly evalInflight = new Map<string, Promise<EvalRun>>();

  constructor(
    @Inject(EVAL_REPOSITORY)
    private readonly evalRepository: IEvalRepository,
    private readonly skillsService: SkillsService,
    private readonly evalRunnerService: EvalRunnerService,
    private readonly gradingService: GradingService,
    private readonly benchmarkService: BenchmarkService,
  ) {}

  // ── Shared setup ────────────────────────────────────────────────────

  /**
   * Prepare the data needed to execute eval runs: resolve skill content,
   * filter eval cases, expand by runsPerCase, determine iteration number.
   *
   * Shared between `runEvals()` and `runEvalsStreamed()` to avoid duplication.
   */
  private async prepareEvalRun(
    skillId: string,
    dto: RunEvalsDto,
  ): Promise<{
    skill: Pick<Skill, 'skillContent' | 'scripts' | 'references' | 'assets'>;
    skillVersion: number;
    allEvalCases: EvalCase[];
    expandedCases: EvalCase[];
    existingRuns: EvalRun[];
    currentIteration: number;
  } | null> {
    const skillEntity = await this.skillsService.findById(skillId);

    // Resolve skill — use a specific version snapshot if targetVersion is set
    let resolvedSkill: Pick<Skill, 'skillContent' | 'scripts' | 'references' | 'assets'>;
    let skillVersion: number;

    if (dto.targetVersion != null) {
      const snapshot = await this.skillsService.getVersionSnapshot(
        skillId,
        dto.targetVersion,
      );
      resolvedSkill = {
        skillContent: snapshot.skillContent,
        scripts: snapshot.scripts ?? [],
        references: snapshot.references ?? [],
        assets: snapshot.assets ?? [],
      };
      skillVersion = snapshot.version;
      this.logger.log(
        `Using version snapshot v${skillVersion} (requested targetVersion=${dto.targetVersion})`,
      );
    } else {
      resolvedSkill = {
        skillContent: skillEntity.skillContent,
        scripts: skillEntity.scripts ?? [],
        references: skillEntity.references ?? [],
        assets: skillEntity.assets ?? [],
      };
      skillVersion = skillEntity.version ?? 1;
      this.logger.log(
        `Using current skill version v${skillVersion} (skillContent: ${skillEntity.skillContent?.length ?? 0} chars)`,
      );
    }

    // Get eval cases to run
    const allEvalCases = await this.evalRepository.getEvalCases(skillId);
    let evalCases: EvalCase[];

    if (dto.evalIds && dto.evalIds.length > 0) {
      const requestedIds = new Set(dto.evalIds);
      evalCases = allEvalCases.filter((ec) => requestedIds.has(ec.id));

      if (evalCases.length === 0) {
        this.logger.warn(
          `None of the requested eval IDs were found: ${dto.evalIds.join(', ')}`,
        );
        return null;
      }

      this.logger.log(
        `Running ${evalCases.length} specific eval cases (${dto.evalIds.length} requested)`,
      );
    } else {
      evalCases = allEvalCases;
      this.logger.log(
        `Running all ${evalCases.length} eval cases for skill ${skillId}`,
      );
    }

    // Filter by version (only include test cases that existed at that version)
    if (dto.targetVersion != null) {
      const beforeFilter = evalCases.length;
      evalCases = evalCases.filter(
        (ec) => (ec.createdAtVersion ?? 1) <= dto.targetVersion!,
      );
      if (beforeFilter !== evalCases.length) {
        this.logger.log(
          `Filtered eval cases for v${dto.targetVersion}: ${evalCases.length} of ${beforeFilter} ` +
            `(excluded ${beforeFilter - evalCases.length} cases created after v${dto.targetVersion})`,
        );
      }
    }

    if (evalCases.length === 0) {
      this.logger.warn(`No eval cases found for skill ${skillId}`);
      return null;
    }

    // Determine iteration number from existing runs
    const existingRuns = await this.evalRepository.getEvalRuns(skillId);
    const maxIteration = existingRuns.reduce(
      (max, r) => Math.max(max, r.iteration ?? 0),
      0,
    );
    const currentIteration = maxIteration + 1;

    this.logger.log(
      `Starting iteration ${currentIteration} (skill version ${skillVersion})`,
    );

    // Expand eval cases by runsPerCase (default: 1)
    const runsPerCase = dto.runsPerCase ?? 1;
    const expandedCases: EvalCase[] = [];
    for (let r = 0; r < runsPerCase; r++) {
      expandedCases.push(...evalCases);
    }

    this.logger.log(
      `Executing ${evalCases.length} eval cases x ${runsPerCase} runs = ` +
        `${expandedCases.length} total runs with concurrency ${EvalExecutionService.EVAL_CONCURRENCY}`,
    );

    return {
      skill: resolvedSkill,
      skillVersion,
      allEvalCases,
      expandedCases,
      existingRuns,
      currentIteration,
    };
  }

  /**
   * Persist benchmark snapshots after eval runs (aggregation-on-write).
   * Non-fatal — errors are logged but don't fail the run.
   */
  private async persistBenchmarks(
    skillId: string,
    allEvalCases: EvalCase[],
    existingRuns: EvalRun[],
    newRuns: EvalRun[],
    skillVersion: number,
  ): Promise<void> {
    try {
      const allEvalRuns = [...existingRuns, ...newRuns];

      // Global benchmark — aggregates ALL runs across ALL versions
      const benchmark = this.benchmarkService.computeBenchmark(
        skillId,
        allEvalCases,
        allEvalRuns,
      );
      await this.evalRepository.saveBenchmarkSnapshot(skillId, benchmark);

      // Version-specific benchmark
      if (skillVersion !== undefined) {
        const versionBenchmark = this.benchmarkService.computeBenchmark(
          skillId,
          allEvalCases,
          allEvalRuns,
          skillVersion,
        );
        await this.evalRepository.saveBenchmarkSnapshot(
          skillId,
          versionBenchmark,
          skillVersion,
        );
      }
    } catch (err) {
      this.logger.warn(
        `Failed to persist benchmark snapshot for skill ${skillId}: ${err}`,
      );
    }
  }

  // ── Public methods ──────────────────────────────────────────────────

  /**
   * Run eval cases for a skill.
   *
   * Executes eval cases in parallel (up to 3 concurrently) by sending prompts
   * to Claude via the Messages API with the skill content as the system prompt.
   * Optionally runs a baseline comparison without the skill. After execution,
   * each run is graded against its assertions using the GradingService.
   * Results are stored in the repository.
   *
   * Ownership is enforced by SkillOwnerGuard via @CheckOwnership on the route.
   */
  async runEvals(skillId: string, dto: RunEvalsDto): Promise<EvalRun[]> {
    this.logger.log(`runEvals called for skill ${skillId}`);

    const setup = await this.prepareEvalRun(skillId, dto);
    if (!setup) return [];

    const { skill, skillVersion, allEvalCases, expandedCases, existingRuns, currentIteration } = setup;

    const runs = await runInBatches(
      expandedCases,
      EvalExecutionService.EVAL_CONCURRENCY,
      (evalCase, runIndex) =>
        this.executeAndGradeEval(
          evalCase,
          skill,
          skillId,
          dto,
          currentIteration,
          skillVersion,
          undefined,
          runIndex,
        ),
      {
        onBatchStart: (batchIndex, batch, startOffset) =>
          this.logger.log(
            `Running eval batch ${batchIndex + 1}: ` +
              `runs ${startOffset + 1}-${startOffset + batch.length} of ${expandedCases.length}`,
          ),
      },
    );

    this.logger.log(
      `runEvals complete for skill ${skillId}: ` +
        `${runs.filter((r) => r.status === 'completed').length} succeeded, ` +
        `${runs.filter((r) => r.status === 'failed').length} failed ` +
        `(${expandedCases.length} runs)`,
    );

    await this.persistBenchmarks(skillId, allEvalCases, existingRuns, runs, skillVersion);

    return runs;
  }

  /**
   * Run eval cases with SSE progress streaming.
   *
   * Same logic as `runEvals()` but emits per-eval progress events via a
   * Subject that the controller pipes to an SSE response. Supports
   * cancellation via AbortSignal from the request's 'close' event.
   *
   * The final `eval-run-complete` event does NOT include the full EvalRun[]
   * payload — the frontend uses React Query cache invalidation to refetch.
   * This avoids sending potentially large output strings over SSE.
   */
  async runEvalsStreamed(
    skillId: string,
    dto: RunEvalsDto,
    subject: Subject<MessageEvent>,
    abortController: AbortController,
  ): Promise<void> {
    const signal = abortController.signal;
    const globalStart = Date.now();

    try {
      const setup = await this.prepareEvalRun(skillId, dto);
      if (!setup) {
        this.emitEvalEvent(subject, {
          type: 'eval-run-complete',
          data: { totalRuns: 0, passed: 0, failed: 0, durationMs: 0 },
        });
        return;
      }

      const { skill, skillVersion, allEvalCases, expandedCases, existingRuns, currentIteration } = setup;
      const totalToRun = expandedCases.length;

      // ── Execute with progress events ──────────────────────────────
      const runs: EvalRun[] = [];

      for (
        let i = 0;
        i < expandedCases.length;
        i += EvalExecutionService.EVAL_CONCURRENCY
      ) {
        if (signal.aborted) {
          this.logger.log(`⛔ Eval run aborted between batches (client disconnected)`);
          break;
        }

        const batch = expandedCases.slice(
          i,
          i + EvalExecutionService.EVAL_CONCURRENCY,
        );

        // Emit "started" for each eval in this batch (use global index for unique tracking)
        batch.forEach((evalCase, batchIdx) => {
          const index = i + batchIdx + 1;
          this.emitEvalEvent(subject, {
            type: 'eval-started',
            data: {
              evalId: evalCase.id,
              evalName: evalCase.name,
              index,
              total: totalToRun,
              phase: 'executing',
            },
          });
        });

        const batchResults = await Promise.all(
          batch.map(async (evalCase, batchIdx) => {
            const index = i + batchIdx + 1;
            // 0-based absolute position, used as the dedup runIndex. Kept distinct
            // from the 1-based `index` (a display ordinal) so the dedup key matches
            // the batched (runInBatches) path's 0-based index — two entry points
            // for the same skill/version stay coalescible.
            const runIndex = i + batchIdx;
            const evalStart = Date.now();

            const result = await this.executeAndGradeEval(
              evalCase,
              skill,
              skillId,
              dto,
              currentIteration,
              skillVersion,
              signal,
              runIndex,
            );

            // Emit "completed" for this eval (use index for unique matching on frontend)
            this.emitEvalEvent(subject, {
              type: 'eval-completed',
              data: {
                evalId: evalCase.id,
                evalName: evalCase.name,
                index,
                total: totalToRun,
                status: result.status === 'failed' ? 'failed' : 'completed',
                score: result.grading?.score,
                overall: result.grading?.overall,
                durationMs: Date.now() - evalStart,
              },
            });

            return result;
          }),
        );

        runs.push(...batchResults);
      }

      // ── Persist benchmarks (shared helper) ─────────────────────────
      await this.persistBenchmarks(skillId, allEvalCases, existingRuns, runs, skillVersion);

      // ── Final complete event (lightweight — no full EvalRun[] payload) ──
      const passed = runs.filter((r) => r.status === 'completed').length;
      const failed = runs.filter((r) => r.status === 'failed').length;

      this.emitEvalEvent(subject, {
        type: 'eval-run-complete',
        data: {
          totalRuns: runs.length,
          passed,
          failed,
          durationMs: Date.now() - globalStart,
        },
      });
    } catch (err) {
      if (!signal.aborted) {
        this.emitEvalEvent(subject, {
          type: 'eval-run-error',
          data: {
            message: err instanceof Error ? err.message : 'Eval run failed',
          },
        });
      }
    }
  }


  /** Emit a typed SSE event via the rxjs Subject. */
  private emitEvalEvent(
    subject: Subject<MessageEvent>,
    event: EvalRunEvent,
  ): void {
    subject.next({ data: JSON.stringify(event) } as MessageEvent);
  }

  /**
   * Execute a single eval case: run the prompt, grade the output, and persist
   * the result. Returns either a completed or failed EvalRun — never throws.
   */
  private async executeAndGradeEval(
    evalCase: EvalCase,
    skill: Pick<Skill, 'skillContent' | 'scripts' | 'references' | 'assets'>,
    skillId: string,
    dto: RunEvalsDto,
    iteration?: number,
    skillVersion?: number,
    signal?: AbortSignal,
    runIndex = 0,
  ): Promise<EvalRun> {
    // N5: Dedup guard — if an identical run is in progress, return its promise.
    // The runIndex is part of the key so that multiple runs of the SAME case in
    // one batch (runsPerCase > 1) are NOT collapsed into a single execution —
    // they have distinct indices. Two concurrent double-click requests still
    // dedup because they reproduce the same per-index keys.
    const dedupKey = `${skillId}:${evalCase.id}:${skillVersion ?? 0}:${runIndex}`;
    const inflight = this.evalInflight.get(dedupKey);
    if (inflight) {
      this.logger.log(
        `N5 dedup: eval for "${evalCase.name}" (v${skillVersion}) already in flight — reusing`,
      );
      return inflight;
    }

    const promise = this.doExecuteAndGrade(
      evalCase,
      skill,
      skillId,
      dto,
      iteration,
      skillVersion,
      signal,
    );
    this.evalInflight.set(dedupKey, promise);
    try {
      return await promise;
    } finally {
      this.evalInflight.delete(dedupKey);
    }
  }

  /**
   * Internal: Execute a single eval case, grade it, and persist the result.
   * Separated from executeAndGradeEval to support N5 dedup wrapping.
   */
  private async doExecuteAndGrade(
    evalCase: EvalCase,
    skill: Pick<Skill, 'skillContent' | 'scripts' | 'references' | 'assets'>,
    skillId: string,
    dto: RunEvalsDto,
    iteration?: number,
    skillVersion?: number,
    signal?: AbortSignal,
  ): Promise<EvalRun> {
    try {
      this.logger.log(
        `Executing eval case "${evalCase.name}" (${evalCase.id})`,
      );

      // Execute the eval (returns everything except grading)
      // Check abort before LLM call
      if (signal?.aborted) {
        this.logger.warn(`⛔ Eval "${evalCase.name}" cancelled before execution`);
        throw new Error('Request cancelled by client');
      }
      // Merge per-case maxOutputTokens into the caller config when set.
      // This ensures cases created with explicit token budgets (e.g. full
      // microservice generators) aren't truncated by the default config value.
      const effectiveConfig = evalCase.maxOutputTokens
        ? { ...dto.config, maxTokens: evalCase.maxOutputTokens }
        : dto.config;
      const runResult = await this.evalRunnerService.executeEval(
        evalCase,
        skill,
        effectiveConfig,
        signal,
      );

      // Check abort between execution and grading — the LLM call may have
      // completed just as cancel was requested
      if (signal?.aborted) {
        this.logger.warn(`⛔ Eval "${evalCase.name}" cancelled after execution, before grading`);
        throw new Error('Request cancelled by client');
      }

      // Grade with-skill and baseline in parallel — they're completely independent
      const [grading, baselineGrading] = await Promise.all([
        this.gradingService.gradeRun(
          runResult,
          evalCase.assertions,
          evalCase.expectedOutput,
          skill.skillContent,
          signal,
        ),
        dto.config.compareBaseline && runResult.outputWithoutSkill
          ? this.gradingService.gradeRun(
              { ...runResult, id: `${runResult.id}/baseline`, outputWithSkill: runResult.outputWithoutSkill },
              evalCase.assertions,
              evalCase.expectedOutput,
              undefined,
              signal,
              true, // isBaseline — strips summary, claims, and feedback
            )
          : Promise.resolve(undefined),
      ]);

      // Don't persist if cancelled after grading completed
      if (signal?.aborted) {
        this.logger.warn(`⛔ Eval "${evalCase.name}" cancelled after grading, before persist`);
        throw new Error('Request cancelled by client');
      }

      // Create the full EvalRun with real grading and iteration data
      const evalRun: EvalRun = {
        ...runResult,
        grading,
        baselineGrading,
        iteration,
        skillVersion,
      };

      // Save the run to the repository
      const savedRun = await this.evalRepository.createEvalRun(evalRun);

      this.logger.log(
        `Eval run ${savedRun.id} completed for "${evalCase.name}" — ` +
          `grading: ${grading.overall} (score: ${grading.score}), ` +
          `${savedRun.timing.durationMs}ms, ${savedRun.timing.totalTokens} tokens`,
      );

      return savedRun;
    } catch (error) {
      // Re-throw abort errors so they propagate up and stop the batch
      if (signal?.aborted) {
        throw error;
      }

      this.logger.error(
        `Eval run failed for "${evalCase.name}" (${evalCase.id}): ${formatError(error)}`,
      );

      // Create a failed run record so the failure is tracked
      const failedRun: EvalRun = {
        id: uuidv4(),
        evalId: evalCase.id,
        skillId,
        config: dto.config,
        prompt: evalCase.prompt,
        outputWithSkill: '',
        outputFiles: [],
        grading: {
          overall: 'fail',
          score: 0,
          assertionResults: [],
          gradedAt: new Date().toISOString(),
          gradedBy: 'auto',
        },
        timing: {
          durationMs: 0,
          inputTokens: 0,
          outputTokens: 0,
          totalTokens: 0,
        },
        status: 'failed',
        error: error instanceof Error ? error.message : 'Unknown error',
        iteration,
        skillVersion,
        createdAt: new Date().toISOString(),
      };

      const savedRun = await this.evalRepository.createEvalRun(failedRun);
      return savedRun;
    }
  }

  /**
   * Delete an eval run and its associated feedback.
   *
   * Ownership is enforced by SkillOwnerGuard via @CheckOwnership on the route.
   */
  async deleteEvalRun(skillId: string, runId: string): Promise<void> {
    this.logger.log(
      `deleteEvalRun called for run ${runId} in skill ${skillId}`,
    );

    // Single-item lookup by composite key (efficient — no scan)
    const existing = await this.evalRepository.getEvalRunBySkillAndId(
      skillId,
      runId,
    );
    if (!existing) {
      throw new NotFoundException(
        `Eval run ${runId} not found for skill ${skillId}`,
      );
    }

    // Use the efficient composite-key delete (defined on IEvalRepository)
    await this.evalRepository.deleteEvalRunBySkillAndId(skillId, runId);

    // Delete associated feedback (best-effort, no error if none exists)
    try {
      await this.evalRepository.deleteFeedbackBySkillAndRun(skillId, runId);
    } catch (err) {
      this.logger.warn(
        `Failed to delete feedback for run ${runId}: ${err}`,
      );
    }

    // Invalidate cached benchmark snapshots (lazy re-compute on next read)
    try {
      await this.evalRepository.deleteBenchmarkSnapshots(skillId);
    } catch (err) {
      this.logger.warn(
        `Failed to invalidate benchmark cache after deleting eval run ${runId}: ${err}`,
      );
    }

    this.logger.log(`Deleted eval run ${runId} for skill ${skillId}`);
  }

  /**
   * Get all eval runs for a skill.
   *
   * Ownership is enforced by SkillOwnerGuard via @CheckOwnership on the route.
   */
  async getEvalRuns(skillId: string, version?: number): Promise<EvalRun[]> {
    this.logger.log(`getEvalRuns called for skill ${skillId}${version != null ? ` (version ${version})` : ''}`);
    return this.evalRepository.getEvalRuns(skillId, version);
  }

  /**
   * Get aggregated benchmark statistics for a skill.
   * Optionally filter by a specific skill version.
   *
   * Ownership is enforced by SkillOwnerGuard via @CheckOwnership on the route.
   */
  async getBenchmark(
    skillId: string,
    version?: number,
  ): Promise<EvalBenchmark> {
    this.logger.log(
      `getBenchmark called for skill ${skillId}` +
        (version ? ` (version ${version})` : ''),
    );

    // Try cached snapshot first (aggregation-on-write)
    const cached =
      await this.evalRepository.getBenchmarkSnapshot(skillId, version);
    if (cached) {
      // Normalize legacy v0 → v1 in iteration history (runs created before
      // version tracking defaulted skillVersion to 0 instead of 1)
      if (cached.byIteration) {
        for (const iter of cached.byIteration) {
          if (iter.skillVersion === 0) iter.skillVersion = 1;
        }
      }
      this.logger.log(`Returning cached benchmark for skill ${skillId}`);
      return cached;
    }

    // Cache miss — compute, persist, return
    const benchmark = await this.benchmarkService.aggregateBenchmark(
      skillId,
      version,
    );

    // Persist snapshot non-fatally
    try {
      await this.evalRepository.saveBenchmarkSnapshot(
        skillId,
        benchmark,
        version,
      );
    } catch (err) {
      this.logger.warn(
        `Failed to persist benchmark snapshot for skill ${skillId}: ${err}`,
      );
    }

    return benchmark;
  }
}
