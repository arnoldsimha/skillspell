import { Injectable, Logger } from '@nestjs/common';
import { Agent, BeforeToolCallEvent, AfterToolCallEvent } from '@strands-agents/sdk';
import { AgentSkills } from '@strands-agents/sdk/vended-plugins/skills';
import { StrandsConfigService } from './strands-config.service.js';
import { PromptDumpService } from '../../../prompts/prompt-dump.service.js';
import type { LlmTransport } from '../../llm-transport.port.js';
import type {
  AgentQueryResult,
  AgentQueryOptions,
  MessageResult,
  LightQueryOptions,
  SendMessageOptions,
  ToolSchema,
} from '../../../types.js';
import type { GenerationStats } from '@skillspell/shared';
import { resolve } from 'node:path';
import { existsSync, readdirSync } from 'node:fs';
import { withRateLimitRetry, withTimeout } from './rate-limit-retry.js';

/**
 * Strands Agent execution service — wrapper around Strands Agent + AgentSkills.
 *
 * This service handles:
 * - Agent initialization with skill discovery from skills-workspace/skills/
 * - Provider-agnostic model selection (Anthropic, OpenAI, Google)
 * - System prompt injection
 * - Token usage tracking
 * - Prompt dumping for debugging
 *
 * Provides the runAgentQuery path with multi-provider support via Strands.
 */
@Injectable()
export class StrandsTransport implements LlmTransport {
  private readonly logger = new Logger(StrandsTransport.name);
  private readonly skillsDir: string;
  private readonly skillsWorkspaceDir: string;

  /** Root skills-workspace directory (contains the skills/ folder + references). */
  get skillsWorkspace(): string {
    return this.skillsWorkspaceDir;
  }

  constructor(
    private readonly config: StrandsConfigService,
    private readonly promptDump: PromptDumpService,
  ) {
    // Skills live in a tool-agnostic skills/ directory (not .claude/skills/).
    // Honors SKILLS_WORKSPACE_DIR / SKILLS_PROJECT_DIR (via config), with a
    // cwd-based fallback for local dev — so containers with a non-standard cwd
    // can point at the right location instead of guessing from process.cwd().
    this.skillsWorkspaceDir = this.config.getSkillsWorkspaceDir();
    this.skillsDir = resolve(this.skillsWorkspaceDir, 'skills');

    if (!existsSync(this.skillsDir)) {
      const isProduction = process.env.NODE_ENV === 'production';
      const message = `Skills directory not found at ${this.skillsDir}`;
      if (isProduction) {
        this.logger.error(
          `❌ ${message} — skills are required in production. ` +
          `Ensure skills-workspace/skills/ exists and is properly deployed.`,
        );
        throw new Error(message);
      } else {
        this.logger.warn(
          `⚠️ ${message} — skills will not be discovered in development. ` +
          `Run: mkdir -p skills-workspace/skills if starting fresh.`,
        );
      }
    } else {
      const skillCount = this.getAvailableSkills().length;
      this.logger.log(
        `📂 Skills directory ready: ${this.skillsDir} (${skillCount} skills available)`,
      );
    }
  }

  /**
   * Discover available skills in the skills directory.
   * A skill is a directory with a SKILL.md file.
   */
  private getAvailableSkills(): string[] {
    if (!existsSync(this.skillsDir)) {
      return [];
    }

    try {
      const entries = readdirSync(this.skillsDir, { withFileTypes: true });
      const skills = entries
        .filter((entry) => {
          if (!entry.isDirectory()) return false;
          const skillMarkdown = resolve(this.skillsDir, entry.name, 'SKILL.md');
          return existsSync(skillMarkdown);
        })
        .map((entry) => entry.name);
      return skills;
    } catch (error) {
      this.logger.error(
        `Failed to discover skills: ${error instanceof Error ? error.message : String(error)}`,
      );
      return [];
    }
  }

