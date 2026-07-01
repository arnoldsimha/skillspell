import { Injectable, Logger } from '@nestjs/common';
import { LlmService } from '../generation/llm/llm.service.js';
import { PromptLoaderService } from '../generation/prompts/prompt-loader.service.js';
import { parseJsonObject } from '../generation/prompts/llm-response-parser.js';
import { formatError } from '../common/utils/format-error.js';
import type {
  EvalAssertion,
  EvalGrading,
  EvalAssertionResult,
  EvalRun,
  ExtractedClaim,
} from '@skillspell/shared';
import { GRADING_TOOL_SCHEMA } from './grading.schemas.js';

interface GraderResponse {
  assertionResults: Array<{
    passed: boolean;
    evidence: string;
    confidence?: number;
  }>;
  overallScore: number;
  overallAssessment: 'pass' | 'fail' | 'partial';
  /** B4: Claims extracted and verified from the output. */
  claims?: Array<{
    claim: string;
    type: 'factual' | 'process' | 'quality';
    verified: boolean;
    evidence: string;
    confidence?: number;
  }>;
  evalFeedback?: {
    suggestions: Array<{
      assertion?: string | null;
      reason: string;
    }>;
    overall?: string;
  };
  plainEnglishSummary?: string;
}


/** Assertion types that can be evaluated deterministically without an LLM. */
const DETERMINISTIC_TYPES: ReadonlySet<EvalAssertion['type']> = new Set([
  'contains',
  'not_contains',
  'regex',
]);

/**
 * Grades eval run outputs against assertions.
 *
 * Deterministic assertion types (contains, not_contains, regex) are evaluated
 * locally with simple string/regex operations — zero LLM tokens consumed.
 * Only semantic and custom assertions are sent to Claude for grading.
 *
 * Results are merged back in the original assertion order so the output shape
 * (EvalGrading) is identical regardless of how assertions were evaluated.
 */
@Injectable()
export class GradingService {
  private readonly logger = new Logger(GradingService.name);

  constructor(
    private readonly llm: LlmService,
    private readonly promptLoaderService: PromptLoaderService,
  ) {}

  /**
   * Get the grader prompt from the centralized PromptLoaderService.
   * The template is loaded at startup and cached — subsequent calls are instant.
   * If not yet loaded, it will be loaded on-demand and cached.
   */
  private async getGraderPrompt(): Promise<string> {
    return this.promptLoaderService.render('grader', {});
  }

