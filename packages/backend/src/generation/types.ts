import type { GenerationStats } from '@skillspell/shared';
import type { ZodType } from 'zod';

/**
 * A structured-output tool schema. `inputSchema` is the JSON Schema (legacy
 * Anthropic tool_use shape); `zodSchema` is the provider-agnostic equivalent
 * used by the Strands structured-output path. Both describe the same shape.
 */
export interface ToolSchema {
  name: string;
  description: string;
  inputSchema: Record<string, unknown>;
  /** Zod equivalent of inputSchema — used for provider-agnostic structured output. */
  zodSchema?: ZodType;
}

/** A test prompt suggestion returned by suggestTestPrompts. */
export interface TestPromptSuggestion {
  label: string;
  prompt: string;
  name: string;
  expectedOutput?: string;
  context?: string;
  assertions?: Array<{
    type: 'contains' | 'not_contains' | 'regex' | 'semantic' | 'custom';
    value: string;
    description?: string;
  }>;
  /** Hint for how many output tokens this case may need. Set by AI generator for long-output cases. */
  maxOutputTokens?: number;
}

/** Internal result from runAgentQuery. */
export interface AgentQueryResult {
  content: string;
  stats?: GenerationStats;
}

/** Options for tuning agent query behavior per call. */
export interface AgentQueryOptions {
  /** Max conversation turns before stopping. Default: 3 */
  maxTurns?: number;
}

/** Result from a direct Messages API call, including token usage. */
export interface MessageResult {
  content: string;
  usage: {
    inputTokens: number;
    outputTokens: number;
  };
}

/** Options for sending a direct message via the Messages API. */
export interface SendMessageOptions {
  /**
   * Which deployment to use: 'main' (default) or 'light'.
   * Resolved internally to the configured deployment name.
   */
  model?: 'main' | 'light';
  maxTokens?: number;
  /** Single system prompt string — automatically cached via cache_control. */
  system?: string;
  /**
   * Multiple system blocks, each independently cacheable.
   * Use when different parts of the system context have different cache lifetimes
   * (e.g. static grader instructions + per-skill content).
   * Takes precedence over `system` when both are provided.
   */
  systemBlocks?: Array<{ text: string; cached?: boolean }>;
  messages: Array<{ role: 'user' | 'assistant'; content: string }>;
  temperature?: number;
  /**
   * Optional tool schema for structured JSON output via tool_use.
   * When provided, the model is forced to respond with a tool_use block
   * whose `input` conforms to the given JSON schema — guaranteeing valid JSON.
   */
  toolSchema?: ToolSchema;
  /**
   * Timeout profile: 'light' uses lightTimeoutMs (for grading, suggestions),
   * 'generation' uses generationTimeoutMs (default, for skill generation/refinement).
   */
  timeout?: 'light' | 'generation';
  /**
   * Optional AbortSignal to cancel the in-flight HTTP request.
   * When aborted, the underlying Anthropic API call is terminated immediately,
   * preventing further token consumption.
   */
  signal?: AbortSignal;
}

/** Options for runLightQuery — lightweight Messages API calls. */
export interface LightQueryOptions {
  /** Maximum tokens to generate. Default: 1024 */
  maxTokens?: number;
  /** Sampling temperature. Default: 0 */
  temperature?: number;
  /** Override the model to use. Defaults to the configured light model. */
  model?: string;
  /** Override the request timeout in ms. Defaults to lightTimeoutMs. */
  timeoutMs?: number;
  /** Optional tool schema for structured JSON output. */
  toolSchema?: ToolSchema;
  /** Optional AbortSignal to cancel the in-flight HTTP request. */
  signal?: AbortSignal;
}
