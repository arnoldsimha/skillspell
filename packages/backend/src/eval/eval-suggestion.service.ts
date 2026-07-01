import { Injectable, Logger } from '@nestjs/common';
import { formatError } from '../common/utils/format-error.js';
import { LlmService } from '../generation/llm/llm.service.js';
import { PromptLoaderService } from '../generation/prompts/prompt-loader.service.js';
import type { TestPromptSuggestion } from '../generation/types.js';
import type { AssertionReplacementSuggestion, SkillAnalysis, EvalCase, CoverageGapReport, CoverageGap } from '@skillspell/shared';
import {
  extractTestSuggestionsJson,
  extractGeneratedTestEvalsJson,
  extractJson,
} from '../generation/prompts/llm-response-parser.js';
import {
  SUGGEST_GAP_COUNTS_TOOL_SCHEMA,
  TEST_SUGGESTIONS_TOOL_SCHEMA,
  GENERATE_TEST_EVALS_TOOL_SCHEMA,
} from './eval-suggestion.schemas.js';

/**
 * Generates AI-powered suggestions for the eval system:
 * - Test prompt suggestions (suggestTestPrompts)
 * - Bulk test eval case generation (generateTestEvals)
 *
 * Uses the lightweight Messages API path (no full agent overhead).
 *
 * These methods belong to the eval domain, not the generation domain.
 */
@Injectable()
export class EvalSuggestionService {
  private readonly logger = new Logger(EvalSuggestionService.name);

  /**
   * Number of coverage dimensions checked by analyzeCoverageGaps. The coverage
   * score is (DIMENSIONS - gapsFound) / DIMENSIONS, so this MUST equal the
   * number of gap checks in that method. Update both together.
   */
  private static readonly COVERAGE_DIMENSION_COUNT = 5;

  constructor(
    private readonly llm: LlmService,
    private readonly promptLoaderService: PromptLoaderService,
  ) {}

  /**
   * Generate test prompt suggestions for eval cases.
   * Uses the lightweight query path with the light model.
   * Reads the prompt template from the eval module's prompts directory.
   *
   * @param skillContext - The skill's name, description, and content
   * @param existingPrompt - Optional partial prompt the user is typing
   * @returns Array of up to 5 test prompt suggestions
   */
  async suggestTestPrompts(
    skillContext: {
      name: string;
      description: string;
      skillContent: string;
    },
    existingPrompt?: string,
    signal?: AbortSignal,
    testCaseName?: string,
  ): Promise<TestPromptSuggestion[]> {
    // Use centralized prompt loader (loaded at startup, cached on first access)
    const systemInstruction = await this.promptLoaderService.render('suggest-test-prompts', {});

    const payload = JSON.stringify({
      skillName: skillContext.name,
      skillDescription: skillContext.description,
      skillContent: skillContext.skillContent,
      existingPrompt: existingPrompt || '',
      testCaseName: testCaseName || '',
    });

    // N1: Use tool_use structured output for reliable JSON parsing.
    // 2048 tokens is sufficient for up to 5 test suggestions with assertions,
    // expectedOutput, and context (~1000-1500 tokens typical output).
    const { content } = await this.llm.runLightQuery(
      systemInstruction,
      payload,
      {
        maxTokens: 2048,
        model: this.llm.model,
        timeoutMs: this.llm.generationTimeoutMs,
        toolSchema: TEST_SUGGESTIONS_TOOL_SCHEMA,
        signal,
      },
    );

    try {
      // N1: Try direct JSON parse first (structured output guarantees valid JSON)
      const parsed = JSON.parse(content);
      if (parsed.suggestions && Array.isArray(parsed.suggestions)) {
        return parsed.suggestions
          .filter(
            (s: Record<string, unknown>) =>
              typeof s.name === 'string' && typeof s.prompt === 'string',
          )
          .slice(0, 5) as TestPromptSuggestion[];
      }
      // Fallback to existing extraction if response shape unexpected
      return extractTestSuggestionsJson(content);
    } catch {
      // Fallback: use existing extraction pipeline (handles non-tool_use responses)
      try {
        return extractTestSuggestionsJson(content);
      } catch (error) {
        this.logger.error(`Failed to parse test prompt suggestions: ${formatError(error)}`);
        return [];
      }
    }
  }

