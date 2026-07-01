import { readFile } from 'node:fs/promises';
import { join } from 'node:path';
import { Test, TestingModule } from '@nestjs/testing';
import { GradingService } from './grading.service';
import { LlmService } from '../generation/llm/llm.service.js';
import { PromptLoaderService } from '../generation/prompts/prompt-loader.service';
import type { EvalAssertion, EvalRun } from '@skillspell/shared';

/**
 * Unit tests for GradingService — deterministic assertion pre-computation.
 *
 * Validates that contains, not_contains, and regex assertions are evaluated
 * locally without calling Claude, while semantic/custom assertions still
 * go through the LLM grading path.
 */
describe('GradingService', () => {
  let service: GradingService;
  let sendMessageMock: jest.Mock;

  /** Helper — build a minimal EvalRun (without grading) for test use. */
  const makeRun = (
    output: string,
  ): Omit<EvalRun, 'grading'> => ({
    id: 'run-1',
    evalId: 'eval-1',
    skillId: 'skill-1',
    config: { model: 'test-model' },
    prompt: 'Test prompt',
    outputWithSkill: output,
    outputFiles: [],
    timing: {
      durationMs: 100,
      inputTokens: 50,
      outputTokens: 50,
      totalTokens: 100,
    },
    status: 'completed',
    createdAt: new Date().toISOString(),
  });

  beforeEach(async () => {
    sendMessageMock = jest.fn();

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        GradingService,
        {
          provide: LlmService,
          useValue: { sendMessage: sendMessageMock },
        },
        {
          provide: PromptLoaderService,
          useValue: {
            render: jest.fn().mockImplementation((name: string, vars: Record<string, string> = {}) => {
              if (name === 'grader') return Promise.resolve('mock grader prompt');
              // grading-request: produce a minimal but realistic user message so
              // tests can assert on assertion list content inside the user message.
              return Promise.resolve(
                [vars['prompt'], vars['output'], vars['expectedOutputSection'], vars['assertionsList'], vars['assertionsJson']]
                  .filter(Boolean)
                  .join('\n'),
              );
            }),
          },
        },
      ],
    }).compile();

    service = module.get<GradingService>(GradingService);

    // Silence the NestJS Logger so expected error logs don't pollute test output
    const logger = (service as any).logger;
    jest.spyOn(logger, 'error').mockImplementation(() => {});
    jest.spyOn(logger, 'warn').mockImplementation(() => {});
    jest.spyOn(logger, 'log').mockImplementation(() => {});
  });

  // ── Empty assertions ──────────────────────────────────────────────

  describe('empty assertions', () => {
    it('should return pass with score 100 when no assertions provided', async () => {
      const result = await service.gradeRun(makeRun('any output'), []);

      expect(result.overall).toBe('pass');
      expect(result.score).toBe(100);
      expect(result.assertionResults).toHaveLength(0);
      expect(result.gradedBy).toBe('auto');
      expect(sendMessageMock).not.toHaveBeenCalled();
    });
  });

  // ── contains assertion ────────────────────────────────────────────

  describe('contains assertion', () => {
    it('should pass when output contains the value (exact case)', async () => {
      const assertions: EvalAssertion[] = [
        { type: 'contains', value: 'hello world' },
      ];

      const result = await service.gradeRun(
        makeRun('Say hello world to everyone'),
        assertions,
      );

      expect(result.assertionResults[0].passed).toBe(true);
      expect(result.assertionResults[0].confidence).toBe(1.0);
      expect(result.overall).toBe('pass');
      expect(result.score).toBe(100);
      expect(sendMessageMock).not.toHaveBeenCalled();
    });

    it('should pass when output contains the value (case-insensitive)', async () => {
      const assertions: EvalAssertion[] = [
        { type: 'contains', value: 'HELLO WORLD' },
      ];

      const result = await service.gradeRun(
        makeRun('Say hello world to everyone'),
        assertions,
      );

      expect(result.assertionResults[0].passed).toBe(true);
      expect(sendMessageMock).not.toHaveBeenCalled();
    });

    it('should fail when output does not contain the value', async () => {
      const assertions: EvalAssertion[] = [
        { type: 'contains', value: 'goodbye' },
      ];

      const result = await service.gradeRun(
        makeRun('Say hello world to everyone'),
        assertions,
      );

      expect(result.assertionResults[0].passed).toBe(false);
      expect(result.overall).toBe('fail');
      expect(result.score).toBe(0);
      expect(sendMessageMock).not.toHaveBeenCalled();
    });
  });

  // ── not_contains assertion ────────────────────────────────────────

  describe('not_contains assertion', () => {
    it('should pass when output does not contain the value', async () => {
      const assertions: EvalAssertion[] = [
        { type: 'not_contains', value: 'error' },
      ];

      const result = await service.gradeRun(
        makeRun('Everything went well'),
        assertions,
      );

      expect(result.assertionResults[0].passed).toBe(true);
      expect(result.assertionResults[0].confidence).toBe(1.0);
      expect(sendMessageMock).not.toHaveBeenCalled();
    });

    it('should fail when output contains the value (case-insensitive)', async () => {
      const assertions: EvalAssertion[] = [
        { type: 'not_contains', value: 'ERROR' },
      ];

      const result = await service.gradeRun(
        makeRun('An error occurred'),
        assertions,
      );

      expect(result.assertionResults[0].passed).toBe(false);
      expect(sendMessageMock).not.toHaveBeenCalled();
    });
  });

  // ── regex assertion ───────────────────────────────────────────────

  describe('regex assertion', () => {
    it('should pass when regex matches the output', async () => {
      const assertions: EvalAssertion[] = [
        { type: 'regex', value: '\\d{3}-\\d{4}' },
      ];

      const result = await service.gradeRun(
        makeRun('Call us at 555-1234'),
        assertions,
      );

      expect(result.assertionResults[0].passed).toBe(true);
      expect(result.assertionResults[0].confidence).toBe(1.0);
      expect(sendMessageMock).not.toHaveBeenCalled();
    });

    it('should fail when regex does not match the output', async () => {
      const assertions: EvalAssertion[] = [
        { type: 'regex', value: '^\\d+$' },
      ];

      const result = await service.gradeRun(
        makeRun('Not a number'),
        assertions,
      );

      expect(result.assertionResults[0].passed).toBe(false);
      expect(sendMessageMock).not.toHaveBeenCalled();
    });

    it('should fail gracefully with invalid regex pattern', async () => {
      const assertions: EvalAssertion[] = [
        { type: 'regex', value: '[invalid(' },
      ];

      const result = await service.gradeRun(
        makeRun('Some output'),
        assertions,
      );

      expect(result.assertionResults[0].passed).toBe(false);
      expect(result.assertionResults[0].evidence).toContain('Invalid regex');
      expect(result.assertionResults[0].confidence).toBe(1.0);
      expect(sendMessageMock).not.toHaveBeenCalled();
    });
  });

  // ── All deterministic — no Claude call ────────────────────────────

  describe('all deterministic assertions', () => {
    it('should not call Claude when all assertions are deterministic', async () => {
      const assertions: EvalAssertion[] = [
        { type: 'contains', value: 'hello' },
        { type: 'not_contains', value: 'error' },
        { type: 'regex', value: 'h\\w+o' },
      ];

      const result = await service.gradeRun(
        makeRun('hello world'),
        assertions,
      );

      expect(sendMessageMock).not.toHaveBeenCalled();
      expect(result.assertionResults).toHaveLength(3);
      expect(result.assertionResults.every((r) => r.passed)).toBe(true);
      expect(result.overall).toBe('pass');
      expect(result.score).toBe(100);
    });

    it('should compute partial when some deterministic assertions fail', async () => {
      const assertions: EvalAssertion[] = [
        { type: 'contains', value: 'hello' },
        { type: 'contains', value: 'goodbye' },
        { type: 'not_contains', value: 'error' },
      ];

      const result = await service.gradeRun(
        makeRun('hello world'),
        assertions,
      );

      expect(sendMessageMock).not.toHaveBeenCalled();
      expect(result.assertionResults[0].passed).toBe(true);
      expect(result.assertionResults[1].passed).toBe(false);
      expect(result.assertionResults[2].passed).toBe(true);
      expect(result.overall).toBe('partial');
      expect(result.score).toBe(67); // 2/3 = 66.67 → 67
    });
  });

  // ── All LLM assertions — full Claude call ─────────────────────────

  describe('all LLM assertions', () => {
    it('should send all semantic/custom assertions to Claude', async () => {
      const graderJson = JSON.stringify({
        assertionResults: [
          { passed: true, evidence: 'Semantically matches', confidence: 0.9 },
          { passed: false, evidence: 'Does not meet criteria', confidence: 0.8 },
        ],
        overallScore: 50,
        overallAssessment: 'partial',
      });

      sendMessageMock.mockResolvedValue({
        content: graderJson,
        usage: { inputTokens: 100, outputTokens: 50 },
      });

      const assertions: EvalAssertion[] = [
        { type: 'semantic', value: 'output should be polite' },
        { type: 'custom', value: 'uses formal language' },
      ];

      const result = await service.gradeRun(
        makeRun('Dear Sir, thank you.'),
        assertions,
      );

      expect(sendMessageMock).toHaveBeenCalledTimes(1);
      expect(result.assertionResults).toHaveLength(2);
      expect(result.assertionResults[0].passed).toBe(true);
      expect(result.assertionResults[0].confidence).toBe(0.9);
      expect(result.assertionResults[1].passed).toBe(false);
      // Overall is computed locally: 1/2 = 50 → partial
      expect(result.overall).toBe('partial');
      expect(result.score).toBe(50);
    });
  });

  // ── M2: grading infrastructure errors ────────────────────────────
  describe('grading infrastructure errors', () => {
    it('sets gradingError (not a skill failure) when the LLM grading call throws', async () => {
      sendMessageMock.mockRejectedValue(new Error('grader API down'));

      const result = await service.gradeRun(makeRun('some output'), [
        { type: 'semantic', value: 'output should be polite' },
      ]);

      // The infra error is recorded so benchmarks can exclude this run...
      expect(result.gradingError).toBe('grader API down');
      // ...while the assertion is still marked failed to keep the shape intact.
      expect(result.assertionResults[0].passed).toBe(false);
      expect(result.assertionResults[0].evidence).toContain('grader API down');
    });

    it('does not set gradingError when grading succeeds', async () => {
      sendMessageMock.mockResolvedValue({
        content: JSON.stringify({
          assertionResults: [{ passed: true, evidence: 'ok', confidence: 0.9 }],
          overallScore: 100,
          overallAssessment: 'pass',
        }),
        usage: { inputTokens: 10, outputTokens: 5 },
      });

      const result = await service.gradeRun(makeRun('out'), [
        { type: 'semantic', value: 'polite' },
      ]);

      expect(result.gradingError).toBeUndefined();
    });
  });

  // ── Grader-response parsing robustness (characterization) ─────────
  describe('grader response parsing', () => {
    const semanticAssertions: EvalAssertion[] = [
      { type: 'semantic', value: 'output should be polite' },
    ];

    it('parses grader JSON wrapped in a markdown code fence', async () => {
      const graderJson = JSON.stringify({
        assertionResults: [{ passed: true, evidence: 'Polite', confidence: 0.9 }],
        overallScore: 100,
        overallAssessment: 'pass',
      });
      sendMessageMock.mockResolvedValue({
        content: '```json\n' + graderJson + '\n```',
        usage: { inputTokens: 10, outputTokens: 5 },
      });

      const result = await service.gradeRun(makeRun('Hello.'), semanticAssertions);

      expect(result.assertionResults).toHaveLength(1);
      expect(result.assertionResults[0].passed).toBe(true);
    });

    it('falls back to a failed result when the grader response is unparseable', async () => {
      sendMessageMock.mockResolvedValue({
        content: 'I was unable to produce a structured response.',
        usage: { inputTokens: 10, outputTokens: 5 },
      });

      const result = await service.gradeRun(makeRun('Hello.'), semanticAssertions);

      expect(result.assertionResults).toHaveLength(1);
      expect(result.assertionResults[0].passed).toBe(false);
      expect(result.assertionResults[0].evidence).toBe('Could not parse grader response');
      expect(result.score).toBe(0);
      expect(result.overall).toBe('fail');
    });
  });

  // ── Mixed assertions — deterministic + LLM ────────────────────────

  describe('mixed assertions (deterministic + LLM)', () => {
    it('should only send LLM assertions to Claude and merge results in order', async () => {
      // Claude will receive ONLY the semantic assertion (index 1 in the original array)
      const graderJson = JSON.stringify({
        assertionResults: [
          {
            passed: true,
            evidence: 'Output is polite in tone',
            confidence: 0.85,
          },
        ],
        overallScore: 100,
        overallAssessment: 'pass',
      });

      sendMessageMock.mockResolvedValue({
        content: graderJson,
        usage: { inputTokens: 80, outputTokens: 40 },
      });

      const assertions: EvalAssertion[] = [
        { type: 'contains', value: 'thank you' },       // index 0 — deterministic
        { type: 'semantic', value: 'polite tone' },      // index 1 — LLM
        { type: 'not_contains', value: 'error' },        // index 2 — deterministic
      ];

      const result = await service.gradeRun(
        makeRun('Thank you for your help!'),
        assertions,
      );

      // Claude should only receive the semantic assertion
      expect(sendMessageMock).toHaveBeenCalledTimes(1);
      const callArgs = sendMessageMock.mock.calls[0][0];
      const userMessage: string = callArgs.messages[0].content;
      // The request should mention only 1 assertion and it should be semantic
      expect(userMessage).toContain('[semantic]');
      expect(userMessage).not.toContain('[contains]');
      expect(userMessage).not.toContain('[not_contains]');

      // Results should be in original order
      expect(result.assertionResults).toHaveLength(3);
      // Index 0: contains "thank you" — deterministic pass
      expect(result.assertionResults[0].assertion.type).toBe('contains');
      expect(result.assertionResults[0].passed).toBe(true);
      expect(result.assertionResults[0].confidence).toBe(1.0);
      // Index 1: semantic — LLM pass
      expect(result.assertionResults[1].assertion.type).toBe('semantic');
      expect(result.assertionResults[1].passed).toBe(true);
      expect(result.assertionResults[1].confidence).toBe(0.85);
      // Index 2: not_contains "error" — deterministic pass
      expect(result.assertionResults[2].assertion.type).toBe('not_contains');
      expect(result.assertionResults[2].passed).toBe(true);
      expect(result.assertionResults[2].confidence).toBe(1.0);

      // Overall: all pass → pass, 100
      expect(result.overall).toBe('pass');
      expect(result.score).toBe(100);
    });

    it('should handle mixed results with some failing', async () => {
      const graderJson = JSON.stringify({
        assertionResults: [
          {
            passed: false,
            evidence: 'Output is not formal',
            confidence: 0.7,
          },
        ],
        overallScore: 0,
        overallAssessment: 'fail',
      });

      sendMessageMock.mockResolvedValue({
        content: graderJson,
        usage: { inputTokens: 80, outputTokens: 40 },
      });

      const assertions: EvalAssertion[] = [
        { type: 'contains', value: 'hello' },            // pass
        { type: 'custom', value: 'uses formal language' }, // fail (from LLM)
        { type: 'regex', value: '\\d+' },                 // fail (no numbers)
      ];

      const result = await service.gradeRun(
        makeRun('hello casual world'),
        assertions,
      );

      expect(result.assertionResults[0].passed).toBe(true);   // contains
      expect(result.assertionResults[1].passed).toBe(false);  // custom (LLM)
      expect(result.assertionResults[2].passed).toBe(false);  // regex
      expect(result.overall).toBe('partial');
      expect(result.score).toBe(33); // 1/3 = 33.33 → 33
    });
  });

  // ── System prompt structure (caching) ────────────────────────────

  describe('system prompt structure', () => {
    const semanticAssertion: EvalAssertion = { type: 'semantic', value: 'polite tone' };
    const graderResponse = JSON.stringify({
      assertionResults: [{ passed: true, evidence: 'Polite', confidence: 0.9 }],
      overallScore: 100,
      overallAssessment: 'pass',
    });

    it('uses systemBlocks (not system) when skillContent is provided', async () => {
      sendMessageMock.mockResolvedValue({ content: graderResponse });

      await service.gradeRun(
        makeRun('Thank you for your help'),
        [semanticAssertion],
        undefined,
        'skill content here',
      );

      const callArgs = sendMessageMock.mock.calls[0][0];
      expect(callArgs.system).toBeUndefined();
      expect(callArgs.systemBlocks).toBeDefined();
    });

    it('sends two system blocks when skillContent is provided: grader + skill content', async () => {
      sendMessageMock.mockResolvedValue({ content: graderResponse });

      await service.gradeRun(
        makeRun('Thank you for your help'),
        [semanticAssertion],
        undefined,
        'The skill tells Claude to be helpful',
      );

      const { systemBlocks } = sendMessageMock.mock.calls[0][0];
      expect(systemBlocks).toHaveLength(2);
      expect(systemBlocks[0].text).toBe('mock grader prompt');
      expect(systemBlocks[1].text).toContain('The skill tells Claude to be helpful');
      expect(systemBlocks[1].text).toContain('## Skill Content');
    });

    it('sends one system block when skillContent is absent: grader only', async () => {
      sendMessageMock.mockResolvedValue({ content: graderResponse });

      await service.gradeRun(
        makeRun('Thank you for your help'),
        [semanticAssertion],
      );

      const { systemBlocks } = sendMessageMock.mock.calls[0][0];
      expect(systemBlocks).toHaveLength(1);
      expect(systemBlocks[0].text).toBe('mock grader prompt');
    });

    it('marks all system blocks as cached', async () => {
      sendMessageMock.mockResolvedValue({ content: graderResponse });

      await service.gradeRun(
        makeRun('Thank you for your help'),
        [semanticAssertion],
        undefined,
        'skill content',
      );

      const { systemBlocks } = sendMessageMock.mock.calls[0][0];
      expect(systemBlocks.every((b: { cached?: boolean }) => b.cached === true)).toBe(true);
    });
  });

  // ── LLM grading failure ──────────────────────────────────────────

  describe('LLM grading failure', () => {
    it('should mark LLM assertions as failed but keep deterministic results on error', async () => {
      sendMessageMock.mockRejectedValue(new Error('API timeout'));

      const assertions: EvalAssertion[] = [
        { type: 'contains', value: 'hello' },
        { type: 'semantic', value: 'polite' },
      ];

      const result = await service.gradeRun(
        makeRun('hello world'),
        assertions,
      );

      // Deterministic assertion still passes
      expect(result.assertionResults[0].passed).toBe(true);
      expect(result.assertionResults[0].assertion.type).toBe('contains');

      // LLM assertion marked as failed with error evidence
      expect(result.assertionResults[1].passed).toBe(false);
      expect(result.assertionResults[1].evidence).toMatch(/Grading failed:/);

      // Overall: partial (1/2)
      expect(result.overall).toBe('partial');
      expect(result.score).toBe(50);
    });
  });

  // ── Overall score computation ─────────────────────────────────────

  describe('overall score computation', () => {
    it('should return partial when some assertions fail', async () => {
      const assertions: EvalAssertion[] = [
        { type: 'contains', value: 'missing' },
        { type: 'not_contains', value: 'present' },
      ];

      const result = await service.gradeRun(
        makeRun('This text has present but not missing'),
        assertions,
      );

      // "missing" is actually found in the output: "not missing" → assertion passes
      // Wait — let me re-read: "This text has present but not missing"
      // contains "missing" → true (pass)
      // not_contains "present" → false (fail, because "present" IS in the output)
      // So 1/2 = partial
      // Let me use values that both fail:
      expect(result.overall).toBe('partial');
    });

    it('should compute score correctly for all-fail scenario', async () => {
      const assertions: EvalAssertion[] = [
        { type: 'contains', value: 'xyz' },
        { type: 'contains', value: 'abc' },
      ];

      const result = await service.gradeRun(
        makeRun('nothing matches here'),
        assertions,
      );

      expect(result.overall).toBe('fail');
      expect(result.score).toBe(0);
    });
  });

  // ── EvalGrading shape validation ──────────────────────────────────

  describe('EvalGrading shape', () => {
    it('should always return a complete EvalGrading object', async () => {
      const assertions: EvalAssertion[] = [
        { type: 'contains', value: 'test' },
      ];

      const result = await service.gradeRun(
        makeRun('test output'),
        assertions,
      );

      // Verify all required fields are present
      expect(result).toHaveProperty('overall');
      expect(result).toHaveProperty('score');
      expect(result).toHaveProperty('assertionResults');
      expect(result).toHaveProperty('gradedAt');
      expect(result).toHaveProperty('gradedBy');
      expect(typeof result.overall).toBe('string');
      expect(typeof result.score).toBe('number');
      expect(Array.isArray(result.assertionResults)).toBe(true);
      expect(typeof result.gradedAt).toBe('string');
      expect(result.gradedBy).toBe('auto');

      // Verify assertion result shape
      const ar = result.assertionResults[0];
      expect(ar).toHaveProperty('assertion');
      expect(ar).toHaveProperty('passed');
      expect(ar).toHaveProperty('evidence');
      expect(ar.assertion).toHaveProperty('type');
      expect(ar.assertion).toHaveProperty('value');
    });
  });

  // ── plainEnglishSummary ───────────────────────────────────────────

  describe('plainEnglishSummary', () => {
    it('includes plainEnglishSummary in EvalGrading when grader returns it', async () => {
      const run = makeRun('The answer is 42');
      const assertion: EvalAssertion = {
        type: 'semantic',
        value: 'The output should contain a number',
      };

      sendMessageMock.mockResolvedValue({
        content: [
          {
            type: 'tool_use',
            name: 'return_grading',
            input: {
              assertionResults: [{ passed: true, evidence: 'Contains a number' }],
              overallScore: 90,
              overallAssessment: 'pass',
              plainEnglishSummary: 'Your skill handles direct prompts well.',
            },
          },
        ],
      });

      const result = await service.gradeRun(run, [assertion]);
      expect(result.plainEnglishSummary).toBe('Your skill handles direct prompts well.');
    });

    it('omits plainEnglishSummary when grader does not return it', async () => {
      const run = makeRun('The answer is 42');
      const assertion: EvalAssertion = {
        type: 'semantic',
        value: 'The output should contain a number',
      };

      sendMessageMock.mockResolvedValue({
        content: [
          {
            type: 'tool_use',
            name: 'return_grading',
            input: {
              assertionResults: [{ passed: true, evidence: 'Contains a number' }],
              overallScore: 90,
              overallAssessment: 'pass',
            },
          },
        ],
      });

      const result = await service.gradeRun(run, [assertion]);
      expect(result.plainEnglishSummary).toBeUndefined();
    });

    it('does not include plainEnglishSummary for deterministic-only assertions', async () => {
      const run = makeRun('The answer is 42');
      const assertion: EvalAssertion = {
        type: 'contains',
        value: '42',
      };

      const result = await service.gradeRun(run, [assertion]);
      expect(sendMessageMock).not.toHaveBeenCalled();
      expect(result.plainEnglishSummary).toBeUndefined();
    });
  });
});