  /**
   * Render a short (<=100 char) single-line preview of a tool result for logging.
   * Extracts text content where possible, falls back to a JSON stringification.
   */
  private previewToolResult(result: any): string {
    let text: string;
    try {
      const content = result?.content;
      if (Array.isArray(content)) {
        text = content
          .map((b: any) => b?.text ?? b?.toolResultContent?.text ?? JSON.stringify(b))
          .join(' ');
      } else {
        text = typeof result === 'string' ? result : JSON.stringify(result ?? '');
      }
    } catch {
      text = String(result ?? '');
    }
    text = text.replace(/\s+/g, ' ').trim();
    return text.length > 100 ? `${text.slice(0, 100)}…` : text;
  }

  /**
   * Validate that skills are discoverable from the workspace.
   * Returns a human-readable summary (used by the diagnostics endpoint).
   */
  async validateSkillsLoaded(): Promise<string> {
    const skills = this.getAvailableSkills();
    if (skills.length === 0) {
      return `No skills discovered in ${this.skillsDir}`;
    }
    return `Discovered ${skills.length} skill(s) in ${this.skillsDir}: ${skills.join(', ')}`;
  }

  /**
   * Run a query using Strands Agent with skill discovery.
   *
   * @param systemInstruction System prompt to inject
   * @param userPrompt User message
   * @param agentOptions Agent configuration (maxTurns)
   * @param signal Abort signal for cancellation
   * @returns AgentQueryResult with content and stats
   */
  async runAgentQuery(
    systemInstruction: string,
    userPrompt: string,
    agentOptions: AgentQueryOptions = {},
    signal?: AbortSignal,
  ): Promise<AgentQueryResult> {
    const startTime = Date.now();
    const dumpId = this.promptDump.generateId();

    this.logger.debug(
      `Running Strands Agent query — prompt length: ${userPrompt.length}, ` +
        `system prompt: "${systemInstruction.substring(0, 20)}…" (${systemInstruction.length} chars), ` +
        `options: ${JSON.stringify(agentOptions)}` +
        (dumpId ? `, dumpId: ${dumpId}` : ''),
    );

    if (signal?.aborted) {
      throw new Error('Request cancelled by client');
    }

    try {
      const agent = this.buildAgent(systemInstruction);

      // Invoke agent — Strands discovers and loads skills during execution.
      // maxTurns caps the agent loop; cancelSignal lets an external abort stop
      // it mid-flight. Wrapped with rate-limit retry + timeout for resilience.
      const invokeOptions: any = {};
      if (agentOptions.maxTurns && agentOptions.maxTurns > 0) {
        invokeOptions.limits = { turns: agentOptions.maxTurns };
      }
      if (signal) {
        invokeOptions.cancelSignal = signal;
      }
      this.logger.log(
        `📤 Invoking Strands Agent with prompt (${userPrompt.length} chars), ` +
          `maxTurns: ${agentOptions.maxTurns ?? 'default'}…`,
      );
      const result = await withRateLimitRetry(
        () =>
          withTimeout(
            agent.invoke(userPrompt, invokeOptions),
            this.config.getGenerationTimeoutMs(),
            'runAgentQuery',
          ),
        signal,
        'runAgentQuery',
      );

      // Cooperative cancellation: Strands returns (not throws) with this stop
      // reason when cancelSignal fires. Surface it as an abort to the caller.
      if ((result as any).stopReason === 'cancelled') {
        throw new Error('Request cancelled by client');
      }
      this.logger.log(`✅ Strands Agent execution complete`);

      const textContent = this.extractText(result);
      const stats = this.extractStats(result, startTime);

      const elapsed = ((Date.now() - startTime) / 1000).toFixed(1);
      this.logger.log(
        `Strands Agent response received (${textContent.length} chars, took ${elapsed}s, ` +
          `tokens: ${stats.inputTokens}in/${stats.outputTokens}out` +
          `${stats.cacheReadInputTokens || stats.cacheCreationInputTokens ? `, cache: ${stats.cacheReadInputTokens} read / ${stats.cacheCreationInputTokens} written` : ', cache: none'})` +
          (dumpId ? ` (dumpId: ${dumpId})` : ''),
      );

      return { content: textContent, stats };
    } catch (error) {
      const elapsed = ((Date.now() - startTime) / 1000).toFixed(1);
      this.logger.error(
        `Strands Agent query failed after ${elapsed}s: ${error instanceof Error ? error.message : String(error)}` +
          (dumpId ? ` (dumpId: ${dumpId})` : ''),
      );
      throw error;
    }
  }