  /**
   * Analyze a skill to identify key behaviors, edge cases, constraints,
   * and weak areas. This analysis is used as a pre-pass before generating
   * targeted test cases (C4).
   *
   * @param skillContext - The skill's name, description, and content
   * @param existingCaseNames - Names of already-existing eval cases
   * @param graderFeedbackSummary - Optional summary of prior eval run failures
   * @returns Structured skill analysis
   */
  async analyzeSkillForTesting(
    skillContext: {
      name: string;
      description: string;
      skillContent: string;
    },
    existingCaseNames: string[] = [],
    graderFeedbackSummary?: string,
    signal?: AbortSignal,
  ): Promise<SkillAnalysis | null> {
    try {
      const systemInstruction = await this.promptLoaderService.render(
        'analyze-skill-for-testing',
        {},
      );

      const payload = JSON.stringify({
        skillName: skillContext.name,
        skillDescription: skillContext.description,
        skillContent: skillContext.skillContent,
        existingCaseNames,
        graderFeedback: graderFeedbackSummary || '',
      });

      this.logger.log(`Running skill analysis pre-pass for "${skillContext.name}"`);

      const { content } = await this.llm.runLightQuery(
        systemInstruction,
        payload,
        {
          maxTokens: 4096,
          model: this.llm.model,
          timeoutMs: this.llm.generationTimeoutMs,
          signal,
        },
      );

      const jsonStr = extractJson(content);
      const parsed = JSON.parse(jsonStr);

      // Validate and normalize — extract string arrays with a cap
      const stringsSlice = (val: unknown, max: number): string[] =>
        Array.isArray(val) ? val.filter((s): s is string => typeof s === 'string').slice(0, max) : [];

      const analysis: SkillAnalysis = {
        keyBehaviors: stringsSlice(parsed.keyBehaviors, 6),
        edgeCases: stringsSlice(parsed.edgeCases, 8),
        constraints: stringsSlice(parsed.constraints, 5),
        weakAreas: stringsSlice(parsed.weakAreas, 5),
        inputVariations: stringsSlice(parsed.inputVariations, 6),
        assertionStrategy: stringsSlice(parsed.assertionStrategy, 4),
      };

      const totalItems = analysis.keyBehaviors.length + analysis.edgeCases.length +
        analysis.constraints.length + analysis.weakAreas.length;

      if (totalItems === 0) {
        this.logger.warn('Skill analysis returned no items');
        return null;
      }

      this.logger.log(
        `Skill analysis complete: ${analysis.keyBehaviors.length} behaviors, ` +
        `${analysis.edgeCases.length} edge cases, ${analysis.constraints.length} constraints, ` +
        `${analysis.weakAreas.length} weak areas`,
      );

      return analysis;
    } catch (error) {
      this.logger.error(`Skill analysis pre-pass failed: ${formatError(error)}`);
      // Non-fatal — fall back to generation without analysis
      return null;
    }
  }

