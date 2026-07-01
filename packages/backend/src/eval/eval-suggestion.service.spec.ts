import { Test, TestingModule } from '@nestjs/testing';
import { EvalSuggestionService } from './eval-suggestion.service';
import { LlmService } from '../generation/llm/llm.service.js';
import { PromptLoaderService } from '../generation/prompts/prompt-loader.service';
import type { EvalCase, CoverageGap } from '@skillspell/shared';

describe('EvalSuggestionService — analyzeCoverageGaps()', () => {
  let service: EvalSuggestionService;

  const makeCase = (overrides: Partial<EvalCase> = {}): EvalCase => ({
    id: 'case-1', skillId: 'skill-1', name: 'Case 1',
    prompt: 'Write a summary of this document',
    assertions: [{ type: 'semantic', value: 'has summary', description: 'Contains a summary' }],
    expectedOutput: '', split: 'train', createdAt: new Date().toISOString(),
    ...overrides,
  } as EvalCase);

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      providers: [
        EvalSuggestionService,
        { provide: LlmService, useValue: { runLightQuery: jest.fn(), model: 'claude-sonnet-4-6' } },
        { provide: PromptLoaderService, useValue: { render: jest.fn().mockResolvedValue('') } },
      ],
    }).compile();
    service = module.get<EvalSuggestionService>(EvalSuggestionService);
  });

  it('detects input-length gap when all prompts are similar length', () => {
    const cases = [
      makeCase({ id: '1', prompt: 'Write a summary of this doc' }),
      makeCase({ id: '2', prompt: 'Create a summary for the doc' }),
      makeCase({ id: '3', prompt: 'Summarize this document now' }),
    ];
    const report = service.analyzeCoverageGaps(cases);
    expect(report.gaps.some(g => g.dimension === 'input-length')).toBe(true);
  });

  it('does not flag input-length when prompts vary in length', () => {
    const cases = [
      makeCase({ id: '1', prompt: 'short' }),
      makeCase({ id: '2', prompt: 'This is a much longer prompt that goes into considerable detail about the task requirements and context' }),
      makeCase({ id: '3', prompt: 'Medium length prompt here with some context' }),
    ];
    const report = service.analyzeCoverageGaps(cases);
    expect(report.gaps.some(g => g.dimension === 'input-length')).toBe(false);
  });

  it('detects negative-cases gap when no prompts contain decline keywords', () => {
    const cases = [
      makeCase({ id: '1', prompt: 'Write a good summary' }),
      makeCase({ id: '2', prompt: 'Create documentation for this' }),
    ];
    const report = service.analyzeCoverageGaps(cases);
    expect(report.gaps.some(g => g.dimension === 'negative-cases')).toBe(true);
  });

  it('does not flag negative-cases when a prompt contains "invalid"', () => {
    const cases = [
      makeCase({ id: '1', prompt: 'Write a summary' }),
      makeCase({ id: '2', prompt: 'Handle this invalid input gracefully' }),
    ];
    const report = service.analyzeCoverageGaps(cases);
    expect(report.gaps.some(g => g.dimension === 'negative-cases')).toBe(false);
  });

  it('detects edge-cases gap when fewer than 2 prompts contain edge-case keywords', () => {
    const cases = [
      makeCase({ id: '1', prompt: 'Write a normal summary' }),
      makeCase({ id: '2', prompt: 'Create standard documentation' }),
    ];
    const report = service.analyzeCoverageGaps(cases);
    expect(report.gaps.some(g => g.dimension === 'edge-cases')).toBe(true);
  });

  it('does not flag edge-cases when 2+ prompts contain edge-case keywords', () => {
    const cases = [
      makeCase({ id: '1', prompt: 'Handle the empty input case' }),
      makeCase({ id: '2', prompt: 'Write summary for very long document with many sections' }),
    ];
    const report = service.analyzeCoverageGaps(cases);
    expect(report.gaps.some(g => g.dimension === 'edge-cases')).toBe(false);
  });

  it('detects assertion-diversity gap when >80% of assertions are same type', () => {
    const cases = [
      makeCase({ id: '1', assertions: [{ type: 'semantic', value: 'a' }] }),
      makeCase({ id: '2', assertions: [{ type: 'semantic', value: 'b' }] }),
      makeCase({ id: '3', assertions: [{ type: 'semantic', value: 'c' }] }),
      makeCase({ id: '4', assertions: [{ type: 'semantic', value: 'd' }] }),
      makeCase({ id: '5', assertions: [{ type: 'semantic', value: 'e' }, { type: 'contains', value: 'f' }] }),
    ];
    const report = service.analyzeCoverageGaps(cases);
    expect(report.gaps.some(g => g.dimension === 'assertion-diversity')).toBe(true);
  });

  it('does not flag assertion-diversity when assertion types are varied', () => {
    const cases = [
      makeCase({ id: '1', assertions: [{ type: 'semantic', value: 'a' }] }),
      makeCase({ id: '2', assertions: [{ type: 'contains', value: 'b' }] }),
      makeCase({ id: '3', assertions: [{ type: 'regex', value: 'c' }] }),
    ];
    const report = service.analyzeCoverageGaps(cases);
    expect(report.gaps.some(g => g.dimension === 'assertion-diversity')).toBe(false);
  });

  it('detects expected-output gap when no cases have expectedOutput', () => {
    const cases = [
      makeCase({ id: '1', expectedOutput: '' }),
      makeCase({ id: '2', expectedOutput: undefined as unknown as string }),
    ];
    const report = service.analyzeCoverageGaps(cases);
    expect(report.gaps.some(g => g.dimension === 'expected-output')).toBe(true);
  });

  it('does not flag expected-output when at least one case has expectedOutput', () => {
    const cases = [
      makeCase({ id: '1', expectedOutput: '' }),
      makeCase({ id: '2', expectedOutput: 'Expected output text here' }),
    ];
    const report = service.analyzeCoverageGaps(cases);
    expect(report.gaps.some(g => g.dimension === 'expected-output')).toBe(false);
  });

  it('returns coverageScore 100 when no gaps detected', () => {
    const cases = [
      makeCase({ id: '1', prompt: 'short', assertions: [{ type: 'semantic', value: 'a' }], expectedOutput: 'yes' }),
      makeCase({ id: '2', prompt: 'This is a much longer prompt with lots of detail about requirements and context for the skill', assertions: [{ type: 'contains', value: 'b' }], expectedOutput: 'yes' }),
      makeCase({ id: '3', prompt: 'Handle this invalid request', assertions: [{ type: 'regex', value: 'c' }] }),
      makeCase({ id: '4', prompt: 'Process empty input edge case', assertions: [{ type: 'not_contains', value: 'd' }] }),
      makeCase({ id: '5', prompt: 'Handle very long document with many sections and edge cases', assertions: [{ type: 'semantic', value: 'e' }] }),
    ];
    const report = service.analyzeCoverageGaps(cases);
    expect(report.coverageScore).toBe(100);
    expect(report.gaps).toHaveLength(0);
  });

  it('each detected gap includes a non-empty suggestionPrompt', () => {
    const cases = [makeCase({ id: '1' })];
    const report = service.analyzeCoverageGaps(cases);
    for (const gap of report.gaps) {
      expect(gap.suggestionPrompt.length).toBeGreaterThan(10);
    }
  });
});

