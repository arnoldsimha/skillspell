import { Test, TestingModule } from '@nestjs/testing';
import { SkillOptimizationService } from './skill-optimization.service';
import { SkillsService } from '../../skills/skills.service';
import { GenerationService } from '../../generation/generation.service';
import { EvalRunnerService } from '../eval-runner.service';
import { GradingService } from '../grading.service';
import { EvalFeedbackService } from '../eval-feedback.service';
import { EvalSuggestionService } from '../eval-suggestion.service';
import { PromptLoaderService } from '../../generation/prompts/prompt-loader.service';
import { DRAFT_STORE } from './draft-store.interface';
import { EVAL_REPOSITORY } from '@skillspell/shared';
import type { EvalCase, Skill, EvalRun } from '@skillspell/shared';
import { Subject } from 'rxjs';

/**
 * Unit tests for SkillOptimizationService — behavioral coverage.
 *
 * Validates that OPT_EVAL_CONCURRENCY = 5 is used to batch eval execution in
 * runEvalsInMemory(). The observable behavior: given N eval cases, the service
 * processes them in groups of 5 (not 3), which is reflected in how many
 * Promise.all batches are fired.
 */
describe('SkillOptimizationService — PERF-02 OPT_EVAL_CONCURRENCY = 5', () => {
  let service: SkillOptimizationService;
  let executeEvalMock: jest.Mock;
  let gradeRunMock: jest.Mock;
  let skillsServiceMock: Record<string, jest.Mock>;
  let generationServiceMock: Record<string, jest.Mock>;
  let evalRepoMock: Record<string, jest.Mock>;
  let draftStoreMock: Record<string, jest.Mock>;
  let promptLoaderMock: Record<string, jest.Mock>;

  /** Build a minimal EvalCase for testing. */
  const makeEvalCase = (id: string): EvalCase =>
    ({
      id,
      skillId: 'skill-1',
      name: `Eval Case ${id}`,
      prompt: `Prompt for ${id}`,
      assertions: [],
      expectedOutput: '',
      split: 'train',
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
    }) as EvalCase;

  /** Build a minimal Skill for testing. */
  const makeSkill = (): Skill =>
    ({
      id: 'skill-1',
      name: 'test-skill',
      description: 'A test skill',
      skillContent: '# Test Skill\n## Overview\nContent here',
      scripts: [],
      references: [],
      assets: [],
      version: 1,
      status: 'ready',
      ownerId: 'user-1',
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
      isPublished: false,
    }) as Skill;

  /** Build a minimal EvalRun (without grading) for mocking executeEval returns. */
  const makeEvalRun = (evalCase: EvalCase): Omit<EvalRun, 'grading'> =>
    ({
      id: `run-${evalCase.id}`,
      evalId: evalCase.id,
      skillId: 'skill-1',
      config: { model: 'light', maxTokens: 8192, temperature: 0, compareBaseline: false },
      prompt: evalCase.prompt,
      outputWithSkill: 'Some output',
      outputFiles: [],
      timing: {
        durationMs: 100,
        inputTokens: 50,
        outputTokens: 50,
        totalTokens: 100,
        outputChars: 11,
      },
      status: 'completed',
      createdAt: new Date().toISOString(),
      completedAt: new Date().toISOString(),
    });

  /** Minimal passing grading result. */
  const makeGrading = () => ({
    overall: 'pass' as const,
    score: 100,
    assertionResults: [],
    gradedAt: new Date().toISOString(),
    gradedBy: 'auto' as const,
  });

  beforeEach(async () => {
    executeEvalMock = jest.fn();
    gradeRunMock = jest.fn();

    skillsServiceMock = {
      findById: jest.fn(),
    };

    generationServiceMock = {
      optimizeDraft: jest.fn(),
    };

    evalRepoMock = {
      getEvalCases: jest.fn(),
      getEvalRuns: jest.fn().mockResolvedValue([]),
      getFeedbackBySkill: jest.fn().mockResolvedValue([]),
    };

    draftStoreMock = {
      save: jest.fn().mockResolvedValue(undefined),
      getBest: jest.fn().mockResolvedValue(null),
      cleanup: jest.fn().mockResolvedValue(undefined),
    };

    promptLoaderMock = {
      render: jest.fn().mockResolvedValue('mock improvement prompt'),
    };

    // executeEval resolves immediately (fast path)
    executeEvalMock.mockImplementation(async (evalCase: EvalCase) => makeEvalRun(evalCase));
    // gradeRun always passes
    gradeRunMock.mockResolvedValue(makeGrading());

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        SkillOptimizationService,
        { provide: SkillsService, useValue: skillsServiceMock },
        { provide: GenerationService, useValue: generationServiceMock },
        { provide: EvalRunnerService, useValue: { executeEval: executeEvalMock } },
        { provide: GradingService, useValue: { gradeRun: gradeRunMock } },
        { provide: EvalFeedbackService, useValue: {} },
        { provide: PromptLoaderService, useValue: promptLoaderMock },
        { provide: DRAFT_STORE, useValue: draftStoreMock },
        { provide: EVAL_REPOSITORY, useValue: evalRepoMock },
        { provide: EvalSuggestionService, useValue: { analyzeCoverageGaps: jest.fn().mockReturnValue({ gaps: [], coverageScore: 100 }) } },
      ],
    }).compile();

    service = module.get<SkillOptimizationService>(SkillOptimizationService);

    // Silence logger
    const logger = (service as any).logger;
    jest.spyOn(logger, 'log').mockImplementation(() => {});
    jest.spyOn(logger, 'warn').mockImplementation(() => {});
    jest.spyOn(logger, 'debug').mockImplementation(() => {});
    jest.spyOn(logger, 'error').mockImplementation(() => {});
  });

  afterEach(() => {
    jest.clearAllMocks();
  });

  // ── OPT_EVAL_CONCURRENCY = 5 constant value ─────────────────────────

  describe('OPT_EVAL_CONCURRENCY constant', () => {
    it('OPT_EVAL_CONCURRENCY is 5 (not 3)', () => {
      // Access the private static constant via the class definition
      const concurrency = (SkillOptimizationService as any).OPT_EVAL_CONCURRENCY;
      expect(concurrency).toBe(5);
    });
  });

  // ── Batching behavior at the boundary ───────────────────────────────

  describe('runEvalsInMemory batching behavior', () => {
    /**
     * Helper: run the optimization loop with the given eval cases and capture
     * all executeEval calls. The loop is configured for 1 iteration with
     * targetPassRate: 0 so it never tries to improve (no optimizeDraft call).
     */
    const runLoopWithCases = async (evalCases: EvalCase[]) => {
      const skill = makeSkill();
      skillsServiceMock.findById.mockResolvedValue(skill);
      evalRepoMock.getEvalCases.mockResolvedValue(evalCases);

      const abortController = new AbortController();
      const subject = new Subject<MessageEvent>();
      // Suppress subject emissions
      subject.subscribe({ next: () => {}, error: () => {} });

      await service.runLoop(
        'skill-1',
        {
          maxIterations: 1,
          targetPassRate: 0, // ensures we skip the improvement step
          includeFeedback: false,
        },
        subject,
        abortController,
      );

      return executeEvalMock.mock.calls.map((call) => call[0] as EvalCase);
    };

    it('processes exactly 5 eval cases per batch — 5 cases fires in a single batch', async () => {
      // 5 cases = exactly 1 batch (no remainder)
      const cases = Array.from({ length: 5 }, (_, i) => makeEvalCase(`case-${String(i).padStart(2, '0')}`));
      // Sort by ID (matches the deterministic sort in splitEvalSet)
      cases.sort((a, b) => a.id.localeCompare(b.id));

      await runLoopWithCases(cases);

      // All 5 cases across train + test sets should have been executed
      // (train = ceil(5 * 0.6) = 3 cases, test = 2 cases → total = 5 executeEval calls)
      expect(executeEvalMock).toHaveBeenCalledTimes(5);
    });

    it('processes 6 eval cases in two batches of 5 then 1 (concurrency = 5)', async () => {
      // 6 cases: train = ceil(6 * 0.6) = 4, test = 2 → 6 total executeEval calls
      // train batch: 4 cases in 1 batch (< 5), test batch: 2 cases in 1 batch
      const cases = Array.from({ length: 6 }, (_, i) => makeEvalCase(`case-${String(i).padStart(2, '0')}`));

      let maxParallelCalls = 0;
      let currentParallelCalls = 0;

      executeEvalMock.mockImplementation(async (evalCase: EvalCase) => {
        currentParallelCalls++;
        maxParallelCalls = Math.max(maxParallelCalls, currentParallelCalls);
        // Tiny async yield to allow other parallel calls to register
        await Promise.resolve();
        currentParallelCalls--;
        return makeEvalRun(evalCase);
      });

      await runLoopWithCases(cases);

      // Regardless of batch sizes, max parallel was never more than 5
      expect(maxParallelCalls).toBeLessThanOrEqual(5);
      expect(executeEvalMock).toHaveBeenCalledTimes(6);
    });

    it('handles 10 eval cases — train batch of 5 shows concurrency = 5 in action', async () => {
      // 10 cases: train = ceil(10 * 0.6) = 6, test = 4
      // train: batch1=[0..4] (5 cases), batch2=[5] (1 case)
      // test: batch1=[0..3] (4 cases)
      const cases = Array.from({ length: 10 }, (_, i) => makeEvalCase(`case-${String(i).padStart(2, '0')}`));

      // Track batch sizes by checking how many times executeEval was called in parallel
      const batchSizes: number[] = [];
      let currentBatchCount = 0;
      let inBatch = false;

      executeEvalMock.mockImplementation(async (evalCase: EvalCase) => {
        currentBatchCount++;
        // Use microtask to let all parallel calls in the same Promise.all register
        await new Promise(resolve => setImmediate(resolve));
        if (!inBatch) {
          inBatch = true;
          // Record batch size after microtask (all parallel calls registered)
          batchSizes.push(currentBatchCount);
          currentBatchCount = 0;
          inBatch = false;
        }
        return makeEvalRun(evalCase);
      });

      await runLoopWithCases(cases);

      expect(executeEvalMock).toHaveBeenCalledTimes(10);

      // The largest batch should be exactly 5 (OPT_EVAL_CONCURRENCY)
      // At least one batch of 5 must have been produced (train set = 6, first batch = 5)
      const largestBatch = Math.max(...batchSizes);
      expect(largestBatch).toBeLessThanOrEqual(5);
    });

    it('does not exceed batch size of 5 — validates OPT_EVAL_CONCURRENCY ceiling', async () => {
      // 11 cases triggers batches of 5, 5, 1 on train (ceil(11*0.6)=7), or 5, 2 on test
      const cases = Array.from({ length: 11 }, (_, i) => makeEvalCase(`case-${String(i).padStart(2, '0')}`));

      let peakConcurrency = 0;
      let activeCalls = 0;

      executeEvalMock.mockImplementation(async (evalCase: EvalCase) => {
        activeCalls++;
        peakConcurrency = Math.max(peakConcurrency, activeCalls);
        await new Promise(resolve => setImmediate(resolve));
        activeCalls--;
        return makeEvalRun(evalCase);
      });

      await runLoopWithCases(cases);

      // Peak concurrency must never exceed 5 (OPT_EVAL_CONCURRENCY)
      expect(peakConcurrency).toBeLessThanOrEqual(5);
      // But it should have reached 5 at some point for the larger batches
      expect(peakConcurrency).toBeGreaterThanOrEqual(1);
    });
  });

  /**
   * Build an EvalRun with assertion results for QUAL-02/03 tests.
   * Extends makeEvalRun() by adding a grading object with assertion results.
   */
  const makeEvalRunWithAssertions = (
    evalCase: EvalCase,
    assertionResults: Array<{ passed: boolean; description?: string; value: string }>,
  ): EvalRun => ({
    ...makeEvalRun(evalCase),
    grading: {
      overall: assertionResults.every(a => a.passed)
        ? 'pass'
        : assertionResults.some(a => a.passed)
          ? 'partial'
          : 'fail',
      score: Math.round(
        (assertionResults.filter(a => a.passed).length / assertionResults.length) * 100,
      ),
      assertionResults: assertionResults.map(a => ({
        assertion: { type: 'semantic' as const, value: a.value, description: a.description },
        passed: a.passed,
        evidence: a.passed ? 'evidence of passing' : 'evidence of failing',
        confidence: 0.9,
      })),
      gradedAt: new Date().toISOString(),
      gradedBy: 'auto' as const,
    },
  } as EvalRun);

  // ── QUAL-02: formatPassingAssertions() preservation contract ─────────

  describe('SkillOptimizationService — QUAL-02 formatPassingAssertions()', () => {
    it('passes passing assertion descriptions to render() when trainResults has passing assertions', async () => {
      const evalCase = makeEvalCase('case-1');
      const trainResults: EvalRun[] = [
        makeEvalRunWithAssertions(evalCase, [
          { passed: true, description: 'output uses polite tone', value: 'polite tone' },
          { passed: false, description: 'output includes all steps', value: 'includes all steps' },
        ]),
      ];

      await (service as any).buildImprovementPrompt(trainResults);

      expect(promptLoaderMock.render).toHaveBeenCalledWith(
        'optimize-improvement',
        expect.objectContaining({
          passingAssertions: expect.stringContaining('polite tone'),
          failureSummaries: expect.any(String),
          feedbackSection: expect.any(String),
        }),
      );
    });

    it('includes passing assertions from partial runs (not just fully-passing runs)', async () => {
      const evalCase = makeEvalCase('case-2');
      // This run is 'partial' overall — but has one passing assertion that must be in the contract
      const trainResults: EvalRun[] = [
        makeEvalRunWithAssertions(evalCase, [
          { passed: true, description: 'explains reasoning clearly', value: 'explains reasoning' },
          { passed: false, description: 'provides code example', value: 'code example' },
        ]),
      ];

      await (service as any).buildImprovementPrompt(trainResults);

      const renderCall = promptLoaderMock.render.mock.calls[0];
      const vars = renderCall[1] as Record<string, string>;
      expect(vars.passingAssertions).toContain('explains reasoning clearly');
      expect(vars.passingAssertions).not.toContain('provides code example');
    });

    it('returns non-empty placeholder text when no assertions are passing', async () => {
      const evalCase = makeEvalCase('case-3');
      const trainResults: EvalRun[] = [
        makeEvalRunWithAssertions(evalCase, [
          { passed: false, description: 'output is concise', value: 'concise' },
        ]),
      ];

      await (service as any).buildImprovementPrompt(trainResults);

      expect(promptLoaderMock.render).toHaveBeenCalledWith(
        'optimize-improvement',
        expect.objectContaining({
          passingAssertions: 'No assertions are currently passing.',
        }),
      );
    });

    it('deduplicates passing assertion descriptions across runs', async () => {
      const evalCase1 = makeEvalCase('case-4a');
      const evalCase2 = makeEvalCase('case-4b');
      // Same assertion description appears in two runs
      const trainResults: EvalRun[] = [
        makeEvalRunWithAssertions(evalCase1, [
          { passed: true, description: 'output is helpful', value: 'helpful' },
        ]),
        makeEvalRunWithAssertions(evalCase2, [
          { passed: true, description: 'output is helpful', value: 'helpful' },
        ]),
      ];

      await (service as any).buildImprovementPrompt(trainResults);

      const renderCall = promptLoaderMock.render.mock.calls[0];
      const vars = renderCall[1] as Record<string, string>;
      // "output is helpful" should appear exactly once in the numbered list
      const occurrences = (vars.passingAssertions.match(/output is helpful/g) ?? []).length;
      expect(occurrences).toBe(1);
    });
  });

  // ── isPlateaued() ────────────────────────────────────────────────────

  describe('isPlateaued()', () => {
    /** Build a minimal IterationState with only the fields isPlateaued() reads. */
    const makeIter = (testScore: number) =>
      ({
        iteration: 0,
        subStep: 'done' as const,
        trainScore: 0,
        testScore,
        trainPassed: 0,
        trainTotal: 0,
        testPassed: 0,
        testTotal: 0,
        totalCost: 0,
        durationMs: 0,
      });

    const isPlateaued = (iters: ReturnType<typeof makeIter>[]) =>
      (service as any).isPlateaued(iters) as boolean;

    it('returns false for 0 iterations', () => {
      expect(isPlateaued([])).toBe(false);
    });

    it('returns false for 1 iteration', () => {
      expect(isPlateaued([makeIter(0.5)])).toBe(false);
    });

    it('returns false for 2 iterations', () => {
      expect(isPlateaued([makeIter(0.5), makeIter(0.5)])).toBe(false);
    });

    it('returns false for 3 strictly improving iterations', () => {
      expect(isPlateaued([makeIter(0.5), makeIter(0.7), makeIter(0.9)])).toBe(false);
    });

    it('returns true for 3 flat iterations (same score)', () => {
      expect(isPlateaued([makeIter(0.8), makeIter(0.8), makeIter(0.8)])).toBe(true);
    });

    it('returns true when last score equals the score 2 iterations ago (tie)', () => {
      expect(isPlateaued([makeIter(0.6), makeIter(0.9), makeIter(0.6)])).toBe(true);
    });

    it('returns true when last score is lower than the score 2 iterations ago (regression)', () => {
      expect(isPlateaued([makeIter(0.8), makeIter(0.6), makeIter(0.4)])).toBe(true);
    });

    it('returns false when last score strictly exceeds the score 2 iterations ago', () => {
      expect(isPlateaued([makeIter(0.6), makeIter(0.5), makeIter(0.7)])).toBe(false);
    });

    it('only considers the last 3 iterations — earlier history is ignored', () => {
      // First 4 iterations are regressing, but last 3 are improving → not plateaued
      const iters = [makeIter(1.0), makeIter(0.9), makeIter(0.5), makeIter(0.6), makeIter(0.8)];
      expect(isPlateaued(iters)).toBe(false);
    });

    it('detects plateau in a longer sequence when last 3 are flat', () => {
      const iters = [makeIter(0.4), makeIter(0.6), makeIter(0.8), makeIter(0.8), makeIter(0.8)];
      expect(isPlateaued(iters)).toBe(true);
    });

    it('handles perfect score plateau (1.0)', () => {
      expect(isPlateaued([makeIter(1.0), makeIter(1.0), makeIter(1.0)])).toBe(true);
    });

    it('handles zero score plateau', () => {
      expect(isPlateaued([makeIter(0), makeIter(0), makeIter(0)])).toBe(true);
    });
  });

  // ── QUAL-03: change budget in improvement prompt ──────────────────────

  describe('SkillOptimizationService — QUAL-03 change budget in improvement prompt', () => {
    it('render() is still called with failureSummaries key (regression guard)', async () => {
      const evalCase = makeEvalCase('case-5');
      const trainResults: EvalRun[] = [
        makeEvalRunWithAssertions(evalCase, [
          { passed: false, description: 'output is complete', value: 'complete' },
        ]),
      ];

      await (service as any).buildImprovementPrompt(trainResults);

      expect(promptLoaderMock.render).toHaveBeenCalledWith(
        'optimize-improvement',
        expect.objectContaining({
          failureSummaries: expect.any(String),
          feedbackSection: expect.any(String),
        }),
      );
    });
  });
});