  /**
   * Generate test eval cases for a skill using AI.
   *
   * Uses the lightweight query path with the light model.
   * For counts > 20, batches into multiple sequential calls,
   * passing previously generated case names to avoid duplicates.
   *
   * @param skillContext - The skill's name, description, and content
   * @param count - Number of test cases to generate (1-100)
   * @param existingCaseNames - Names of already-existing eval cases
   * @param skillAnalysis - Optional pre-computed skill analysis (C4)
   * @param graderFeedbackSummary - Optional summary of prior eval run failures
   * @returns Array of generated test case suggestions
   */
  async generateTestEvals(
    skillContext: {
      name: string;
      description: string;
      skillContent: string;
    },
    count: number,
    existingCaseNames: string[] = [],
    skillAnalysis?: SkillAnalysis | null,
    graderFeedbackSummary?: string,
    signal?: AbortSignal,
    coverageHint?: string,
    onProgress?: (phase: 'analyzing' | 'generating', current: number, total: number) => void,
  ): Promise<TestPromptSuggestion[]> {
    // Use centralized prompt loader (loaded at startup, cached on first access)
    const systemInstruction = await this.promptLoaderService.render('generate-test-evals', {});

    const allGenerated: TestPromptSuggestion[] = [];
    const batchSize = 20;
    let remaining = count;

    while (remaining > 0) {
      const batchCount = Math.min(remaining, batchSize);
      const previouslyGenerated = allGenerated.map((c) => c.name);

      const payload: Record<string, unknown> = {
        skillName: skillContext.name,
        skillDescription: skillContext.description,
        skillContent: skillContext.skillContent,
        count: batchCount,
        existingCaseNames,
        previouslyGenerated,
      };

      // C4: Include skill analysis if available
      if (skillAnalysis) {
        payload.skillAnalysis = skillAnalysis;
      }

      // Include grader feedback summary if available
      if (graderFeedbackSummary) {
        payload.graderFeedbackSummary = graderFeedbackSummary;
      }

      // Include coverage hint from AI suggest-count if user accepted the suggestion
      if (coverageHint) {
        payload.coverageHint = coverageHint;
      }

      // Scale token limit: ~800 tokens per case + buffer
      const tokenLimit = Math.min(batchCount * 800 + 512, 16384);

      this.logger.log(
        `Generating batch of ${batchCount} test evals (${allGenerated.length} already generated, ${remaining} remaining)` +
        (skillAnalysis ? ' [with skill analysis]' : ''),
      );

      // Use the main model (AI_MODEL) for test eval generation
      // — not the light model — for higher quality adversarial/edge-case generation
      if (signal?.aborted) break;
      const { content } = await this.llm.runLightQuery(
        systemInstruction,
        JSON.stringify(payload),
        {
          maxTokens: tokenLimit,
          model: this.llm.model,
          timeoutMs: this.llm.generationTimeoutMs,
          toolSchema: GENERATE_TEST_EVALS_TOOL_SCHEMA,
          signal,
        },
      );

      try {
        // Tool_use guarantees valid JSON — try direct parse first, fall back to extractor.
        let batchResults: TestPromptSuggestion[];
        try {
          const parsed = JSON.parse(content);
          batchResults = (parsed.cases ?? parsed) as TestPromptSuggestion[];
          if (!Array.isArray(batchResults)) throw new Error('Expected array');
          batchResults = batchResults.filter((s) => typeof s.name === 'string' && typeof s.prompt === 'string');
        } catch {
          batchResults = extractGeneratedTestEvalsJson(content);
        }
        allGenerated.push(...batchResults);
        this.logger.log(
          `Batch generated ${batchResults.length} test evals (total: ${allGenerated.length})`,
        );
        const batchStart = allGenerated.length - batchResults.length;
        for (let i = 1; i <= batchResults.length; i++) {
          onProgress?.('generating', batchStart + i, count);
        }
      } catch (error) {
        this.logger.error(
          `Failed to parse generated test evals batch: ${formatError(error)}`,
        );
        // If a batch fails, break and return what we have so far
        break;
      }

      remaining -= batchCount;
    }

    return allGenerated;
  }

