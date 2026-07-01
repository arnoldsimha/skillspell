import { Injectable, Logger } from '@nestjs/common';
import type { TriggerEvalQuery, TriggerEvalResult } from '@skillspell/shared';
import { LlmService } from '../llm/llm.service.js';
import { shuffleArray } from '../../common/utils/shuffle.js';
import { PromptLoaderService } from '../prompts/prompt-loader.service.js';
import { parseJsonObject } from '../prompts/llm-response-parser.js';

/**
 * Competing skill descriptions used alongside the target skill during
 * trigger simulation. These represent realistic "noise" so the model
 * must choose — not just rubber-stamp the only option.
 */
const COMPETING_SKILLS: Array<{ name: string; description: string }> = [
  {
    name: 'code-reviewer',
    description:
      'Use this skill to review code for bugs, style issues, performance problems, and security vulnerabilities. ' +
      'Ideal when users want a code review, audit, or quality check on existing code.',
  },
  {
    name: 'test-generator',
    description:
      'Use this skill to generate unit tests, integration tests, or end-to-end tests for functions, classes, or APIs. ' +
      'Ideal when users want test coverage for their code.',
  },
  {
    name: 'documentation-writer',
    description:
      'Use this skill to generate documentation, READMEs, API references, or inline code comments. ' +
      'Ideal when users want to document their codebase.',
  },
];

/**
 * A single trigger decision returned by the batch evaluation tool schema.
 */
interface TriggerDecision {
  /** 1-based index matching the query list */
  query_id: number;
  /** true = would invoke the skill, false = would not */
  triggered: boolean;
}

import { BATCH_TRIGGER_TOOL_SCHEMA } from './trigger-evaluator.schemas.js';

/**
 * Simulates Claude's skill selection logic via the Messages API.
 *
 * Instead of spawning `claude -p` subprocesses (as the original run_eval.py does),
 * this service uses direct Messages API calls to ask the model whether it would
 * invoke a given skill for a given user query, with realistic competing skills
 * in the prompt.
 *
 * Supports two evaluation modes:
 * - `evaluateQueriesBatch()` (preferred): sends all queries in a single LLM call
 *   with structured JSON output via tool_use. ~60x fewer API calls than per-query.
 * - `evaluateQueries()` (legacy fallback): evaluates each query individually with
 *   `runsPerQuery` parallel calls. Used as fallback if batch parsing fails.
 */
@Injectable()
export class TriggerEvaluatorService {
  private readonly logger = new Logger(TriggerEvaluatorService.name);

  constructor(
    private readonly llm: LlmService,
    private readonly promptLoader: PromptLoaderService,
  ) {}

  /**
   * Evaluate all queries in a single batched LLM call using structured JSON output.
   *
   * This replaces the per-query approach with a single call that evaluates all queries
   * at once, using the `toolSchema` pattern to enforce valid JSON output. The system
   * instruction is loaded from the `batch-simulate-trigger.md` template and passed
   * to `runLightQuery()` which marks it with `cache_control: { type: 'ephemeral' }`.
   *
   * @param skillName - Name of the skill being tested
   * @param description - The candidate description to evaluate
   * @param queries - Queries with expected trigger behavior
   * @param runsPerQuery - Number of runs (default: 1; multiple runs are redundant —
   *                       see Optimization 2 in performance-scalability-audit.md)
   * @returns Array of TriggerEvalResult with trigger rates and correctness
   */
  async evaluateQueriesBatch(
    skillName: string,
    description: string,
    queries: TriggerEvalQuery[],
    runsPerQuery: number = 1,
  ): Promise<TriggerEvalResult[]> {
    this.logger.log(
      `Batch evaluating ${queries.length} queries against "${skillName}" ` +
        `(${runsPerQuery} runs, description: ${description.length} chars)`,
    );

    const skillsList = this.buildSkillsList(skillName, description);

    const queryList = queries
      .map((q, i) => `${i + 1}. "${q.query}"`)
      .join('\n');

    const allRunResults: boolean[][] = queries.map(() => []);

    // Build system instruction ONCE before the loop from the .md template.
    // Identical across all runsPerQuery iterations → prompt caching kicks in
    // (runLightQuery marks it with cache_control: { type: 'ephemeral' }).
    const systemInstruction = await this.promptLoader.render(
      'batch-simulate-trigger',
      {
        SKILLS_LIST: skillsList,
        QUERY_LIST: queryList,
        TARGET_SKILL_NAME: skillName,
        QUERY_COUNT: String(queries.length),
      },
    );

    for (let run = 0; run < runsPerQuery; run++) {
      try {
        // Use structured output (tool_use) to guarantee valid JSON.
        // User message is minimal — all context is in the cached system prompt.
        const result = await this.llm.runLightQuery(
          systemInstruction,
          'Evaluate now.',
          {
            maxTokens: queries.length * 30, // ~30 tokens per decision object
            temperature: 0.3,
            toolSchema: BATCH_TRIGGER_TOOL_SCHEMA,
          },
        );

        // Parse the structured JSON response via the shared parser. On failure
        // throw so the surrounding retry/catch handles it (preserves prior
        // JSON.parse-throws behavior).
        const parsed = parseJsonObject<{ decisions: TriggerDecision[] }>(
          result.content,
        );
        if (!parsed) {
          throw new Error('Failed to parse trigger decisions from LLM response');
        }

        // Build a lookup map from query_id → triggered
        const decisionMap = new Map<number, boolean>();
        for (const d of parsed.decisions) {
          decisionMap.set(d.query_id, d.triggered);
        }

        // Validate: every query_id should be present
        const missingIds = queries
          .map((_, i) => i + 1)
          .filter((id) => !decisionMap.has(id));

        if (missingIds.length > 0) {
          this.logger.warn(
            `Batch result missing query_ids: ${missingIds.join(', ')}. ` +
              `Falling back to individual evaluation.`,
          );
          return this.evaluateQueries(
            skillName,
            description,
            queries,
            runsPerQuery,
          );
        }

        // Map decisions back to queries by query_id (1-based → 0-based)
        for (let i = 0; i < queries.length; i++) {
          allRunResults[i].push(decisionMap.get(i + 1)!);
        }
      } catch (error) {
        this.logger.warn(
          `Batch evaluation failed on run ${run + 1}: ${(error as Error).message}. ` +
            `Falling back to individual evaluation.`,
        );
        return this.evaluateQueries(
          skillName,
          description,
          queries,
          runsPerQuery,
        );
      }
    }

    const results = queries.map((q, i) => {
      const yesCount = allRunResults[i].filter(Boolean).length;
      const triggerRate = yesCount / runsPerQuery;
      const didTrigger = triggerRate >= 0.5;
      return {
        query: q.query,
        shouldTrigger: q.shouldTrigger,
        didTrigger,
        triggerRate,
        correct: q.shouldTrigger === didTrigger,
      };
    });

    const correct = results.filter((r) => r.correct).length;
    this.logger.log(
      `Batch evaluation complete: ${correct}/${results.length} correct ` +
        `(${((correct / results.length) * 100).toFixed(0)}%)`,
    );

    return results;
  }