  /**
   * Grade an eval run's output against its assertions.
   *
   * Deterministic assertions (contains, not_contains, regex) are evaluated
   * locally. Only semantic/custom assertions are sent to Claude. Results are
   * merged in the original order and persisted through the normal flow.
   *
   * @param run - The eval run result (must have prompt and outputWithSkill)
   * @param assertions - The assertions to check
   * @param expectedOutput - Optional expected output for comparison
   * @returns EvalGrading with assertion results, score, and overall assessment
   */
  async gradeRun(
    run: Omit<EvalRun, 'grading'>,
    assertions: EvalAssertion[],
    expectedOutput?: string,
    skillContent?: string,
    signal?: AbortSignal,
    isBaseline = false,
  ): Promise<EvalGrading> {
    if (assertions.length === 0) {
      this.logger.log(`No assertions to grade for run ${run.id}`);
      return {
        overall: 'pass',
        score: 100,
        assertionResults: [],
        gradedAt: new Date().toISOString(),
        gradedBy: 'auto',
      };
    }

    // Split assertions into deterministic (local) and LLM-required groups,
    // preserving corresponding original indices for merge later.
    const deterministicEntries: Array<{
      index: number;
      assertion: EvalAssertion;
    }> = [];
    const llmEntries: Array<{ index: number; assertion: EvalAssertion }> = [];

    for (let i = 0; i < assertions.length; i++) {
      if (DETERMINISTIC_TYPES.has(assertions[i].type)) {
        deterministicEntries.push({ index: i, assertion: assertions[i] });
      } else {
        llmEntries.push({ index: i, assertion: assertions[i] });
      }
    }

    this.logger.log(
      `Grading run ${run.id}: ${assertions.length} assertion(s) — ` +
        `${deterministicEntries.length} deterministic (local), ` +
        `${llmEntries.length} LLM-required`,
    );

    // Evaluate deterministic assertions locally
    const localResults = deterministicEntries.map(({ index, assertion }) => ({
      index,
      result: this.evaluateDeterministicAssertion(
        run.outputWithSkill,
        assertion,
      ),
    }));

    // Evaluate LLM-required assertions via Claude (if any)
    let llmResults: Array<{ index: number; result: EvalAssertionResult }> = [];
    let evalFeedback: EvalGrading['evalFeedback'] | undefined;
    let plainEnglishSummary: string | undefined;
    let gradingError: string | undefined;

    let extractedClaims: ExtractedClaim[] | undefined;

    if (llmEntries.length > 0) {
      try {
        const llmGrading = await this.gradeLlmAssertions(
          run,
          llmEntries,
          expectedOutput,
          skillContent,
          signal,
        );
        llmResults = llmGrading.results;
        evalFeedback = llmGrading.evalFeedback;
        extractedClaims = llmGrading.extractedClaims;
        plainEnglishSummary = llmGrading.plainEnglishSummary;
      } catch (error) {
        this.logger.error(
          `LLM grading failed for run ${run.id}: ${formatError(error)}`,
        );

        // This is an infrastructure error (API failure, timeout, parse failure),
        // NOT the skill producing a wrong answer. Record it as a gradingError so
        // benchmarks exclude the run from quality metrics instead of counting it
        // as a skill failure. Assertions are still marked failed for shape.
        gradingError =
          error instanceof Error ? error.message : 'Unknown grading error';
        llmResults = llmEntries.map(({ index, assertion }) => ({
          index,
          result: {
            assertion,
            passed: false,
            evidence: `Grading failed: ${gradingError}`,
          },
        }));
      }
    }

    // Merge results back in original assertion order
    const mergedResults = new Array<EvalAssertionResult>(assertions.length);
    for (const { index, result } of localResults) {
      mergedResults[index] = result;
    }
    for (const { index, result } of llmResults) {
      mergedResults[index] = result;
    }

    // Compute overall score and assessment from merged results
    const { overall, score } = this.computeOverallGrading(mergedResults);

    const grading: EvalGrading = {
      overall,
      score,
      assertionResults: mergedResults,
      gradedAt: new Date().toISOString(),
      gradedBy: 'auto',
      // Baseline runs don't include LLM-generated extras — they're only meaningful
      // for with-skill output (summary, claims, feedback relate to skill performance).
      evalFeedback: isBaseline ? undefined : evalFeedback,
      extractedClaims: isBaseline ? undefined : extractedClaims,
      plainEnglishSummary: isBaseline ? undefined : plainEnglishSummary,
      gradingError,
    };

    this.logger.log(
      `Grading complete for run ${run.id}: ${grading.overall} ` +
        `(score: ${grading.score}, ` +
        `${mergedResults.filter((r) => r.passed).length}/${mergedResults.length} passed)`,
    );

    return grading;
  }

  // ── Deterministic assertion evaluation ──────────────────────────────