  /**
   * Analyze the skill and recommend an ideal number of test cases.
   * Returns a count (clamped to 1-30) and a one-sentence reasoning string.
   */
  async suggestTestCaseCount(
    skillContext: {
      name: string;
      description: string;
      skillContent: string;
      referenceFiles?: string[];
      scriptFiles?: string[];
      assetFiles?: string[];
    },
    signal?: AbortSignal,
  ): Promise<{
    count: number;
    reasoning: string;
    breakdown: { coreBehaviors: number; edgeCasesAndErrors: number; referenceFileScenarios: number; scriptPathScenarios: number } | null;
  }> {
    const systemPrompt = await this.promptLoaderService.render('suggest-test-case-count', {});

    const payload = JSON.stringify({
      skillName: skillContext.name,
      skillDescription: skillContext.description,
      skillContent: skillContext.skillContent,
      ...(skillContext.referenceFiles?.length ? { referenceFiles: skillContext.referenceFiles } : {}),
      ...(skillContext.scriptFiles?.length ? { scriptFiles: skillContext.scriptFiles } : {}),
      ...(skillContext.assetFiles?.length ? { assetFiles: skillContext.assetFiles } : {}),
    });

    this.logger.log(`Suggesting test case count for skill "${skillContext.name}"`);

    const { content } = await this.llm.runLightQuery(
      systemPrompt,
      payload,
      { maxTokens: 1024, signal },
    );

    try {
      const jsonStr = extractJson(content);
      const parsed = JSON.parse(jsonStr);

      const bd = parsed.breakdown && typeof parsed.breakdown === 'object' ? parsed.breakdown : null;
      const breakdown = bd ? {
        coreBehaviors: Math.max(0, Math.round(bd.coreBehaviors ?? 0)),
        edgeCasesAndErrors: Math.max(0, Math.round(bd.edgeCasesAndErrors ?? 0)),
        referenceFileScenarios: Math.max(0, Math.round(bd.referenceFileScenarios ?? 0)),
        scriptPathScenarios: Math.max(0, Math.round(bd.scriptPathScenarios ?? 0)),
      } : null;

      // Derive count from breakdown sum when available; fall back to top-level count field.
      let count: number;
      if (breakdown) {
        const sum = breakdown.coreBehaviors + breakdown.edgeCasesAndErrors
          + breakdown.referenceFileScenarios + breakdown.scriptPathScenarios;
        count = sum > 0 ? sum : (typeof parsed.count === 'number' ? parsed.count : 5);
      } else {
        count = typeof parsed.count === 'number' ? parsed.count : 5;
      }
      count = Math.min(Math.max(Math.round(count), 3), 30);
      const reasoning = typeof parsed.reasoning === 'string' ? parsed.reasoning : '';

      return { count, reasoning, breakdown };
    } catch (error) {
      this.logger.error(`Failed to parse suggest-count response: ${formatError(error)}`);
      return { count: 5, reasoning: '', breakdown: null };
    }
  }