  /**
   * Evaluate a set of queries against a skill description (legacy per-query approach).
   *
   * Kept as a fallback for `evaluateQueriesBatch()` when batch parsing fails.
   *
   * @param skillName - Name of the skill being tested
   * @param description - The candidate description to evaluate
   * @param queries - Queries with expected trigger behavior
   * @param runsPerQuery - Number of runs per query (default: 3)
   * @returns Array of TriggerEvalResult with trigger rates and correctness
   */
  async evaluateQueries(
    skillName: string,
    description: string,
    queries: TriggerEvalQuery[],
    runsPerQuery: number = 3,
  ): Promise<TriggerEvalResult[]> {
    this.logger.log(
      `Evaluating ${queries.length} queries against "${skillName}" ` +
        `(${runsPerQuery} runs/query, description: ${description.length} chars)`,
    );

    const results: TriggerEvalResult[] = [];

    // Process queries in parallel batches of 5 to avoid rate limits
    const batchSize = 5;
    for (let i = 0; i < queries.length; i += batchSize) {
      const batch = queries.slice(i, i + batchSize);
      const batchResults = await Promise.all(
        batch.map((q) =>
          this.evaluateSingleQuery(skillName, description, q, runsPerQuery),
        ),
      );
      results.push(...batchResults);
    }

    const correct = results.filter((r) => r.correct).length;
    this.logger.log(
      `Evaluation complete: ${correct}/${results.length} correct ` +
        `(${((correct / results.length) * 100).toFixed(0)}%)`,
    );

    return results;
  }

  /**
   * Evaluate a single query by running it `runsPerQuery` times.
   */
  private async evaluateSingleQuery(
    skillName: string,
    description: string,
    query: TriggerEvalQuery,
    runsPerQuery: number,
  ): Promise<TriggerEvalResult> {
    // Build the skills list for the prompt
    const skillsList = this.buildSkillsList(skillName, description);

    // Run all attempts for this query in parallel
    const runResults = await Promise.all(
      Array.from({ length: runsPerQuery }, async (_, run) => {
        try {
          const userPrompt = await this.promptLoader.render('simulate-trigger', {
            SKILLS_LIST: skillsList,
            QUERY: query.query,
            TARGET_SKILL_NAME: skillName,
          });

          const result = await this.llm.sendMessage({
            model: 'light',
            system:
              'You are simulating Claude Code\'s skill selection logic. ' +
              'Answer with ONLY "yes" or "no".',
            messages: [{ role: 'user', content: userPrompt }],
            maxTokens: 8,
            temperature: 0.3,
          });

          const answer = result.content.trim().toLowerCase();
          return answer.startsWith('yes');
        } catch (error) {
          this.logger.warn(
            `Trigger evaluation failed for query "${query.query.substring(0, 50)}…" ` +
              `run ${run + 1}: ${(error as Error).message}`,
          );
          // On error, count as "no trigger" — conservative approach
          return false;
        }
      }),
    );

    const yesCount = runResults.filter(Boolean).length;
    const triggerRate = yesCount / runsPerQuery;
    const didTrigger = triggerRate >= 0.5;
    const correct = query.shouldTrigger === didTrigger;

    return {
      query: query.query,
      shouldTrigger: query.shouldTrigger,
      didTrigger,
      triggerRate,
      correct,
    };
  }

  /**
   * Build a formatted skills list with the target skill and competing skills.
   * Shuffles the order to avoid position bias.
   */
  private buildSkillsList(
    skillName: string,
    description: string,
  ): string {
    const allSkills = [
      { name: skillName, description },
      ...COMPETING_SKILLS,
    ];

    // Shuffle to avoid position bias
    shuffleArray(allSkills);

    return allSkills
      .map((s) => `- **${s.name}**: ${s.description}`)
      .join('\n');
  }
}
