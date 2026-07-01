import { Injectable, Logger } from '@nestjs/common';
import { LlmService } from '../generation/llm/llm.service.js';
import type {
  EvalCase,
  EvalRun,
  EvalRunConfig,
  EvalTiming,
  Skill,
} from '@skillspell/shared';
import { v4 as uuidv4 } from 'uuid';
import { buildFlatMarkdown } from '../common/utils/skill-assembler.js';

/**
 * Executes individual eval runs by sending prompts to Claude via the Messages API.
 *
 * For each eval case:
 * - Runs the prompt WITH the skill applied as a system prompt
 * - Optionally runs the prompt WITHOUT any system prompt (baseline comparison)
 * - Records timing and token usage from the API response
 */
@Injectable()
export class EvalRunnerService {
  private readonly logger = new Logger(EvalRunnerService.name);

  constructor(private readonly llm: LlmService) {}

  /**
   * Execute a single eval case and return the run result.
   * Grading is NOT performed here — the caller is responsible for that.
   */
  async executeEval(
    evalCase: EvalCase,
    skill: Pick<Skill, 'skillContent' | 'scripts' | 'references' | 'assets'>,
    config: EvalRunConfig,
    signal?: AbortSignal,
  ): Promise<Omit<EvalRun, 'grading'>> {
    const runId = uuidv4();
    const startTime = Date.now();

    this.logger.log(
      `Starting eval run ${runId} for eval case "${evalCase.name}" (${evalCase.id})`,
    );

    if (signal?.aborted) throw new Error('Request cancelled by client');

    // Assemble all four skill fields into a single system prompt string
    const systemPrompt = buildFlatMarkdown(skill, true); // includeHeader: true preserves YAML frontmatter
    this.logger.log(
      `Running eval case with skill (${systemPrompt.length} chars)` +
        (config.compareBaseline ? ` + baseline comparison` : ''),
    );

    // Prepend the case's context (if any) to the user message so it reaches the
    // model. The skill stays in the system prompt (it's what's under test); the
    // context is scenario setup, so it belongs in the conversation. Both the
    // with-skill and baseline runs see identical context, keeping the comparison
    // fair, and grading sees it too (run.prompt carries the augmented content).
    const userContent =
      evalCase.context && evalCase.context.trim().length > 0
        ? `<context>\n${evalCase.context.replace(/</g, '&lt;').replace(/>/g, '&gt;')}\n</context>\n\n${evalCase.prompt}`
        : evalCase.prompt;

    const [withSkillResult, baselineResult] = await Promise.all([
      this.runPrompt(userContent, config, systemPrompt, signal),
      config.compareBaseline
        ? this.runPrompt(userContent, config, undefined, signal)
        : Promise.resolve(null),
    ]);

    const outputWithoutSkill = baselineResult?.output;
    const baselineTiming = baselineResult?.timing;

    const totalDuration = Date.now() - startTime;

    this.logger.log(
      `Eval run ${runId} completed in ${totalDuration}ms ` +
        `(with-skill: ${withSkillResult.timing.totalTokens} tokens` +
        `${config.compareBaseline ? `, baseline: ${baselineTiming?.totalTokens || 0} tokens` : ''})`,
    );

    return {
      id: runId,
      evalId: evalCase.id,
      skillId: evalCase.skillId,
      config,
      // Store the exact input the model received (context + prompt) so grading
      // and the comparison view reflect what was actually sent.
      prompt: userContent,
      outputWithSkill: withSkillResult.output,
      outputWithoutSkill,
      outputFiles: [], // No file outputs for now — can extend later
      timing: withSkillResult.timing,
      baselineTiming,
      status: 'completed',
      createdAt: new Date().toISOString(),
      completedAt: new Date().toISOString(),
    };
  }

  /**
   * Run a prompt via the Messages API, optionally with a system prompt.
   *
   * When `systemPrompt` is provided, it's used as the skill under test.
   * When omitted, runs a bare baseline comparison (no skill applied).
   * Both paths use the main model for fair comparison.
   */
  private async runPrompt(
    prompt: string,
    config: EvalRunConfig,
    systemPrompt?: string,
    signal?: AbortSignal,
  ): Promise<{ output: string; timing: EvalTiming }> {
    const startTime = Date.now();
    const mode = systemPrompt ? 'with-skill' : 'baseline';
    this.logger.log(`Sending eval prompt via LLM (mode: ${mode}${systemPrompt ? `, systemPrompt: ${systemPrompt.length} chars` : ', no skill'})`);

    // Cap output tokens server-side — eval runs don't need multi-page responses.
    // 8192 comfortably covers realistic skill outputs; callers can override via config.maxTokens.
    const effectiveMaxTokens = config.maxTokens || 8192;

    const response = await this.llm.sendMessage({
      model: (config.model === 'light' ? 'light' : 'main') as 'main' | 'light',
      maxTokens: effectiveMaxTokens,
      ...(systemPrompt ? { system: systemPrompt } : {}),
      messages: [{ role: 'user', content: prompt }],
      temperature: config.temperature,
      signal,
    });

    const inputTokens = response.usage?.inputTokens || 0;
    const outputTokens = response.usage?.outputTokens || 0;

    return {
      output: response.content,
      timing: {
        durationMs: Date.now() - startTime,
        inputTokens,
        outputTokens,
        totalTokens: inputTokens + outputTokens,
        outputChars: response.content.length,
      },
    };
  }
}