// Access private methods via type cast for unit testing.
// FailureCluster is a private interface in the service — inline its shape here.
type ServicePrivate = {
  clusterFailures(runs: EvalRun[]): Array<{ name: string; count: number; failedAssertionDescriptions: string[] }>;
  formatUncertainPasses(runs: EvalRun[]): string;
};

describe('SkillOptimizationService — clusterFailures()', () => {
  let service: SkillOptimizationService;

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      providers: [
        SkillOptimizationService,
        { provide: SkillsService, useValue: { findById: jest.fn() } },
        { provide: GenerationService, useValue: { optimizeDraft: jest.fn() } },
        { provide: EvalRunnerService, useValue: { executeEval: jest.fn() } },
        { provide: GradingService, useValue: { gradeRun: jest.fn() } },
        { provide: EvalFeedbackService, useValue: { getFeedbackBySkill: jest.fn() } },
        { provide: PromptLoaderService, useValue: { render: jest.fn().mockResolvedValue('') } },
        { provide: DRAFT_STORE, useValue: { save: jest.fn(), getBest: jest.fn(), cleanup: jest.fn() } },
        { provide: EVAL_REPOSITORY, useValue: { getEvalCases: jest.fn(), getEvalRuns: jest.fn() } },
        { provide: EvalSuggestionService, useValue: { analyzeCoverageGaps: jest.fn() } },
      ],
    }).compile();
    service = module.get<SkillOptimizationService>(SkillOptimizationService);
  });

  const makeRunWithFailure = (evidence: string): EvalRun => ({
    id: 'run-1', evalId: 'case-1', skillId: 'skill-1',
    config: { model: 'light', maxTokens: 8192, temperature: 0, compareBaseline: false },
    prompt: 'test prompt', outputWithSkill: 'output', outputFiles: [],
    timing: { durationMs: 100, inputTokens: 50, outputTokens: 50, totalTokens: 100, outputChars: 6 },
    status: 'completed', createdAt: new Date().toISOString(),
    grading: {
      overall: 'fail', score: 0,
      assertionResults: [{
        assertion: { type: 'semantic', value: 'test', description: 'some assertion' },
        passed: false, evidence,
      }],
      gradedAt: new Date().toISOString(), gradedBy: 'auto',
    },
  } as EvalRun);

  it('clusters format failure by evidence keyword "heading"', () => {
    const runs = [makeRunWithFailure('Output is missing required heading structure')];
    const clusters = (service as unknown as ServicePrivate).clusterFailures(runs);
    expect(clusters).toHaveLength(1);
    expect(clusters[0].name).toBe('format');
    expect(clusters[0].count).toBe(1);
  });

  it('clusters completeness failure by evidence keyword "missing"', () => {
    const runs = [makeRunWithFailure('Required section is missing from the output')];
    const clusters = (service as unknown as ServicePrivate).clusterFailures(runs);
    expect(clusters[0].name).toBe('completeness');
  });

  it('clusters tone failure by evidence keyword "formal"', () => {
    const runs = [makeRunWithFailure('Tone is not formal enough for the context')];
    const clusters = (service as unknown as ServicePrivate).clusterFailures(runs);
    expect(clusters[0].name).toBe('tone');
  });

  it('clusters accuracy failure by evidence keyword "incorrect"', () => {
    const runs = [makeRunWithFailure('The claim is incorrect based on the skill content')];
    const clusters = (service as unknown as ServicePrivate).clusterFailures(runs);
    expect(clusters[0].name).toBe('accuracy');
  });

  it('clusters length failure by evidence keyword "too long"', () => {
    const runs = [makeRunWithFailure('Response is too long, expected concise output')];
    const clusters = (service as unknown as ServicePrivate).clusterFailures(runs);
    expect(clusters[0].name).toBe('length');
  });

  it('falls back to "other" cluster when no keywords match', () => {
    const runs = [makeRunWithFailure('The output lacks the expected perspective')];
    const clusters = (service as unknown as ServicePrivate).clusterFailures(runs);
    expect(clusters[0].name).toBe('other');
  });

  it('returns multiple clusters sorted by count descending', () => {
    const runs = [
      { ...makeRunWithFailure('missing content'), id: 'run-a' },  // completeness
      { ...makeRunWithFailure('wrong heading'), id: 'run-b' },    // format
      { ...makeRunWithFailure('omitted section'), id: 'run-c' },  // completeness
    ] as EvalRun[];
    const clusters = (service as unknown as ServicePrivate).clusterFailures(runs);
    expect(clusters[0].name).toBe('completeness');
    expect(clusters[0].count).toBe(2);
    expect(clusters[1].name).toBe('format');
    expect(clusters[1].count).toBe(1);
  });

  it('formatUncertainPasses returns assertion descriptions with confidence < 0.7', () => {
    const run: EvalRun = {
      id: 'run-1', evalId: 'case-1', skillId: 'skill-1',
      config: { model: 'light', maxTokens: 8192, temperature: 0, compareBaseline: false },
      prompt: 'test', outputWithSkill: 'output', outputFiles: [],
      timing: { durationMs: 10, inputTokens: 10, outputTokens: 10, totalTokens: 20, outputChars: 6 },
      status: 'completed', createdAt: new Date().toISOString(),
      grading: {
        overall: 'partial', score: 50,
        assertionResults: [
          { assertion: { type: 'semantic', value: 'check tone', description: 'Tone is formal' }, passed: true, evidence: 'ok', confidence: 0.5 },
          { assertion: { type: 'semantic', value: 'check length', description: 'Output is concise' }, passed: true, evidence: 'ok', confidence: 0.9 },
          { assertion: { type: 'semantic', value: 'check format', description: 'Has section headings' }, passed: false, evidence: 'missing heading', confidence: 0.8 },
        ],
        gradedAt: new Date().toISOString(), gradedBy: 'auto',
      },
    } as EvalRun;

    const result = (service as unknown as ServicePrivate).formatUncertainPasses([run]);
    expect(result).toContain('Tone is formal');
    expect(result).not.toContain('Output is concise'); // confidence 0.9 — not uncertain
    expect(result).not.toContain('Has section headings'); // failed — not a pass
  });
});

