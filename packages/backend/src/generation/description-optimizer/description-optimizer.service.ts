import { Injectable, Inject, Logger, NotFoundException } from '@nestjs/common';
import { shuffleArray } from '../../common/utils/shuffle.js';
import {
  SKILL_REPOSITORY,
  type ISkillRepository,
} from '@skillspell/shared';
import type {
  TriggerEvalQuery,
  TriggerEvalResult,
  OptimizationIteration,
  DescriptionOptimizationResult,
  GenerateTriggerEvalsResponse,
  Skill,
} from '@skillspell/shared';
import { LlmService } from '../llm/llm.service.js';
import { PromptLoaderService } from '../prompts/prompt-loader.service.js';
import { parseJsonArray } from '../prompts/llm-response-parser.js';
import { TriggerEvaluatorService } from './trigger-evaluator.service.js';

/**
 * Description Optimization Service — web-native equivalent of `run_loop.py`.
 *
 * Orchestrates the full description optimization flow:
 * 1. Generate trigger eval queries from skill content
 * 2. Run the optimization loop (eval → improve → re-eval)
 * 3. Apply the best description to the skill
 *
 * Matches the original algorithm:
 * - 60/40 stratified train/test split
 * - Up to 5 iterations (configurable)
 * - Selects best description by TEST score (not train) to avoid overfitting
 * - Strips test scores from history sent to the improvement prompt
 */
@Injectable()
export class DescriptionOptimizerService {
  private readonly logger = new Logger(DescriptionOptimizerService.name);

  constructor(
    private readonly llm: LlmService,
    private readonly promptLoader: PromptLoaderService,
    private readonly triggerEvaluator: TriggerEvaluatorService,
    @Inject(SKILL_REPOSITORY)
    private readonly skillRepo: ISkillRepository,
  ) {}

  /**
   * Step 1: Generate trigger eval queries for a skill.
   *
   * Uses the LLM to generate diverse test queries — some that should trigger
   * the skill, and some near-miss queries that should not.
   */
  async generateTriggerEvals(
    skillId: string,
    count: number = 20,
  ): Promise<GenerateTriggerEvalsResponse> {
    const skill = await this.getSkillOrThrow(skillId);

    this.logger.log(
      `Generating ${count} trigger evals for skill "${skill.name}" (${skillId})`,
    );

    const userPrompt = await this.promptLoader.render('generate-trigger-evals', {
      SKILL_NAME: skill.name,
      SKILL_DESCRIPTION: skill.description,
      SKILL_CONTENT: skill.skillContent,
      COUNT: String(count),
    });

    const result = await this.llm.sendMessage({
      model: 'light',
      system:
        'You are a test query generator for Claude Code skill descriptions. ' +
        'Generate diverse, realistic test queries as a JSON array. Respond with ONLY valid JSON.',
      messages: [{ role: 'user', content: userPrompt }],
      maxTokens: 4096,
      temperature: 0.7,
    });

    const queries = this.parseEvalQueries(result.content, count);

    this.logger.log(
      `Generated ${queries.length} trigger evals ` +
        `(${queries.filter((q) => q.shouldTrigger).length} should-trigger, ` +
        `${queries.filter((q) => !q.shouldTrigger).length} should-not-trigger)`,
    );

    return { queries };
  }

