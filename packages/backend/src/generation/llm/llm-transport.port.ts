import type {
  AgentQueryResult,
  AgentQueryOptions,
  MessageResult,
  LightQueryOptions,
  SendMessageOptions,
} from '../types.js';

/**
 * Provider-agnostic LLM transport port (ports-and-adapters).
 *
 * This is the contract every LLM call goes through. The runtime framework
 * (today: Strands) is a swappable adapter bound to the {@link LLM_TRANSPORT}
 * token — switching frameworks means writing one new adapter that implements
 * this interface and rebinding the token, with no change to consumers.
 *
 * `LlmService` is the public facade that consumers inject; it delegates to the
 * bound transport. Vendor-specific code lives only inside the adapters.
 */
export interface LlmTransport {
  /** Agent query with skill discovery (generation, refinement). */
  runAgentQuery(
    systemInstruction: string,
    userPrompt: string,
    agentOptions?: AgentQueryOptions,
    signal?: AbortSignal,
  ): Promise<AgentQueryResult>;

  /** Lightweight query (suggestions, diagrams, eval, optimizer). */
  runLightQuery(
    systemInstruction: string,
    userPrompt: string,
    options?: LightQueryOptions,
  ): Promise<MessageResult>;

  /** Direct message (grading, eval-runner, optimizer). */
  sendMessage(options: SendMessageOptions): Promise<MessageResult>;

  /** Diagnostics: confirm skills are discoverable from the workspace. */
  validateSkillsLoaded(): Promise<string>;

  /** Root skills-workspace directory (contains skills/ + references). */
  readonly skillsWorkspace: string;
}

/** DI token for the bound {@link LlmTransport} adapter. */
export const LLM_TRANSPORT = Symbol('LLM_TRANSPORT');