// ── grader.md content — QUAL-01 threshold alignment ──────────────────

describe('grader.md content — QUAL-01 threshold alignment', () => {
  let graderContent: string;

  beforeAll(async () => {
    // Path: from packages/backend/src/eval/ → ../../../../ is monorepo root → packages/shared/prompts/eval/
    graderContent = await readFile(
      join(__dirname, '../../../../packages/shared/prompts/eval/grader.md'),
      'utf-8',
    );
  });

  it('contains pass threshold documentation (ALL assertions passed)', () => {
    expect(graderContent).toContain('ALL assertions passed');
  });

  it('contains fail threshold documentation (NO assertions passed)', () => {
    expect(graderContent).toContain('NO assertions passed');
  });

  it('contains partial threshold documentation with 1–99% range', () => {
    expect(graderContent).toMatch(/partial.*1.{1,5}99%/s);
  });

  it('contains at least two few-shot examples (Example 1 and Example 2)', () => {
    expect(graderContent).toContain('Example 1');
    expect(graderContent).toContain('Example 2');
  });

  it('threshold section appears before Response Format section', () => {
    const thresholdIdx = graderContent.indexOf('Scoring thresholds');
    const responseFormatIdx = graderContent.indexOf('## Response Format');
    expect(thresholdIdx).toBeGreaterThan(-1);
    expect(responseFormatIdx).toBeGreaterThan(-1);
    expect(thresholdIdx).toBeLessThan(responseFormatIdx);
  });
});