  /**
   * Step 3: Run the optimization loop.
   *
   * Algorithm (matching run_loop.py):
   * 1. Split eval queries into 60% train / 40% test (stratified by shouldTrigger)
   * 2. Evaluate current description on train+test → baseline score
   * 3. For up to maxIterations:
   *    a. Send failed results + current description to improve-description prompt
   *    b. LLM proposes new description (≤1024 chars)
   *    c. Evaluate new description on train+test
   *    d. Record iteration results
   * 4. Select best description by TEST score (not train) to avoid overfitting
   */
  async runOptimizationLoop(
    skillId: string,
    queries: TriggerEvalQuery[],
    maxIterations: number = 5,
    runsPerQuery: number = 1,
    signal?: AbortSignal,
  ): Promise<DescriptionOptimizationResult> {
    const skill = await this.getSkillOrThrow(skillId);
    const originalDescription = skill.description;

    this.logger.log(
      `Starting optimization loop for "${skill.name}" — ` +
        `${queries.length} queries, max ${maxIterations} iterations, ` +
        `${runsPerQuery} runs/query`,
    );

    // Split into train/test (60/40 stratified)
    const { train, test } = this.splitEvalSet(queries, 0.4);
    this.logger.log(
      `Split: ${train.length} train, ${test.length} test`,
    );

    let currentDescription = originalDescription;
    const iterations: OptimizationIteration[] = [];

    for (let iteration = 1; iteration <= maxIterations; iteration++) {
      if (signal?.aborted) {
        this.logger.log('Optimization cancelled by client');
        break;
      }

      this.logger.log(
        `Iteration ${iteration}/${maxIterations} — description: "${currentDescription.substring(0, 80)}…"`,
      );

      // Evaluate on both train + test using batched evaluation
      const [trainResults, testResults] = await Promise.all([
        this.triggerEvaluator.evaluateQueriesBatch(
          skill.name, currentDescription, train, runsPerQuery,
        ),
        this.triggerEvaluator.evaluateQueriesBatch(
          skill.name, currentDescription, test, runsPerQuery,
        ),
      ]);

      const trainScore = trainResults.filter((r) => r.correct).length / trainResults.length;
      const testScore = testResults.filter((r) => r.correct).length / testResults.length;

      iterations.push({
        iteration,
        description: currentDescription,
        trainScore,
        testScore,
        trainResults,
        testResults,
      });

      this.logger.log(
        `Iteration ${iteration}: train=${(trainScore * 100).toFixed(0)}% ` +
          `(${trainResults.filter((r) => r.correct).length}/${trainResults.length}), ` +
          `test=${(testScore * 100).toFixed(0)}% ` +
          `(${testResults.filter((r) => r.correct).length}/${testResults.length})`,
      );

      // Check if all train queries passed
      if (trainResults.every((r) => r.correct)) {
        this.logger.log(`All train queries passed on iteration ${iteration}!`);
        break;
      }

      // Early exit: score plateau — no improvement for 2 consecutive iterations
      if (iterations.length >= 3) {
        const last3 = iterations.slice(-3);
        const scores = last3.map((it) => it.trainScore);
        const isPlateaued = scores[2] <= scores[0]; // No net improvement over 2 iterations
        if (isPlateaued) {
          this.logger.log(
            `Score plateau detected (${scores.map((s) => (s * 100).toFixed(0) + '%').join(' → ')}). Stopping early.`,
          );
          break;
        }
      }

      // Don't improve on the last iteration — just record the final score
      if (iteration === maxIterations) {
        this.logger.log(`Max iterations reached (${maxIterations}).`);
        break;
      }

      // Improve the description based on train failures
      currentDescription = await this.improveDescription(
        skill.name,
        skill.skillContent,
        currentDescription,
        trainResults,
        iterations,
      );
    }

    // Select best iteration by TEST score (not train) to avoid overfitting
    const bestIteration = iterations.reduce(
      (best, curr) => (curr.testScore > best.testScore ? curr : best),
      iterations[0],
    );

    const baselineTrainScore = iterations[0].trainScore;
    const baselineTestScore = iterations[0].testScore;

    const result: DescriptionOptimizationResult = {
      originalDescription,
      bestDescription: bestIteration.description,
      iterations,
      bestIteration: bestIteration.iteration,
      improvement: {
        trainDelta: bestIteration.trainScore - baselineTrainScore,
        testDelta: bestIteration.testScore - baselineTestScore,
      },
    };

    this.logger.log(
      `Optimization complete — best iteration: ${bestIteration.iteration}, ` +
        `test score: ${(bestIteration.testScore * 100).toFixed(0)}%, ` +
        `train delta: ${(result.improvement.trainDelta * 100).toFixed(1)}%, ` +
        `test delta: ${(result.improvement.testDelta * 100).toFixed(1)}%`,
    );

    return result;
  }

  /**
   * Step 4: Apply the optimized description to the skill.
   */
  async applyOptimizedDescription(
    skillId: string,
    description: string,
  ): Promise<Skill> {
    const skill = await this.getSkillOrThrow(skillId);

    this.logger.log(
      `Applying optimized description to "${skill.name}" — ` +
        `old: "${skill.description.substring(0, 50)}…", ` +
        `new: "${description.substring(0, 50)}…"`,
    );

    return this.skillRepo.update(skillId, { description });
  }

  // ── Private helpers ─────────────────────────────────────────────────

  /**
   * Split eval queries into train/test, stratified by shouldTrigger.
   * Matches the run_loop.py split_eval_set() function.
   */
  private splitEvalSet(
    queries: TriggerEvalQuery[],
    holdout: number,
  ): { train: TriggerEvalQuery[]; test: TriggerEvalQuery[] } {
    const trigger = queries.filter((q) => q.shouldTrigger);
    const noTrigger = queries.filter((q) => !q.shouldTrigger);

    // Shuffle each group
    shuffleArray(trigger);
    shuffleArray(noTrigger);

    // Calculate split points — at least 1 test item per group
    const nTriggerTest = Math.max(1, Math.round(trigger.length * holdout));
    const nNoTriggerTest = Math.max(1, Math.round(noTrigger.length * holdout));

    const test = [
      ...trigger.slice(0, nTriggerTest),
      ...noTrigger.slice(0, nNoTriggerTest),
    ];
    const train = [
      ...trigger.slice(nTriggerTest),
      ...noTrigger.slice(nNoTriggerTest),
    ];

    return { train, test };
  }