describe('EvalSuggestionService — suggestGapCounts()', () => {
  let service: EvalSuggestionService;
  let runLightQueryMock: jest.Mock;

  beforeEach(async () => {
    runLightQueryMock = jest.fn();
    const module: TestingModule = await Test.createTestingModule({
      providers: [
        EvalSuggestionService,
        { provide: LlmService, useValue: { runLightQuery: runLightQueryMock, model: 'claude-sonnet-4-6' } },
        { provide: PromptLoaderService, useValue: { render: jest.fn().mockResolvedValue('system prompt') } },
      ],
    }).compile();
    service = module.get<EvalSuggestionService>(EvalSuggestionService);
  });

  it('returns count per dimension from model response', async () => {
    runLightQueryMock.mockResolvedValue({
      content: JSON.stringify({
        counts: [
          { dimension: 'negative-cases', count: 5, reasoning: 'complex skill needs adversarial tests' },
          { dimension: 'edge-cases', count: 4, reasoning: 'boundary conditions matter' },
        ],
      }),
    });

    const gaps: CoverageGap[] = [
      { dimension: 'negative-cases', severity: 'high', description: 'no negative cases', suggestionPrompt: 'generate negative cases' },
      { dimension: 'edge-cases', severity: 'medium', description: 'no edge cases', suggestionPrompt: 'generate edge cases' },
    ];

    const result = await service.suggestGapCounts(gaps, { name: 'My Skill', description: 'A test skill' });

    expect(result['negative-cases']).toBe(5);
    expect(result['edge-cases']).toBe(4);
  });

  it('clamps returned count to [3, 10]', async () => {
    runLightQueryMock.mockResolvedValue({
      content: JSON.stringify({
        counts: [
          { dimension: 'input-length', count: 20, reasoning: 'too many' },
          { dimension: 'expected-output', count: 1, reasoning: 'too few' },
        ],
      }),
    });

    const gaps: CoverageGap[] = [
      { dimension: 'input-length', severity: 'medium', description: 'similar lengths', suggestionPrompt: 'generate varied' },
      { dimension: 'expected-output', severity: 'medium', description: 'no expected outputs', suggestionPrompt: 'add expected' },
    ];

    const result = await service.suggestGapCounts(gaps, { name: 'Skill', description: 'desc' });

    expect(result['input-length']).toBe(10);    // clamped from 20
    expect(result['expected-output']).toBe(3);  // clamped from 1
  });

  it('falls back to 3 for missing dimensions', async () => {
    runLightQueryMock.mockResolvedValue({
      content: JSON.stringify({ counts: [] }),
    });

    const gaps: CoverageGap[] = [
      { dimension: 'negative-cases', severity: 'high', description: 'no negative cases', suggestionPrompt: 'generate' },
    ];

    const result = await service.suggestGapCounts(gaps, { name: 'Skill', description: 'desc' });

    expect(result['negative-cases']).toBe(3);
  });

  it('returns fallback map on parse error', async () => {
    runLightQueryMock.mockResolvedValue({ content: 'not valid json' });

    const gaps: CoverageGap[] = [
      { dimension: 'edge-cases', severity: 'medium', description: 'no edge cases', suggestionPrompt: 'generate' },
    ];

    const result = await service.suggestGapCounts(gaps, { name: 'Skill', description: 'desc' });

    expect(result['edge-cases']).toBe(3);
  });

  it('returns empty object immediately when gaps array is empty', async () => {
    const result = await service.suggestGapCounts([], { name: 'Skill', description: 'desc' });
    expect(result).toEqual({});
    expect(runLightQueryMock).not.toHaveBeenCalled();
  });
});
