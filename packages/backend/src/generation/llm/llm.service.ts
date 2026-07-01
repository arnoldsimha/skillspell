import { Injectable, Inject } from '@nestjs/common';
import { StrandsConfigService } from './transports/strands/strands-config.service.js';
import { LLM_TRANSPORT, type LlmTransport } from './llm-transport.port.js';
import type {
  AgentQueryResult,
  AgentQueryOptions,
  MessageResult,
  SendMessageOptions,
  LightQueryOptions,
} from '../types.js';

/**
 * LlmService — the single, provider-agnostic entry point for all LLM calls.
 *
 * Every feature (generation, refinement, evaluation, grading, suggestions,
 * diagrams, optimization) injects this facade. It delegates to the bound
 * LLM_TRANSPORT adapter (the Strands runtime today), which runs against
 * whichever provider LLM_PROVIDER selects (anthropic, azure, bedrock, openai,
 * google). There is no provider- or framework-specific code at any call site —
 * switching providers is an env-var change; switching the runtime framework is
 * a new adapter bound to LLM_TRANSPORT.
 */
@Injectable()
export class LlmService {
  constructor(
    @Inject(LLM_TRANSPORT) private readonly transport: LlmTransport,
    private readonly config: StrandsConfigService,
  ) {}

  /** Main model id for the configured provider. */
  get model(): string {
    return this.config.getMainModel();
  }

  /** Light/fast model id for the configured provider. */
  get lightModel(): string {
    return this.config.getLightModel();
  }

  /** Timeout (ms) for heavy generation/agent calls. */
  get generationTimeoutMs(): number {
    return this.config.getGenerationTimeoutMs();
  }

  /** Root skills-workspace directory (contains skills/ + references). */
  get skillsWorkspace(): string {
    return this.transport.skillsWorkspace;
  }

  /** Agent query with skill discovery (generation, refinement). */
  runAgentQuery(
    systemInstruction: string,
    userPrompt: string,
    agentOptions?: AgentQueryOptions,
    signal?: AbortSignal,
  ): Promise<AgentQueryResult> {
    return this.transport.runAgentQuery(systemInstruction, userPrompt, agentOptions, signal);
  }

  /** Lightweight query (suggestions, diagrams, eval, optimizer). */
  runLightQuery(
    systemInstruction: string,
    userPrompt: string,
    options?: LightQueryOptions,
  ): Promise<MessageResult> {
    return this.transport.runLightQuery(systemInstruction, userPrompt, options);
  }

  /** Direct message (grading, eval-runner, optimizer). */
  sendMessage(options: SendMessageOptions): Promise<MessageResult> {
    return this.transport.sendMessage(options);
  }

  /** Diagnostics: confirm skills are discoverable. */
  validateSkillsLoaded(): Promise<string> {
    return this.transport.validateSkillsLoaded();
  }
}
