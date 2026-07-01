import { Injectable, Logger, Inject, NotFoundException } from '@nestjs/common';
import { LlmService } from '../generation/llm/llm.service.js';
import { PromptLoaderService } from '../generation/prompts/prompt-loader.service.js';
import {
  EVAL_REPOSITORY,
  type IEvalRepository,
} from '@skillspell/shared';
import type {
  EvalRun,
  EvalGrading,
  EvalAssertionResult,
  FailureExplanation,
} from '@skillspell/shared';

/**
 * C3: Explain Failure — synthesizes grading data into a plain-language
 * explanation of why an eval run failed, with actionable fix suggestions.
 *
 * Two modes:
 * - **Synthesized** (no LLM call): For simple failures (1-2 failed assertions
 *   with clear evidence), builds an explanation from existing grading data.
 * - **AI-explained** (1 light LLM call): For complex failures (3+ assertions,
 *   unclear evidence), sends grading data to a light model for synthesis.
 *
 * Cost: $0 (synthesized) or ~$0.005 (AI-explained) per explanation.
 */

import { EXPLANATION_TOOL_SCHEMA } from './explain-failure.schemas.js';

@Injectable()
export class ExplainFailureService {
  private readonly logger = new Logger(ExplainFailureService.name);

  constructor(
    private readonly llm: LlmService,
    private readonly promptLoaderService: PromptLoaderService,
    @Inject(EVAL_REPOSITORY) private readonly evalRepository: IEvalRepository,
  ) {}

  /**
   * Explain why a specific eval run failed.
   *
   * Fetches the run from the database, checks that it actually failed,
   * then uses Mode 1 (synthesized) or Mode 2 (AI-explained) based on
   * the complexity of the failure.
   */
  async explainFailure(skillId: string, runId: string): Promise<FailureExplanation> {
    // Fetch the run
    const runs = await this.evalRepository.getEvalRuns(skillId);
    const run = runs.find((r) => r.id === runId);
    if (!run) {
      throw new NotFoundException(`Eval run ${runId} not found`);
    }

    if (!run.grading) {
      throw new NotFoundException(`Eval run ${runId} has no grading data`);
    }

    if (run.grading.overall === 'pass') {
      return {
        mode: 'synthesized',
        summary: 'This eval run passed all assertions — no failure to explain.',
        suggestions: [],
      };
    }

    const failedAssertions = run.grading.assertionResults.filter((r) => !r.passed);

    // Mode 1: Simple failures — synthesize from existing evidence
    if (this.canSynthesize(failedAssertions)) {
      this.logger.log(
        `Synthesizing explanation for run ${runId} (${failedAssertions.length} failed assertions)`,
      );
      return this.synthesize(run.grading, failedAssertions);
    }

    // Mode 2: Complex failures — one light LLM call
    this.logger.log(
      `AI-explaining failure for run ${runId} (${failedAssertions.length} failed assertions)`,
    );
    return this.aiExplain(run);
  }

  /**
   * Check if the failure is simple enough to synthesize locally.
   * Simple = 1-2 failed assertions, each with non-empty evidence.
   */
  private canSynthesize(failedAssertions: EvalAssertionResult[]): boolean {
    return (
      failedAssertions.length <= 2 &&
      failedAssertions.every((a) => a.evidence && a.evidence.trim().length > 0)
    );
  }