  /**
   * Evaluate a single deterministic assertion locally (no LLM call).
   *
   * Supports: contains (case-insensitive), not_contains (case-insensitive),
   * and regex (applied exactly as given).
   */
  private evaluateDeterministicAssertion(
    output: string,
    assertion: EvalAssertion,
  ): EvalAssertionResult {
    switch (assertion.type) {
      case 'contains': {
        const found = output
          .toLowerCase()
          .includes(assertion.value.toLowerCase());
        return {
          assertion,
          passed: found,
          evidence: found
            ? `Found "${assertion.value}" in output (case-insensitive)`
            : `"${assertion.value}" not found in output (case-insensitive)`,
          confidence: 1.0,
        };
      }

      case 'not_contains': {
        const absent = !output
          .toLowerCase()
          .includes(assertion.value.toLowerCase());
        return {
          assertion,
          passed: absent,
          evidence: absent
            ? `"${assertion.value}" correctly absent from output (case-insensitive)`
            : `Found "${assertion.value}" in output — assertion failed`,
          confidence: 1.0,
        };
      }

      case 'regex': {
        // Guard against ReDoS: reject overly complex regex patterns
        const MAX_REGEX_LENGTH = 200;
        if (assertion.value.length > MAX_REGEX_LENGTH) {
          return {
            assertion,
            passed: false,
            evidence: `Regex pattern too long (${assertion.value.length} chars, max ${MAX_REGEX_LENGTH}). Simplify the pattern.`,
            confidence: 1.0,
          };
        }

        // Guard against catastrophic backtracking (ReDoS).
        // Covers: (a+)+, (a*)*, (a{2,})+, (a|ab)+, and consecutive top-level quantifiers.
        // Note: replace with `safe-regex` or `re2` for guaranteed linear-time matching.
        const isCatastrophicRegex = (pattern: string): boolean => {
          // Quantified group that itself contains a quantifier: (a+)+, (?:ab*)*, (a{2,})+
          if (/\([^()]*[+*][^()]*\)[+*{]/.test(pattern)) return true;
          if (/\([^()]*\{[0-9]+,?[0-9]*\}[^()]*\)[+*{]/.test(pattern)) return true;
          // Consecutive quantifiers at the top level: a++, a*+, a{2}*
          if (/([+*]|\{[0-9]+,?[0-9]*\}){2,}/.test(pattern)) return true;
          return false;
        };
        if (isCatastrophicRegex(assertion.value)) {
          return {
            assertion,
            passed: false,
            evidence: 'Regex pattern contains nested quantifiers that could cause catastrophic backtracking.',
            confidence: 1.0,
          };
        }

        try {
          const regex = new RegExp(assertion.value);
          // Execute with a capped output length to limit backtracking damage
          const truncatedOutput = output.slice(0, 50_000);
          const match = regex.test(truncatedOutput);
          return {
            assertion,
            passed: match,
            evidence: match
              ? `Regex /${assertion.value}/ matched in output`
              : `Regex /${assertion.value}/ did not match in output`,
            confidence: 1.0,
          };
        } catch (err) {
          return {
            assertion,
            passed: false,
            evidence: `Invalid regex pattern: ${assertion.value} — ${err instanceof Error ? err.message : 'Unknown error'}`,
            confidence: 1.0,
          };
        }
      }

      default:
        // Should never reach here — only called for deterministic types
        throw new Error(
          `Not a deterministic assertion type: ${assertion.type}`,
        );
    }
  }

  // ── LLM-based assertion grading ─────────────────────────────────────

  /**
   * Send only the LLM-required assertions to Claude for grading.
   * Returns results tagged with their original indices for merging, plus optional evalFeedback.
   */
  private async gradeLlmAssertions(
    run: Omit<EvalRun, 'grading'>,
    entries: Array<{ index: number; assertion: EvalAssertion }>,
    expectedOutput?: string,
    skillContent?: string,
    signal?: AbortSignal,
  ): Promise<{
    results: Array<{ index: number; result: EvalAssertionResult }>;
    evalFeedback?: EvalGrading['evalFeedback'];
    extractedClaims?: ExtractedClaim[];
    plainEnglishSummary?: string;
  }> {
    const llmAssertions = entries.map((e) => e.assertion);

    const graderPrompt = await this.getGraderPrompt();
    const gradingRequest = await this.buildGradingRequest(
      run.prompt,
      run.outputWithSkill,
      llmAssertions,
      expectedOutput,
    );

    // Two-block system prompt for multi-level caching:
    //   Block 1 — grader instructions (static, cached globally across all grading calls)
    //   Block 2 — skill content (cached per skill version; same content for all eval cases
    //             of the same skill run, so 22/23 calls are cache hits within one optimization loop)
    // Moving skill content to the system prompt also removes the 3,000 char truncation —
    // the full skill is sent and cached, costing far less than repeated full-price inclusion.
    const systemBlocks: Array<{ text: string; cached?: boolean }> = [
      { text: graderPrompt, cached: true },
    ];
    if (skillContent) {
      systemBlocks.push({ text: `## Skill Content\n\n${skillContent}`, cached: true });
    }

    // N1: Pass GRADING_TOOL_SCHEMA to force structured JSON output via tool_use.
    const response = await this.llm.sendMessage({
      maxTokens: 4096,
      systemBlocks,
      messages: [{ role: 'user', content: gradingRequest }],
      temperature: 0,
      toolSchema: GRADING_TOOL_SCHEMA,
      signal,
    });

    const graderResponse = this.parseGraderResponse(
      response.content,
      llmAssertions,
    );

    return this.buildGradingResult(entries, graderResponse);
  }

  /**
   * Build the grading result from entries and a parsed grader response.
   * Shared by both cache-hit and LLM-call paths.
   */
  private buildGradingResult(
    entries: Array<{ index: number; assertion: EvalAssertion }>,
    graderResponse: GraderResponse,
  ): {
    results: Array<{ index: number; result: EvalAssertionResult }>;
    evalFeedback?: EvalGrading['evalFeedback'];
    extractedClaims?: ExtractedClaim[];
    plainEnglishSummary?: string;
  } {
    if (graderResponse.assertionResults.length < entries.length) {
      this.logger.warn(
        `Grader returned ${graderResponse.assertionResults.length} results for ` +
        `${entries.length} assertions — filling missing slots with failed=false`,
      );
    }

    const results = entries.map(({ index, assertion }, i) => ({
      index,
      result: {
        assertion,
        passed: graderResponse.assertionResults[i]?.passed ?? false,
        evidence:
          graderResponse.assertionResults[i]?.evidence ??
          'No evidence provided',
        confidence: graderResponse.assertionResults[i]?.confidence,
      },
    }));

    return {
      results,
      evalFeedback: graderResponse.evalFeedback,
      extractedClaims: graderResponse.claims
        ? this.validateClaims(graderResponse.claims)
        : undefined,
      plainEnglishSummary: graderResponse.plainEnglishSummary,
    };
  }

  // ── Overall score computation ───────────────────────────────────────

  /**
   * Compute overall grading from merged assertion results.
   * Score = percentage of passed assertions (0-100).
   */
  private computeOverallGrading(results: EvalAssertionResult[]): {
    overall: 'pass' | 'fail' | 'partial';
    score: number;
  } {
    const total = results.length;
    if (total === 0) {
      return { overall: 'pass', score: 100 };
    }

    const passed = results.filter((r) => r.passed).length;
    const score = Math.round((passed / total) * 100);

    let overall: 'pass' | 'fail' | 'partial';
    if (passed === total) {
      overall = 'pass';
    } else if (passed === 0) {
      overall = 'fail';
    } else {
      overall = 'partial';
    }

    return { overall, score };
  }

  // ── Grading request / response helpers ──────────────────────────────

  /**
   * Build the user message for the grading request.
   */
  private async buildGradingRequest(
    prompt: string,
    output: string,
    assertions: EvalAssertion[],
    expectedOutput?: string,
  ): Promise<string> {
    const assertionsList = assertions
      .map((a, i) => `${i + 1}. [${a.type}] ${a.description || a.value}`)
      .join('\n');

    // Cap output at 15,000 chars to keep grading prompts bounded.
    // Assertions check structure/content that's identifiable in the first portion;
    // very long outputs (e.g. full microservice code) don't need to be fully re-sent.
    const MAX_OUTPUT_FOR_GRADING = 15_000;
    const truncatedOutput = output.length > MAX_OUTPUT_FOR_GRADING
      ? `${output.slice(0, MAX_OUTPUT_FOR_GRADING)}\n\n[Output truncated at ${MAX_OUTPUT_FOR_GRADING} chars — ${output.length} total]`
      : output;

    return this.promptLoaderService.render('grading-request', {
      prompt,
      output: truncatedOutput,
      expectedOutputSection: expectedOutput ? `### Expected Output\n${expectedOutput}\n` : '',
      assertionsList,
      assertionsJson: JSON.stringify(assertions, null, 2),
    });
  }

  /**
   * Parse the grader's JSON response.
   * Handles both raw JSON and JSON wrapped in markdown code fences.
   */
  private parseGraderResponse(
    content: string | unknown,
    assertions: EvalAssertion[],
  ): GraderResponse {
    // Handle tool_use content block arrays (e.g. from mocked or raw API responses)
    if (Array.isArray(content)) {
      const toolUseBlock = content.find(
        (block): block is { type: 'tool_use'; input: Record<string, unknown> } =>
          typeof block === 'object' &&
          block !== null &&
          (block as Record<string, unknown>)['type'] === 'tool_use' &&
          'input' in (block as Record<string, unknown>),
      );
      if (toolUseBlock) {
        return this.mapJsonToGraderResponse(toolUseBlock.input);
      }
      // Fall through with empty string to trigger fallback
      this.logger.warn('No tool_use block found in Claude response — falling back to text parser with empty string');
      return this.parseGraderResponseFromText('', assertions);
    }

    return this.parseGraderResponseFromText(
      typeof content === 'string' ? content : '',
      assertions,
    );
  }

  private parseGraderResponseFromText(
    content: string,
    assertions: EvalAssertion[],
  ): GraderResponse {
    // Extract JSON from the response — handles raw JSON, code fences, and
    // preamble via the shared structured-response parser.
    const json = parseJsonObject<Record<string, unknown>>(content);
    if (json) {
      return this.mapJsonToGraderResponse(json);
    }
    this.logger.warn('Failed to parse grader response as JSON');

    // Fallback: create default failed results
    this.logger.error(
      `Could not parse grader response. Content preview: ${content.substring(0, 200)}`,
    );
    return {
      assertionResults: assertions.map(() => ({
        passed: false,
        evidence: 'Could not parse grader response',
      })),
      overallScore: 0,
      overallAssessment: 'fail',
    };
  }

  /**
   * Map parsed JSON to GraderResponse, extracting all fields consistently.
   * Used by both fenced-JSON and raw-JSON parsing paths.
   */
  private mapJsonToGraderResponse(json: Record<string, unknown>): GraderResponse {
    return {
      assertionResults: (json['assertionResults'] as GraderResponse['assertionResults']) || [],
      overallScore: (json['overallScore'] as number) ?? 0,
      overallAssessment: this.normalizeAssessment(json['overallAssessment']),
      claims: (json['claims'] as GraderResponse['claims']) ?? undefined,
      evalFeedback: (json['evalFeedback'] as GraderResponse['evalFeedback']) ?? undefined,
      plainEnglishSummary: typeof json['plainEnglishSummary'] === 'string'
        ? json['plainEnglishSummary'].slice(0, 1000)
        : undefined,
    };
  }

  // ── Claim validation (B4) ────────────────────────────────────────────

  /**
   * Validate and sanitize extracted claims from grader response.
   * Filters out malformed claims, enforces caps, and truncates long strings.
   * Returns undefined if no valid claims are found.
   */
  private validateClaims(
    raw: unknown,
  ): ExtractedClaim[] | undefined {
    if (!Array.isArray(raw) || raw.length === 0) return undefined;

    const VALID_TYPES = new Set(['factual', 'process', 'quality']);
    const MAX_CLAIMS = 10;
    const MAX_CLAIM_LENGTH = 500;
    const MAX_EVIDENCE_LENGTH = 1000;

    const validated = raw
      .filter(
        (c: Record<string, unknown>) =>
          typeof c.claim === 'string' &&
          typeof c.evidence === 'string' &&
          VALID_TYPES.has(c.type as string) &&
          typeof c.verified === 'boolean',
      )
      .slice(0, MAX_CLAIMS)
      .map(
        (c: Record<string, unknown>): ExtractedClaim => ({
          claim: (c.claim as string).slice(0, MAX_CLAIM_LENGTH),
          type: c.type as ExtractedClaim['type'],
          verified: c.verified as boolean,
          evidence: (c.evidence as string).slice(0, MAX_EVIDENCE_LENGTH),
          confidence:
            typeof c.confidence === 'number' ? c.confidence : undefined,
        }),
      );

    return validated.length > 0 ? validated : undefined;
  }

  /**
   * Normalize the overall assessment value to a valid enum.
   */
  private normalizeAssessment(value: unknown): 'pass' | 'fail' | 'partial' {
    if (value === 'pass' || value === 'fail' || value === 'partial') {
      return value;
    }
    return 'fail';
  }
}