  /**
   * Build a Strands Agent with the skills plugin and a cached system prompt.
   * The system prompt (preloaded few-shot examples + output contract) is large
   * and static across generate/refine calls, so it gets a cachePoint — Strands'
   * AnthropicModel adds cache_control:ephemeral to the preceding text block,
   * enabling Anthropic prompt caching (latency/cost win on repeated iterations).
   */
  private buildAgent(systemInstruction: string): any {
    const model = this.config.getModel();
    this.logger.log(`🧠 Model initialized: ${model.constructor.name}`);

    const availableSkills = this.getAvailableSkills();
    this.logger.log(
      `🔍 Skill discovery: found ${availableSkills.length} skill(s): ${availableSkills.join(', ') || '(none)'}`,
    );

    const skillsPlugin = new AgentSkills({ skills: [this.skillsDir] });
    this.logger.debug(`🔌 AgentSkills plugin initialized for: ${this.skillsDir}`);

    const agent = new Agent({
      model,
      systemPrompt: [{ text: systemInstruction }, { cachePoint: { cacheType: 'default' } }],
      plugins: [skillsPlugin],
      // Disable Strands' console printer — it streams reasoning/tool activity to stdout.
      printer: false,
    } as any);

    this.attachLoggingHooks(agent);
    this.logger.log(
      `⚙️ Strands Agent created with ${availableSkills.length} skill(s) available (system prompt cached)`,
    );
    return agent;
  }

  /**
   * Log tool invocations concisely (name + trimmed result preview) so we can see
   * which tools/skills the agent calls without the full stdout dump.
   */
  private attachLoggingHooks(agent: any): void {
    if (typeof agent.addHook !== 'function') return;
    agent.addHook(BeforeToolCallEvent, (event: any) => {
      this.logger.log(`🔧 Tool called: ${event?.toolUse?.name ?? 'unknown'}`);
    });
    agent.addHook(AfterToolCallEvent, (event: any) => {
      const name = event?.toolUse?.name ?? 'unknown';
      if (event?.error) {
        this.logger.warn(`🔧 Tool failed: ${name} — ${String(event.error).slice(0, 100)}`);
        return;
      }
      this.logger.log(`🔧 Tool completed: ${name} → ${this.previewToolResult(event?.result)}`);
    });
  }

  /** Extract concatenated text content from an agent result, with type guards. */
  private extractText(result: any): string {
    if (!Array.isArray(result.lastMessage?.content)) {
      throw new Error(
        `Invalid response: lastMessage.content is not an array. ` +
          `Got: ${typeof result.lastMessage?.content}`,
      );
    }

    const textBlocks = result.lastMessage.content.filter(
      (block: any) => block.type === 'textBlock',
    );
    if (textBlocks.length === 0) {
      this.logger.warn('No text blocks found in agent response');
    }

    return textBlocks
      .map((block: any) => {
        if (typeof block.text !== 'string') {
          this.logger.warn(`Text block missing or invalid text property: ${JSON.stringify(block)}`);
          return '';
        }
        return block.text;
      })
      .join('');
  }