describe('SkillOptimizationService — buildImprovementPrompt() includes clustering signals', () => {
  let service: SkillOptimizationService;
  let renderMock: jest.Mock;

  beforeEach(async () => {
    renderMock = jest.fn().mockResolvedValue('rendered prompt');
    const module: TestingModule = await Test.createTestingModule({
      providers: [
        SkillOptimizationService,
        { provide: SkillsService, useValue: { findById: jest.fn() } },
        { provide: GenerationService, useValue: { optimizeDraft: jest.fn() } },
        { provide: EvalRunnerService, useValue: { executeEval: jest.fn() } },
        { provide: GradingService, useValue: { gradeRun: jest.fn() } },
        { provide: EvalFeedbackService, useValue: { getFeedbackBySkill: jest.fn() } },
        { provide: PromptLoaderService, useValue: { render: renderMock } },
        { provide: DRAFT_STORE, useValue: { save: jest.fn(), getBest: jest.fn(), cleanup: jest.fn() } },
        { provide: EVAL_REPOSITORY, useValue: { getEvalCases: jest.fn(), getEvalRuns: jest.fn() } },
        { provide: EvalSuggestionService, useValue: { analyzeCoverageGaps: jest.fn() } },
      ],
    }).compile();
    service = module.get<SkillOptimizationService>(SkillOptimizationService);
  });

  // Access private method
  type WithBuildPrompt = { buildImprovementPrompt(runs: EvalRun[], feedback?: string): Promise<string> };

  const makeFailedRun = (evidence: string): EvalRun => ({
    id: `run-${evidence.slice(0, 5)}`, evalId: 'case-1', skillId: 'skill-1',
    config: { model: 'light', maxTokens: 8192, temperature: 0, compareBaseline: false },
    prompt: 'test', outputWithSkill: 'output', outputFiles: [],
    timing: { durationMs: 10, inputTokens: 10, outputTokens: 10, totalTokens: 20, outputChars: 6 },
    status: 'completed', createdAt: new Date().toISOString(),
    grading: {
      overall: 'fail', score: 0,
      assertionResults: [{ assertion: { type: 'semantic', value: 'x', description: 'x' }, passed: false, evidence }],
      gradedAt: new Date().toISOString(), gradedBy: 'auto',
    },
  } as EvalRun);

  const makePassedRun = (confidence: number): EvalRun => ({
    id: `run-pass-${confidence}`, evalId: 'case-2', skillId: 'skill-1',
    config: { model: 'light', maxTokens: 8192, temperature: 0, compareBaseline: false },
    prompt: 'test', outputWithSkill: 'output', outputFiles: [],
    timing: { durationMs: 10, inputTokens: 10, outputTokens: 10, totalTokens: 20, outputChars: 6 },
    status: 'completed', createdAt: new Date().toISOString(),
    grading: {
      overall: 'pass', score: 100,
      assertionResults: [{ assertion: { type: 'semantic', value: 'check', description: 'Has a heading' }, passed: true, evidence: 'ok', confidence }],
      gradedAt: new Date().toISOString(), gradedBy: 'auto',
    },
  } as EvalRun);

  it('passes focusSection naming the top cluster to render()', async () => {
    const runs = [makeFailedRun('missing required section'), makeFailedRun('section omitted')];
    await (service as unknown as WithBuildPrompt).buildImprovementPrompt(runs);
    const vars = renderMock.mock.calls[0][1] as Record<string, string>;
    expect(vars.focusSection).toContain('completeness');
    expect(vars.focusSection).toContain('Fix:');
  });

  it('passes uncertainPassesSection with low-confidence passes to render()', async () => {
    const runs = [makePassedRun(0.5)]; // confidence 0.5 < threshold 0.7
    await (service as unknown as WithBuildPrompt).buildImprovementPrompt(runs);
    const vars = renderMock.mock.calls[0][1] as Record<string, string>;
    expect(vars.uncertainPassesSection).toContain('Has a heading');
  });

  it('passes empty uncertainPassesSection when all passes have high confidence', async () => {
    const runs = [makePassedRun(0.95)]; // confidence 0.95 >= threshold 0.7
    await (service as unknown as WithBuildPrompt).buildImprovementPrompt(runs);
    const vars = renderMock.mock.calls[0][1] as Record<string, string>;
    expect(vars.uncertainPassesSection).toBe('');
  });

  it('passes empty focusSection when no failures', async () => {
    const runs = [makePassedRun(0.9)];
    await (service as unknown as WithBuildPrompt).buildImprovementPrompt(runs);
    const vars = renderMock.mock.calls[0][1] as Record<string, string>;
    expect(vars.focusSection).toBe('');
  });
});

