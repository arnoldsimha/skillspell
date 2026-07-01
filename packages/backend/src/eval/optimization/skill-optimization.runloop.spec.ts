import { Test, TestingModule } from '@nestjs/testing';
import { Subject } from 'rxjs';
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
import type { EvalCase, EvalRun, Skill } from '@skillspell/shared';

/**
 * Characterization tests for SkillOptimizationService.runLoop ORCHESTRATION.
 *
 * The pre-existing spec covers the helpers (isPlateaued, clusterFailures,
 * formatPassingAssertions, the regression guard) and OPT_EVAL_CONCURRENCY batching,
 * but NOT the loop orchestration itself. These tests pin the observable behavior
 * (SSE event sequence, stop conditions, cancellation, validation rejection, result
 * assembly, feedback bump) so the Phase 3 decomposition can be verified
 * behavior-preserving. They must pass against the current implementation first.
 */

type Event = { type: string; data: Record<string, unknown> };

const makeSkill = (): Skill =>
  ({
    id: 'skill-1',
    name: 'test-skill',
    description: 'A test skill',
    skillContent: '# Test Skill\n## Overview\nORIGINAL content',
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

const makeEvalCase = (id: string): EvalCase =>
  ({
    id,
    skillId: 'skill-1',
    name: `Case ${id}`,
    prompt: `Prompt ${id}`,
    assertions: [{ type: 'semantic', value: 'x', description: 'd' }],
    expectedOutput: '',
    split: 'train',
    createdAt: new Date().toISOString(),
    updatedAt: new Date().toISOString(),
  }) as EvalCase;

const makeEvalRun = (evalCase: EvalCase): Omit<EvalRun, 'grading'> =>
  ({
    id: `run-${evalCase.id}`,
    evalId: evalCase.id,
    skillId: 'skill-1',
    config: { model: 'light', maxTokens: 8192, temperature: 0, compareBaseline: false },
    prompt: evalCase.prompt,
    outputWithSkill: 'output',
    outputFiles: [],
    timing: { durationMs: 10, inputTokens: 10, outputTokens: 10, totalTokens: 20, outputChars: 6 },
    status: 'completed',
    createdAt: new Date().toISOString(),
    completedAt: new Date().toISOString(),
  });

const grading = (pass: boolean) => ({
  overall: pass ? ('pass' as const) : ('fail' as const),
  score: pass ? 100 : 0,
  assertionResults: [{ assertion: { type: 'semantic', value: 'x' }, passed: pass, evidence: 'e' }],
  gradedAt: new Date().toISOString(),
  gradedBy: 'auto' as const,
});

// 5 cases, sorted ids c1..c5 → splitIndex = ceil(5*0.6) = 3 → train=[c1,c2,c3] test=[c4,c5]
const CASES = ['c1', 'c2', 'c3', 'c4', 'c5'].map(makeEvalCase);
const TRAIN_IDS = new Set(['c1', 'c2', 'c3']);

describe('SkillOptimizationService — runLoop orchestration (characterization)', () => {
  let service: SkillOptimizationService;
  let executeEval: jest.Mock;
  let gradeRun: jest.Mock;
  let skillsService: Record<string, jest.Mock>;
  let generationService: Record<string, jest.Mock>;
  let evalRepo: Record<string, jest.Mock>;
  let draftStore: Record<string, jest.Mock>;

  beforeEach(async () => {
    executeEval = jest.fn(async (c: EvalCase) => makeEvalRun(c));
    gradeRun = jest.fn(async () => grading(true));
    skillsService = { findById: jest.fn().mockResolvedValue(makeSkill()) };
    generationService = {
      optimizeDraft: jest.fn().mockResolvedValue({
        name: 'test-skill',
        description: 'improved',
        skillContent: '# Test Skill\n## Overview\nIMPROVED content',
        scripts: [],
        references: [],
        assets: [],
        stats: { costUsd: 0.001 },
      }),
    };
    evalRepo = {
      getEvalCases: jest.fn().mockResolvedValue(CASES),
      getEvalRuns: jest.fn().mockResolvedValue([]),
    };
    draftStore = {
      save: jest.fn().mockResolvedValue(undefined),
      getBest: jest.fn().mockResolvedValue(null),
      cleanup: jest.fn().mockResolvedValue(undefined),
    };

    const moduleRef: TestingModule = await Test.createTestingModule({
      providers: [
        SkillOptimizationService,
        { provide: SkillsService, useValue: skillsService },
        { provide: GenerationService, useValue: generationService },
        { provide: EvalRunnerService, useValue: { executeEval } },
        { provide: GradingService, useValue: { gradeRun } },
        { provide: EvalFeedbackService, useValue: { getFeedbackBySkill: jest.fn().mockResolvedValue([]) } },
        { provide: PromptLoaderService, useValue: { render: jest.fn().mockResolvedValue('prompt') } },
        { provide: DRAFT_STORE, useValue: draftStore },
        { provide: EVAL_REPOSITORY, useValue: evalRepo },
        { provide: EvalSuggestionService, useValue: { analyzeCoverageGaps: jest.fn().mockReturnValue({ gaps: [], coverageScore: 100 }) } },
      ],
    }).compile();

    service = moduleRef.get(SkillOptimizationService);
    const logger = (service as any).logger;
    jest.spyOn(logger, 'log').mockImplementation(() => {});
    jest.spyOn(logger, 'warn').mockImplementation(() => {});
    jest.spyOn(logger, 'debug').mockImplementation(() => {});
    jest.spyOn(logger, 'error').mockImplementation(() => {});
  });

  afterEach(() => jest.clearAllMocks());

  /** Run the loop and collect all emitted SSE events. */
  const run = async (config: Record<string, unknown>): Promise<Event[]> => {
    const events: Event[] = [];
    const subject = new Subject<MessageEvent>();
    subject.subscribe((e) => events.push(JSON.parse((e as MessageEvent).data) as Event));
    const ac = new AbortController();
    await service.runLoop('skill-1', config as never, subject, ac);
    return events;
  };

  const types = (events: Event[]) => events.map((e) => e.type);
  const completes = (events: Event[]) => events.filter((e) => e.type === 'iteration-complete');

  it('emits per-iteration progress sub-steps in order (running-train → analyzing → improving → running-test)', async () => {
    gradeRun.mockImplementation(async () => grading(false)); // train fails → triggers improve
    const events = await run({ maxIterations: 2, targetPassRate: 1.0, includeFeedback: false });

    const iter1Steps = events
      .filter((e) => e.type === 'iteration-progress' && e.data.iteration === 1)
      .map((e) => e.data.subStep as string);

    expect(iter1Steps[0]).toBe('running-train');
    expect(iter1Steps).toContain('analyzing');
    expect(iter1Steps).toContain('improving');
    expect(iter1Steps.indexOf('analyzing')).toBeLessThan(iter1Steps.indexOf('improving'));
    expect(iter1Steps.indexOf('improving')).toBeLessThan(iter1Steps.lastIndexOf('running-test'));

    expect(completes(events)).toHaveLength(2);
    expect(types(events).filter((t) => t === 'optimization-complete')).toHaveLength(1);
  });

  it('does not stop on the first iteration that reaches target (new-peak suppression), then stops once stable', async () => {
    gradeRun.mockImplementation(async () => grading(true)); // every eval passes → testScore 1.0
    const events = await run({ maxIterations: 3, targetPassRate: 1.0 });

    // iter1 hits target but is a new peak → loop continues; iter2 matches (not new peak) → stops.
    // So exactly 2 iterations run, NOT 1 (no premature stop) and NOT 3 (stops before max).
    expect(completes(events)).toHaveLength(2);
  });

  it('stops early on plateau (3 flat iterations below target)', async () => {
    // train passes (no improve step → fast), test fails → testScore flat at 0, below target.
    gradeRun.mockImplementation(async (runResult: { evalId: string }) =>
      grading(TRAIN_IDS.has(runResult.evalId)),
    );
    const events = await run({ maxIterations: 5, targetPassRate: 1.0 });

    expect(completes(events)).toHaveLength(3); // plateaued at iteration 3, not run to 5
    expect(generationService.optimizeDraft).not.toHaveBeenCalled(); // train passed → no improve
  });

  it('rejects an improved draft that has validation errors and keeps the current draft', async () => {
    gradeRun.mockImplementation(async () => grading(false)); // trigger improve
    generationService.optimizeDraft.mockResolvedValue({
      name: 'test-skill',
      description: 'broken',
      skillContent: '# Test Skill\n## Overview\nIMPROVED content',
      scripts: [],
      references: [],
      assets: [],
      validationIssues: [{ severity: 'error', field: 'sections', message: 'dropped headings' }],
    });

    await run({ maxIterations: 2, targetPassRate: 1.0 });

    // The draft saved for iteration 1 must still carry the ORIGINAL content, not the rejected improvement.
    const savedContents = draftStore.save.mock.calls.map(
      (call: unknown[]) => (call[2] as { skillContent: string }).skillContent,
    );
    expect(savedContents[0]).toContain('ORIGINAL content');
    expect(savedContents[0]).not.toContain('IMPROVED content');
  });

  it('resolves silently without emitting optimization-error when aborted mid-run', async () => {
    let aborted = false;
    const ac = new AbortController();
    executeEval.mockImplementation(async (c: EvalCase) => {
      if (!aborted) {
        aborted = true;
        ac.abort();
      }
      return makeEvalRun(c);
    });
    const events: Event[] = [];
    const subject = new Subject<MessageEvent>();
    subject.subscribe((e) => events.push(JSON.parse((e as MessageEvent).data) as Event));

    await expect(
      service.runLoop('skill-1', { maxIterations: 2, targetPassRate: 1.0 } as never, subject, ac),
    ).resolves.toBeUndefined();

    expect(types(events)).not.toContain('optimization-error');
    expect(draftStore.cleanup).toHaveBeenCalled(); // finally block still runs
  });

  it('treats an AbortError thrown from a downstream call as cancellation (no optimization-error)', async () => {
    gradeRun.mockImplementation(async () => grading(false)); // trigger improve
    const abortErr = new Error('Optimization cancelled');
    abortErr.name = 'AbortError';
    generationService.optimizeDraft.mockRejectedValue(abortErr);

    const events = await run({ maxIterations: 2, targetPassRate: 1.0 });

    expect(types(events)).not.toContain('optimization-error');
  });

  it('emits optimization-error for a non-cancellation failure', async () => {
    gradeRun.mockImplementation(async () => grading(false)); // trigger improve
    generationService.optimizeDraft.mockRejectedValue(new Error('boom'));

    const events = await run({ maxIterations: 2, targetPassRate: 1.0 });

    const err = events.find((e) => e.type === 'optimization-error');
    expect(err).toBeDefined();
    expect((err!.data as { message: string }).message).toBe('boom');
  });

  it('bumps maxIterations 1→2 when feedback is included, and marks the result as improved', async () => {
    // Feedback present (one failed historical run) → buildFeedbackSection returns a preamble.
    evalRepo.getEvalRuns.mockResolvedValue([
      { id: 'r1', prompt: 'p', status: 'failed', grading: { overall: 'fail', assertionResults: [] } },
    ]);
    draftStore.getBest.mockResolvedValue({
      iteration: 2,
      draft: { name: 'test-skill', description: 'd', skillContent: 'c', scripts: [], references: [], assets: [], trainScore: 1, testScore: 1 },
    });
    gradeRun.mockImplementation(async () => grading(true));

    const events = await run({ maxIterations: 1, targetPassRate: 1.0, includeFeedback: true });

    // maxIterations was 1 but feedback forces a second iteration to evaluate the improved draft.
    expect(completes(events)).toHaveLength(2);

    // feedbackWasApplied → result reports the best draft even though eval scores didn't change.
    const complete = events.find((e) => e.type === 'optimization-complete');
    expect(complete).toBeDefined();
    expect((complete!.data as { bestIteration: unknown }).bestIteration).not.toBeNull();
  });
});