  /** Extract token usage + turn metrics from an agent result. */
  private extractStats(result: any, startTime: number): GenerationStats {
    const usage = result.lastMessage?.metadata?.usage;
    let numTurns = 1;
    if (
      result.metrics?.agentInvocations?.[0]?.cycles &&
      Array.isArray(result.metrics.agentInvocations[0].cycles)
    ) {
      numTurns = result.metrics.agentInvocations[0].cycles.length ?? 1;
    }
    return {
      inputTokens: usage?.inputTokens ?? 0,
      outputTokens: usage?.outputTokens ?? 0,
      cacheReadInputTokens: usage?.cacheReadInputTokens ?? 0,
      cacheCreationInputTokens: usage?.cacheWriteInputTokens ?? 0,
      numTurns,
      costUsd: 0, // Calculate from token counts if needed
      durationMs: Date.now() - startTime,
    };
  }

  /**
   * Run a lightweight query (no agent loop, no skills).
   *
   * All providers route through the Strands Model with Zod structured output.
   * Used for fast structured calls: suggestions, diagrams, eval, optimizer,
   * explain-failure.
   */
  async runLightQuery(
    systemInstruction: string,
    userPrompt: string,
    options: LightQueryOptions = {},
  ): Promise<MessageResult> {
    const modelId = options.model || this.config.getLightModel();

    if (options.signal?.aborted) {
      throw new Error('Request cancelled by client');
    }

    return this.strandsStructured({
      method: 'runLightQuery',
      modelId,
      system: systemInstruction,
      userPrompt,
      toolSchema: options.toolSchema,
      timeoutMs: options.timeoutMs ?? this.config.getLightTimeoutMs(),
      signal: options.signal,
      maxTokens: options.maxTokens,
      temperature: options.temperature,
    });
  }

  /**
   * Send a direct message (no agent loop, no skills).
   *
   * All providers route through Strands. Supports 'main'/'light' model
   * selection, single or multi-block cached system prompts, and structured
   * output.
   */
  async sendMessage(options: SendMessageOptions): Promise<MessageResult> {
    const modelId =
      options.model === 'light'
        ? this.config.getLightModel()
        : this.config.getMainModel();

    if (options.signal?.aborted) {
      throw new Error('Request cancelled by client');
    }

    // Pass system/systemBlocks through to buildCachedSystemPrompt.
    const userPrompt = options.messages.map((m) => m.content).join('\n\n');
    return this.strandsStructured({
      method: 'sendMessage',
      modelId,
      system: options.system,
      systemBlocks: options.systemBlocks,
      userPrompt,
      toolSchema: options.toolSchema,
      timeoutMs:
        options.timeout === 'light'
          ? this.config.getLightTimeoutMs()
          : this.config.getGenerationTimeoutMs(),
      signal: options.signal,
      maxTokens: options.maxTokens,
      temperature: options.temperature,
    });
  }

  /**
   * Build a cached system prompt block array for the Strands Agent constructor.
   * Strands' AnthropicModel sets cache_control:ephemeral on the block immediately
   * preceding a cachePointBlock, so placing the text block then a cachePoint
   * caches the system prefix so Anthropic prompt caching applies on repeated calls.
   */
  private buildCachedSystemPrompt(
    system: string | undefined,
    systemBlocks: Array<{ text: string; cached?: boolean }> | undefined,
  ): Array<{ text: string } | { cachePoint: { cacheType: 'default' } }> | undefined {
    // Join the system text (multi-block content concatenates into one cached prefix).
    const text = systemBlocks?.length
      ? systemBlocks.map((b) => b.text).join('\n\n')
      : system;
    if (!text) return undefined;
    // Cache the static system prefix: cache_control is applied to the block before the cachePoint.
    return [{ text }, { cachePoint: { cacheType: 'default' } }];
  }