  /**
   * Call the improve-description prompt to propose a better description.
   * Strips test scores from history (same as run_loop.py blinded_history).
   */
  private async improveDescription(
    skillName: string,
    skillContent: string,
    currentDescription: string,
    trainResults: TriggerEvalResult[],
    history: OptimizationIteration[],
  ): Promise<string> {
    // Build eval results section
    const failedTriggers = trainResults.filter(
      (r) => r.shouldTrigger && !r.correct,
    );
    const falseTriggers = trainResults.filter(
      (r) => !r.shouldTrigger && !r.correct,
    );

    let evalResultsText = '';
    if (failedTriggers.length > 0) {
      evalResultsText += 'FAILED TO TRIGGER (should have triggered but didn\'t):\n';
      for (const r of failedTriggers) {
        evalResultsText += `  - "${r.query}" (trigger rate: ${(r.triggerRate * 100).toFixed(0)}%)\n`;
      }
      evalResultsText += '\n';
    }
    if (falseTriggers.length > 0) {
      evalResultsText += 'FALSE TRIGGERS (triggered but shouldn\'t have):\n';
      for (const r of falseTriggers) {
        evalResultsText += `  - "${r.query}" (trigger rate: ${(r.triggerRate * 100).toFixed(0)}%)\n`;
      }
      evalResultsText += '\n';
    }

    // Build blinded history (strip test scores, matching run_loop.py)
    let historyText = '';
    if (history.length > 0) {
      historyText += 'PREVIOUS ATTEMPTS (do NOT repeat these — try something structurally different):\n\n';
      for (const h of history) {
        historyText += `<attempt train=${h.trainResults.filter((r) => r.correct).length}/${h.trainResults.length}>\n`;
        historyText += `Description: "${h.description}"\n`;
        historyText += 'Train results:\n';
        for (const r of h.trainResults) {
          const status = r.correct ? 'PASS' : 'FAIL';
          historyText += `  [${status}] "${r.query.substring(0, 80)}" (rate=${(r.triggerRate * 100).toFixed(0)}%)\n`;
        }
        historyText += '</attempt>\n\n';
      }
    }

    // Build scores summary
    const trainCorrect = trainResults.filter((r) => r.correct).length;
    const scoresSummary = `Train: ${trainCorrect}/${trainResults.length}`;

    const userPrompt = await this.promptLoader.render('improve-description', {
      SKILL_NAME: skillName,
      CURRENT_DESCRIPTION: currentDescription,
      SCORES_SUMMARY: scoresSummary,
      EVAL_RESULTS: evalResultsText,
      HISTORY: historyText,
      SKILL_CONTENT: skillContent,
    });

    const result = await this.llm.sendMessage({
      model: 'main',
      system:
        'You are optimizing a Claude Code skill description for better trigger accuracy. ' +
        'Respond with ONLY the new description in <new_description> tags.',
      messages: [{ role: 'user', content: userPrompt }],
      maxTokens: 2048,
      temperature: 0.5,
    });

    let description = this.extractDescription(result.content);

    // Safety net: if description exceeds 1024 chars, ask for a shorter version
    if (description.length > 1024) {
      this.logger.warn(
        `Description too long (${description.length} chars), requesting shorter version`,
      );
      const shortenResult = await this.llm.sendMessage({
        model: 'main',
        system:
          'You are rewriting a skill description to be shorter. ' +
          'Respond with ONLY the new description in <new_description> tags.',
        messages: [
          { role: 'user', content: userPrompt },
          { role: 'assistant', content: `<new_description>\n${description}\n</new_description>` },
          {
            role: 'user',
            content:
              `That description is ${description.length} characters, which exceeds the 1024-character hard limit. ` +
              'Rewrite it to be under 1024 characters while keeping the most important trigger words. ' +
              'Respond with ONLY the new description in <new_description> tags.',
          },
        ],
        maxTokens: 2048,
        temperature: 0.3,
      });
      description = this.extractDescription(shortenResult.content);
    }

    this.logger.log(
      `Improved description (${description.length} chars): "${description.substring(0, 80)}…"`,
    );

    return description;
  }

  /**
   * Extract description from <new_description> tags.
   */
  private extractDescription(text: string): string {
    const match = text.match(/<new_description>([\s\S]*?)<\/new_description>/);
    if (match) {
      return match[1].trim().replace(/^"|"$/g, '');
    }
    // Fallback: use entire response stripped of quotes
    return text.trim().replace(/^"|"$/g, '');
  }

  /**
   * Parse eval queries from LLM response.
   */
  private parseEvalQueries(
    content: string,
    expectedCount: number,
  ): TriggerEvalQuery[] {
    // Extract a JSON array from the response via the shared parser (handles
    // code fences, preamble, and trailing prose without over-capturing).
    const parsed = parseJsonArray<{
      query?: string;
      shouldTrigger?: boolean;
      should_trigger?: boolean;
    }>(content);

    if (!parsed) {
      throw new Error(
        'Failed to parse trigger eval queries — no JSON array found in response',
      );
    }

    return parsed
      .filter((item) => typeof item.query === 'string')
      .map((item) => ({
        query: item.query!,
        shouldTrigger: item.shouldTrigger ?? item.should_trigger ?? false,
      }));
  }

  private async getSkillOrThrow(skillId: string): Promise<Skill> {
    const skill = await this.skillRepo.findById(skillId);
    if (!skill) {
      throw new NotFoundException(`Skill ${skillId} not found`);
    }
    return skill;
  }
}
