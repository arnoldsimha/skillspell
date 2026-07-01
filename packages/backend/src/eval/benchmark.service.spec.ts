import { Test, TestingModule } from '@nestjs/testing';
import { BenchmarkService } from './benchmark.service';
import { EVAL_REPOSITORY } from '@skillspell/shared';
import type { EvalCase, EvalRun, EvalGrading } from '@skillspell/shared';

/**
 * Unit tests for BenchmarkService — focuses on the M2 change: runs whose AI
 * grading hit an infrastructure error (gradingError) must be excluded from
 * quality metrics, and an all-grading-failed run set must not masquerade as
 * "never run". computeBenchmark is a pure function (no repository access), so
 * we feed it runs directly.
 */
describe('BenchmarkService — grading-error handling', () => {
  let service: BenchmarkService;

  const evalCase: EvalCase = {
    id: 'eval-1',
    skillId: 'skill-1',
    name: 'Case 1',
    prompt: 'p',
    assertions: [{ type: 'semantic', value: 'polite' }],
    createdAt: new Date().toISOString(),
    updatedAt: new Date().toISOString(),
  } as EvalCase;

  const grading = (
    overall: EvalGrading['overall'],
    score: number,
    extra: Partial<EvalGrading> = {},
  ): EvalGrading => ({
    overall,
    score,
    assertionResults: [
      {
        assertion: { type: 'semantic', value: 'polite' },
        passed: overall === 'pass',
      },
    ],
    gradedAt: new Date().toISOString(),
    gradedBy: 'auto',
    ...extra,
  });

  const makeRun = (id: string, g: EvalGrading, skillVersion = 1): EvalRun =>
    ({
      id,
      evalId: 'eval-1',
      skillId: 'skill-1',
      config: {},
      prompt: 'p',
      outputWithSkill: 'o',
      outputFiles: [],
      grading: g,
      timing: {
        durationMs: 10,
        inputTokens: 5,
        outputTokens: 5,
        totalTokens: 10,
      },
      status: 'completed',
      skillVersion,
      createdAt: new Date().toISOString(),
    }) as EvalRun;

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      providers: [BenchmarkService, { provide: EVAL_REPOSITORY, useValue: {} }],
    }).compile();
    service = module.get<BenchmarkService>(BenchmarkService);
    const logger = (service as any).logger;
    jest.spyOn(logger, 'log').mockImplementation(() => {});
    jest.spyOn(logger, 'warn').mockImplementation(() => {});
  });

  it('excludes grading-errored runs from pass rate and average score', () => {
    const runs = [
      makeRun('r1', grading('pass', 100)),
      makeRun('r2', grading('fail', 0)),
      // This run's grader threw — it must NOT count as a quality failure.
      makeRun('r3', grading('fail', 0, { gradingError: 'API timeout' })),
    ];

    const b = service.computeBenchmark('skill-1', [evalCase], runs);

    // Only r1 + r2 count: 1 pass of 2 → 50% pass rate, mean score 50.
    expect(b.totalRuns).toBe(2);
    expect(b.passRate).toBe(50);
    expect(b.averageScore).toBe(50);
    // The excluded run is surfaced as a note.
    expect((b.notes ?? []).some((n) => n.includes('grading errors'))).toBe(
      true,
    );
  });

  it('returns an explained empty benchmark when every run had a grading error', () => {
    const runs = [
      makeRun('r1', grading('fail', 0, { gradingError: 'API down' })),
      makeRun('r2', grading('fail', 0, { gradingError: 'parse error' })),
    ];

    const b = service.computeBenchmark('skill-1', [evalCase], runs);

    expect(b.totalRuns).toBe(0);
    // Must not look like a never-run skill — the grading-error note explains it.
    expect((b.notes ?? []).some((n) => n.includes('grading errors'))).toBe(
      true,
    );
  });

  it('scopes the grading-error count to the requested version', () => {
    const runs = [
      makeRun('r1', grading('pass', 100), 2),
      makeRun(
        'v1err',
        grading('fail', 0, { gradingError: 'old version error' }),
        1,
      ),
    ];

    // Viewing version 2: the v1 grading error must not be counted/surfaced.
    const b = service.computeBenchmark('skill-1', [evalCase], runs, 2);

    expect(b.totalRuns).toBe(1);
    expect((b.notes ?? []).some((n) => n.includes('grading errors'))).toBe(
      false,
    );
  });
});