  /**
   * Provider-agnostic structured/text call via the Strands Model.
   * When a toolSchema with a zodSchema is provided, uses Strands structured
   * output (validated object → JSON string). Otherwise returns text.
   */
  private async strandsStructured(args: {
    method: 'runLightQuery' | 'sendMessage';
    modelId: string;
    system?: string;
    systemBlocks?: Array<{ text: string; cached?: boolean }>;
    userPrompt: string;
    toolSchema?: ToolSchema;
    timeoutMs: number;
    signal?: AbortSignal;
    maxTokens?: number;
    temperature?: number;
  }): Promise<MessageResult> {
    const { method, modelId, system, systemBlocks, userPrompt, toolSchema, timeoutMs, signal, maxTokens, temperature } = args;
    const startTime = Date.now();
    const dumpId = this.promptDump.generateId();
    this.promptDump.write(dumpId, method, {
      provider: this.config.getProvider(),
      modelId,
      system,
      userPrompt,
      structuredOutput: toolSchema?.name,
    });

    if (toolSchema && !toolSchema.zodSchema) {
      throw new Error(
        `Provider "${this.config.getProvider()}" requires a Zod schema for structured ` +
          `output, but tool schema "${toolSchema.name}" has none.`,
      );
    }

    try {
      const model = this.config.getModel(modelId, { maxTokens, temperature });
      const systemPrompt = this.buildCachedSystemPrompt(system, systemBlocks);
      const agent = new Agent({
        model,
        ...(systemPrompt ? { systemPrompt } : {}),
        // Disable the console printer (streams content to stdout — log noise).
        printer: false,
      } as any);

      // cancelSignal lets an external abort stop the agent mid-flight.
      const baseInvokeOpts: any = signal ? { cancelSignal: signal } : {};
      let content: string;
      let result: any;
      if (toolSchema?.zodSchema) {
        result = await withRateLimitRetry(
          () =>
            withTimeout(
              agent.invoke(userPrompt, {
                ...baseInvokeOpts,
                structuredOutputSchema: toolSchema.zodSchema,
              } as any),
              timeoutMs,
              method,
            ),
          signal,
          method,
        );
        if ((result as any).stopReason === 'cancelled') {
          throw new Error('Request cancelled by client');
        }
        if (result.structuredOutput === undefined) {
          throw new Error('Strands structured output returned no validated object');
        }
        content = JSON.stringify(result.structuredOutput);
      } else {
        result = await withRateLimitRetry(
          () => withTimeout(agent.invoke(userPrompt, baseInvokeOpts), timeoutMs, method),
          signal,
          method,
        );
        if ((result as any).stopReason === 'cancelled') {
          throw new Error('Request cancelled by client');
        }
        content = Array.isArray(result.lastMessage?.content)
          ? result.lastMessage.content
              .filter((b: any) => b.type === 'textBlock')
              .map((b: any) => (typeof b.text === 'string' ? b.text : ''))
              .join('')
          : '';
      }

      if (!content) {
        throw new Error('Strands returned empty response');
      }

      const usage = result.lastMessage?.metadata?.usage;
      const elapsed = ((Date.now() - startTime) / 1000).toFixed(1);
      const cacheRead = usage?.cacheReadInputTokens;
      const cacheWrite = usage?.cacheWriteInputTokens;
      const cacheStr =
        cacheRead || cacheWrite
          ? `, cache: ${cacheRead ?? 0} read / ${cacheWrite ?? 0} written`
          : '';
      this.logger.log(
        `Strands ${method} (${this.config.getProvider()}) response (${content.length} chars, ` +
          `took ${elapsed}s, tokens: ${usage?.inputTokens ?? '?'}in/${usage?.outputTokens ?? '?'}out${cacheStr}, ` +
          `dumpId: ${dumpId})`,
      );

      return {
        content,
        usage: {
          inputTokens: usage?.inputTokens ?? 0,
          outputTokens: usage?.outputTokens ?? 0,
        },
      };
    } catch (error) {
      const elapsed = ((Date.now() - startTime) / 1000).toFixed(1);
      this.logger.error(
        `Strands ${method} (${this.config.getProvider()}) failed after ${elapsed}s: ` +
          `${error instanceof Error ? error.message : String(error)} (dumpId: ${dumpId})`,
      );
      throw error;
    }
  }
}