  /**
   * Mode 1: Build explanation from existing grading data — no LLM call.
   */
  private synthesize(
    grading: EvalGrading,
    failedAssertions: EvalAssertionResult[],
  ): FailureExplanation {
    // Build summary from failed assertion evidence
    const summary = failedAssertions
      .map((f) => {
        const desc = f.assertion.description || f.assertion.value;
        return `"${desc}" — ${f.evidence}`;
      })
      .join('\n\n');

    // Extract suggestions from eval feedback if available
    const suggestions: string[] = [];
    if (grading.evalFeedback?.suggestions) {
      for (const s of grading.evalFeedback.suggestions) {
        if (s.reason) suggestions.push(s.reason);
      }
    }

    // If no eval feedback suggestions, generate basic suggestions from failures
    if (suggestions.length === 0) {
      for (const f of failedAssertions) {
        const desc = f.assertion.description || f.assertion.value;
        if (f.assertion.type === 'contains' || f.assertion.type === 'not_contains') {
          suggestions.push(
            `Review the skill instructions to ensure the output will ${f.assertion.type === 'contains' ? 'include' : 'exclude'}: "${f.assertion.value}"`,
          );
        } else if (f.assertion.type === 'semantic') {
          suggestions.push(
            `Make the skill instruction for "${desc}" more explicit with specific requirements`,
          );
        } else {
          suggestions.push(`Address the failing check: "${desc}"`);
        }
      }
    }

    return {
      mode: 'synthesized',
      summary,
      suggestions,
    };
  }

  /**
   * Mode 2: AI-powered explanation via a light LLM call.
   */
  private async aiExplain(run: EvalRun): Promise<FailureExplanation> {
    const grading = run.grading;
    const failedAssertions = grading.assertionResults.filter((r) => !r.passed);
    const passedAssertions = grading.assertionResults.filter((r) => r.passed);

    // Format failed assertions for the prompt
    const failedText = failedAssertions
      .map((f, i) => {
        const desc = f.assertion.description || f.assertion.value;
        return `${i + 1}. [${f.assertion.type}] "${desc}"\n   Evidence: ${f.evidence || 'No evidence provided'}${f.confidence !== undefined ? `\n   Confidence: ${(f.confidence * 100).toFixed(0)}%` : ''}`;
      })
      .join('\n');

    // Format passed assertions for context
    const passedText =
      passedAssertions.length > 0
        ? passedAssertions
            .map((p) => {
              const desc = p.assertion.description || p.assertion.value;
              return `- [${p.assertion.type}] "${desc}"`;
            })
            .join('\n')
        : 'None';

    // Format claims
    const claimsText =
      grading.extractedClaims && grading.extractedClaims.length > 0
        ? grading.extractedClaims
            .map(
              (c) =>
                `- [${c.type}] "${c.claim}" — ${c.verified ? '✓ verified' : '✗ unverified'}: ${c.evidence}`,
            )
            .join('\n')
        : 'None extracted';

    // Format eval feedback
    const evalFeedbackText =
      grading.evalFeedback?.overall || grading.evalFeedback?.suggestions?.length
        ? [
            grading.evalFeedback.overall || '',
            ...(grading.evalFeedback.suggestions?.map((s) => `- ${s.reason}`) || []),
          ]
            .filter(Boolean)
            .join('\n')
        : 'None';

    // Render the prompt template
    const systemPrompt = await this.promptLoaderService.render('explain-failure', {
      prompt: run.prompt,
      outputSnippet: (run.outputWithSkill || '').substring(0, 500),
      failedAssertions: failedText,
      passedAssertions: passedText,
      claims: claimsText,
      evalFeedback: evalFeedbackText,
    });

    const result = await this.llm.runLightQuery(
      systemPrompt,
      'Analyze this eval failure and explain what went wrong.',
      {
        maxTokens: 512,
        temperature: 0,
        toolSchema: EXPLANATION_TOOL_SCHEMA,
      },
    );

    // Parse JSON response (guaranteed by tool_use schema)
    try {
      const parsed = JSON.parse(result.content);
      return {
        mode: 'ai-explained',
        summary: parsed.summary || 'Unable to determine failure cause.',
        rootCause: parsed.rootCause,
        suggestions: Array.isArray(parsed.suggestions) ? parsed.suggestions : [],
      };
    } catch {
      this.logger.warn(`Failed to parse AI explanation response: ${result.content.substring(0, 200)}`);
      // Fallback: return the raw content as summary
      return {
        mode: 'ai-explained',
        summary: result.content.substring(0, 500),
        suggestions: [],
      };
    }
  }
}