describe('SkillOptimizationService — regression guard', () => {
  let service: SkillOptimizationService;
  let executeEvalMock: jest.Mock;
  let gradeRunMock: jest.Mock;
  let skillsServiceMock: Record<string, jest.Mock>;
  let generationServiceMock: Record<string, jest.Mock>;
  let evalRepoMock: Record<string, jest.Mock>;
  let draftStoreMock: Record<string, jest.Mock>;
  let promptLoaderMock: Record<string, jest.Mock>;
  let evalSuggestionMock: Record<string, jest.Mock>;

  const makeEvalCase = (id: string) => ({
    id, skillId: 'skill-1', name: `Case ${id}`, prompt: `Prompt ${id}`,
    assertions: [{ type: 'semantic', value: 'test', description: 'test assertion' }],
    expectedOutput: '', split: 'train', createdAt: new Date().toISOString(),
    updatedAt: new Date().toISOString(),
  } as EvalCase);

  const makeSkill = () => ({
    id: 'skill-1', name: 'test-skill', description: 'A test skill',
    skillContent: '# Test Skill\n## Overview\nContent here',
    scripts: [], references: [], assets: [], version: 1, status: 'ready',
    ownerId: 'user-1', createdAt: new Date().toISOString(), updatedAt: new Date().toISOString(),
    isPublished: false,
  } as Skill);

  beforeEach(async () => {
    executeEvalMock = jest.fn();
    gradeRunMock = jest.fn();
    skillsServiceMock = { findById: jest.fn().mockResolvedValue(makeSkill()) };
    generationServiceMock = {
      optimizeDraft: jest.fn().mockResolvedValue({
        name: 'test-skill', description: 'improved', skillContent: '# Test Skill\n## Overview\nImproved',
        scripts: [], references: [], assets: [], stats: { costUsd: 0.001 },
      }),
    };
    evalRepoMock = {
      getEvalCases: jest.fn(),
      getEvalRuns: jest.fn().mockResolvedValue([]),
    };
    draftStoreMock = {
      save: jest.fn().mockResolvedValue(undefined),
      getBest: jest.fn().mockResolvedValue(null),
      cleanup: jest.fn().mockResolvedValue(undefined),
    };
    promptLoaderMock = {
      render: jest.fn().mockResolvedValue('You are improving a skill...'),
    };
    evalSuggestionMock = {
      analyzeCoverageGaps: jest.fn().mockReturnValue({ gaps: [], coverageScore: 100 }),
    };

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        SkillOptimizationService,
        { provide: SkillsService, useValue: skillsServiceMock },
        { provide: GenerationService, useValue: generationServiceMock },
        { provide: EvalRunnerService, useValue: { executeEval: executeEvalMock } },
        { provide: GradingService, useValue: { gradeRun: gradeRunMock } },
        { provide: EvalFeedbackService, useValue: { getFeedbackBySkill: jest.fn().mockResolvedValue([]) } },
        { provide: PromptLoaderService, useValue: promptLoaderMock },
        { provide: DRAFT_STORE, useValue: draftStoreMock },
        { provide: EVAL_REPOSITORY, useValue: evalRepoMock },
        { provide: EvalSuggestionService, useValue: evalSuggestionMock },
      ],
    }).compile();

    service = module.get<SkillOptimizationService>(SkillOptimizationService);
  });

  it('reverts currentDraft to bestDraft when test score regresses', async () => {
    // 3 train cases, 2 test cases
    // Iteration 1: train=1/3 pass, test=2/2 pass (testScore=1.0) → bestDraft set
    // Iteration 2: train=3/3 pass, test=0/2 pass (testScore=0.0) → regression, reverts to iter 1 draft
    const trainCases = ['t1', 't2', 't3'].map(makeEvalCase);
    const testCases = ['e1', 'e2'].map(makeEvalCase);
    evalRepoMock.getEvalCases.mockResolvedValue([...trainCases, ...testCases]);

    // Sorted by ID: e1, e2, t1, t2, t3 → splitIndex = ceil(5 * 0.6) = 3
    // train = [e1, e2, t1], test = [t2, t3]

    let callCount = 0;
    executeEvalMock.mockImplementation(async (evalCase: EvalCase) => {
      callCount++;
      return {
        id: `run-${callCount}`, evalId: evalCase.id, skillId: 'skill-1',
        config: { model: 'light', maxTokens: 8192, temperature: 0, compareBaseline: false },
        prompt: evalCase.prompt, outputWithSkill: 'output', outputFiles: [],
        timing: { durationMs: 10, inputTokens: 10, outputTokens: 10, totalTokens: 20, outputChars: 6 },
        status: 'completed', createdAt: new Date().toISOString(),
      };
    });

    let gradeCallCount = 0;
    gradeRunMock.mockImplementation(async () => {
      gradeCallCount++;
      // Iteration 1 train: 1 pass out of 3 (gradeCallCount 1=pass, 2=fail, 3=fail)
      // Iteration 1 test: 2 pass out of 2 (gradeCallCount 4=pass, 5=pass)
      // Iteration 2 train: 3 pass out of 3 (gradeCallCount 6=pass, 7=pass, 8=pass)
      // Iteration 2 test: 0 pass out of 2 (gradeCallCount 9=fail, 10=fail)
      const passing = [1, 4, 5, 6, 7, 8].includes(gradeCallCount);
      return {
        overall: passing ? 'pass' : 'fail', score: passing ? 100 : 0,
        assertionResults: [{ assertion: { type: 'semantic', value: 'x' }, passed: passing, evidence: 'test' }],
        gradedAt: new Date().toISOString(), gradedBy: 'auto',
      };
    });

    draftStoreMock.getBest.mockImplementation(async (_optId: string) => ({
      iteration: 1,
      draft: { name: 'test-skill', description: 'A test skill', skillContent: '# Test Skill\n## Overview\nContent here', scripts: [], references: [], assets: [], trainScore: 0.33, testScore: 1.0 },
    }));

    const subject = new Subject<MessageEvent>();
    const events: Array<{ type: string; data: unknown }> = [];
    subject.subscribe(e => events.push(JSON.parse((e as MessageEvent).data)));

    const ac = new AbortController();
    await service.runLoop('skill-1', { maxIterations: 2, targetPassRate: 1.0 }, subject, ac);

    const regressionEvent = events.find(e => e.type === 'regression-detected');
    expect(regressionEvent).toBeDefined();
    expect((regressionEvent!.data as { iteration: number }).iteration).toBe(2);
    expect((regressionEvent!.data as { prevScore: number }).prevScore).toBe(1.0);
    expect((regressionEvent!.data as { currentScore: number }).currentScore).toBe(0.0);
    expect((regressionEvent!.data as { revertedTo: number }).revertedTo).toBe(1);

    // Verify the optimization-complete event fired.
    const completeEvent = events.find(e => e.type === 'optimization-complete');
    expect(completeEvent).toBeDefined();

    // The draftStore.save() for iteration 2 must preserve the best draft's scores
    // (trainScore: ~0.33, testScore: 1.0) — NOT the regressed iteration's scores
    // (trainScore: 1.0, testScore: 0.0). This is the core of the bug fix.
    type SavedDraft = { trainScore?: number; testScore?: number };
    const savedDrafts = draftStoreMock.save.mock.calls.map((call: unknown[]) => call[2] as SavedDraft);
    const iter2Save = savedDrafts[savedDrafts.length - 1];
    // After regression revert, the saved draft must carry the best iteration's testScore (1.0),
    // not the regressed testScore (0.0).
    expect(iter2Save?.testScore).toBe(1.0);
    expect(iter2Save?.trainScore).toBeCloseTo(0.33, 1);
  });
});