  /**
   * Analyze a set of eval cases for coverage gaps across 5 dimensions.
   * All checks are deterministic — no LLM call.
   *
   * Called automatically after optimization completes.
   * Returns a report with gaps and a 0–100 coverage score.
   */
  analyzeCoverageGaps(evalCases: EvalCase[]): CoverageGapReport {
    if (evalCases.length === 0) {
      return { gaps: [], coverageScore: 0 };
    }

    const gaps: CoverageGap[] = [];

    // ── 1. input-length ──────────────────────────────────────────────
    const lengths = evalCases.map(c => c.prompt.length);
    const mean = lengths.reduce((s, l) => s + l, 0) / lengths.length;
    const stddev = Math.sqrt(
      lengths.reduce((s, l) => s + Math.pow(l - mean, 2), 0) / lengths.length,
    );
    if (mean > 0 && stddev / mean < 0.2) {
      gaps.push({
        dimension: 'input-length',
        severity: 'medium',
        description: `All ${evalCases.length} prompts are similar length (stddev ${Math.round(stddev)} chars vs mean ${Math.round(mean)}). Add variety: very short and very long inputs.`,
        suggestionPrompt: 'Generate 3 test cases: one with a very short (< 20 word) input, one with a medium-length input, and one with a very long (> 200 word) input.',
      });
    }

    // ── 2. negative-cases ────────────────────────────────────────────
    const NEGATIVE_KEYWORDS = ['invalid', 'wrong', 'reject', 'decline', 'should fail', 'should reject', 'fail to', "shouldn't", "don't"];
    const hasNegative = evalCases.some(c =>
      NEGATIVE_KEYWORDS.some(kw => c.prompt.toLowerCase().includes(kw)),
    );
    if (!hasNegative) {
      gaps.push({
        dimension: 'negative-cases',
        severity: 'high',
        description: 'No eval cases test how the skill handles invalid or out-of-scope requests.',
        suggestionPrompt: 'Generate 3 test cases where the input is invalid, out-of-scope, or the skill should decline the request. Include assertions that verify the skill handles each case gracefully.',
      });
    }

    // ── 3. edge-cases ────────────────────────────────────────────────
    const EDGE_KEYWORDS = ['empty', 'very long', 'special char', 'null', 'edge', 'boundary', 'extreme', 'corner case', 'overflow'];
    const edgeCaseCount = evalCases.filter(c =>
      EDGE_KEYWORDS.some(kw => c.prompt.toLowerCase().includes(kw)),
    ).length;
    if (edgeCaseCount < 2) {
      gaps.push({
        dimension: 'edge-cases',
        severity: 'medium',
        description: `Only ${edgeCaseCount} case${edgeCaseCount !== 1 ? 's' : ''} test boundary/edge inputs. Add at least 2 edge cases (empty input, very long input, special characters, etc.).`,
        suggestionPrompt: 'Generate 3 edge case test cases: one with an empty or minimal input, one with an unusually long input, and one with special characters or unusual formatting.',
      });
    }

    // ── 4. assertion-diversity ───────────────────────────────────────
    const allAssertions = evalCases.flatMap(c => c.assertions ?? []);
    if (allAssertions.length > 0) {
      const typeCounts = new Map<string, number>();
      for (const a of allAssertions) {
        typeCounts.set(a.type, (typeCounts.get(a.type) ?? 0) + 1);
      }
      const maxTypeCount = Math.max(...typeCounts.values());
      if (maxTypeCount / allAssertions.length > 0.8) {
        const dominantType = [...typeCounts.entries()].sort((a, b) => b[1] - a[1])[0][0];
        gaps.push({
          dimension: 'assertion-diversity',
          severity: 'medium',
          description: `${Math.round((maxTypeCount / allAssertions.length) * 100)}% of assertions are type "${dominantType}". Mix assertion types (contains, not_contains, regex, semantic) for stronger coverage.`,
          suggestionPrompt: `Generate 3 test cases that use assertion types other than "${dominantType}" — use contains, not_contains, regex, or semantic assertions to verify different aspects of the output.`,
        });
      }
    }

    // ── 5. expected-output ───────────────────────────────────────────
    const hasExpectedOutput = evalCases.some(c => c.expectedOutput && c.expectedOutput.trim().length > 0);
    if (!hasExpectedOutput) {
      gaps.push({
        dimension: 'expected-output',
        severity: 'medium',
        description: 'No eval cases have an expected output set. Adding expected outputs anchors grading and improves consistency.',
        suggestionPrompt: 'For 2–3 of the most important test cases, add an expectedOutput field showing exactly what the ideal skill response looks like.',
      });
    }

    const dimensions = EvalSuggestionService.COVERAGE_DIMENSION_COUNT;
    const coverageScore = Math.round(
      ((dimensions - gaps.length) / dimensions) * 100,
    );
    return { gaps, coverageScore };
  }

  /**
   * AI-recommend how many test cases to generate per coverage gap dimension.
   * Uses the light model with a structured output schema.
   * Never throws — returns fallback count of 3 for any missing or failed dimension.
   */
  async suggestGapCounts(
    gaps: CoverageGap[],
    skillContext: { name: string; description: string },
    signal?: AbortSignal,
  ): Promise<Record<string, number>> {
    const fallback = Object.fromEntries(gaps.map(g => [g.dimension, 3]));

    if (gaps.length === 0) return fallback;

    try {
      const systemPrompt = await this.promptLoaderService.render('suggest-gap-counts', {});

      const payload = JSON.stringify({
        skillName: skillContext.name,
        skillDescription: skillContext.description,
        gaps: gaps.map(g => ({ dimension: g.dimension, description: g.description })),
      });

      const { content } = await this.llm.runLightQuery(
        systemPrompt,
        payload,
        { maxTokens: 512, toolSchema: SUGGEST_GAP_COUNTS_TOOL_SCHEMA, signal },
      );

      const parsed = JSON.parse(content);
      const counts = parsed?.counts;

      if (!Array.isArray(counts)) return fallback;

      const result: Record<string, number> = { ...fallback };
      for (const entry of counts) {
        if (
          typeof entry.dimension === 'string' &&
          typeof entry.count === 'number' &&
          entry.dimension in result  // only accept dimensions from the input gaps
        ) {
          result[entry.dimension] = Math.min(10, Math.max(3, Math.round(entry.count)));
        }
      }
      return result;
    } catch {
      this.logger.warn('suggestGapCounts: failed to get AI counts, using fallback of 3 per gap');
      return fallback;
    }
  }

  /**
   * Suggest replacement assertions for non-discriminating assertions.
   * Uses the light model to analyze which assertions don't discriminate
   * between with-skill and baseline, and suggests better alternatives.
   *
   * @param skillContext - The skill's name, description, and content
   * @param nonDiscriminatingAssertions - Assertions that pass both configs
   * @returns Array of replacement suggestions
   */
  async suggestAssertionReplacements(
    skillContext: {
      name: string;
      description: string;
      skillContent: string;
    },
    nonDiscriminatingAssertions: Array<{
      assertionValue: string;
      assertionType: string;
      description?: string;
      withSkillPassRate: number;
      baselinePassRate: number;
    }>,
    signal?: AbortSignal,
  ): Promise<AssertionReplacementSuggestion[]> {
    if (nonDiscriminatingAssertions.length === 0) return [];

    const systemInstruction = await this.promptLoaderService.render(
      'suggest-assertion-replacements',
      {},
    );

    const payload = JSON.stringify({
      skillName: skillContext.name,
      skillDescription: skillContext.description,
      skillContent: skillContext.skillContent,
      nonDiscriminatingAssertions,
    });

    // ~300 tokens per suggestion + buffer
    const tokenLimit = Math.min(
      nonDiscriminatingAssertions.length * 300 + 512,
      8192,
    );

    this.logger.log(
      `Suggesting replacements for ${nonDiscriminatingAssertions.length} non-discriminating assertions`,
    );

    const { content } = await this.llm.runLightQuery(
      systemInstruction,
      payload,
      {
        maxTokens: tokenLimit,
        model: this.llm.model,
        timeoutMs: this.llm.generationTimeoutMs,
        signal,
      },
    );

    try {
      const jsonStr = extractJson(content);
      const parsed = JSON.parse(jsonStr);

      if (!parsed.suggestions || !Array.isArray(parsed.suggestions)) {
        this.logger.warn('No suggestions array in response');
        return [];
      }

      // Validate and normalize each suggestion
      interface RawSuggestion {
        original?: { assertionValue?: string; assertionType?: string };
        replacement?: { value?: string; type?: string; description?: string };
        reasoning?: string;
      }

      const suggestions = (parsed.suggestions as RawSuggestion[]).filter(
        (s) =>
          s?.original?.assertionValue &&
          s?.replacement?.value &&
          s?.replacement?.type,
      );

      return suggestions.map((s): AssertionReplacementSuggestion => ({
        original: {
          assertionValue: s.original!.assertionValue!.slice(0, 200),
          assertionType: (s.original!.assertionType ?? '').slice(0, 50),
        },
        replacement: {
          value: s.replacement!.value!.slice(0, 200),
          type: s.replacement!.type!.slice(0, 50),
          description: s.replacement!.description?.slice(0, 500),
        },
        reasoning: s.reasoning?.slice(0, 500) ?? 'Replacement targets skill-specific behavior.',
      }));
    } catch (error) {
      this.logger.error(
        `Failed to parse assertion replacement suggestions: ${formatError(error)}`,
      );
      return [];
    }
  }
}
