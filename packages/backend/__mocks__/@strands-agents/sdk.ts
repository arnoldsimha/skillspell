// Mock for @strands-agents/sdk (ESM module)
// Provides stub implementations for testing

export class Agent {
  constructor(config: any) {
    this.config = config;
  }

  private config: any;

  addHook(_eventType: any, _callback: any) {
    return () => {};
  }

  async invoke(args: any, options?: any) {
    return {
      type: 'agentResult',
      stopReason: 'endTurn',
      lastMessage: {
        type: 'message',
        role: 'assistant',
        content: [
          {
            type: 'textBlock',
            text: 'Mock agent response',
          },
        ],
        metadata: {
          usage: {
            inputTokens: 100,
            outputTokens: 50,
            totalTokens: 150,
          },
        },
      },
      metrics: {
        agentInvocations: [
          {
            cycles: [{}],
            usage: {
              inputTokens: 100,
              outputTokens: 50,
              totalTokens: 150,
            },
          },
        ],
      },
      invocationState: {},
    };
  }

  stream(args: any, options?: any) {
    return (async function* () {
      yield { type: 'initialization' };
    })();
  }
}

export class AnthropicModel {
  config: any;
  constructor(config: any) { this.config = config; }
}

export class BedrockModel {
  config: any;
  constructor(config: any) { this.config = config; }
}

export class OpenAIModel {
  config: any;
  constructor(config: any) { this.config = config; }
}

export class GoogleModel {
  config: any;
  constructor(config: any) { this.config = config; }
}

export type Model = any;
export type InvokeArgs = any;
export type InvokeOptions = any;
export type AgentResult = any;
export type AgentConfig = any;
export type ToolList = any;
export type ToolExecutorStrategy = any;

// Export all types (minimal stubs for Jest)
export const SNAPSHOT_SCHEMA_VERSION = 1;
export const ModelError = Error;
export const ContextWindowOverflowError = Error;
export const MaxTokensError = Error;
export const JsonValidationError = Error;
export const ConcurrentInvocationError = Error;
export const ModelThrottledError = Error;
export const ToolValidationError = Error;
export const StructuredOutputError = Error;
export const ToolNotFoundError = Error;
export const DefaultNotConfiguredError = Error;

export const TextBlock = {};
export const ToolUseBlock = {};
export const ToolResultBlock = {};
export const ReasoningBlock = {};
export const CachePointBlock = {};
export const GuardContentBlock = {};
export const Message = {};
export const JsonBlock = {};
export const CitationsBlock = {};
export const S3Location = {};
export const ImageBlock = {};
export const VideoBlock = {};
export const DocumentBlock = {};
export const Tool = {};
export const ToolStreamEvent = {};
export const FunctionTool = {};
export const ZodTool = {};
export const HookRegistry = {};
export const HookOrder = {};
export const StreamEvent = {};
export const HookableEvent = {};
export const InitializedEvent = {};
export const BeforeInvocationEvent = {};
export const AfterInvocationEvent = {};
export const MessageAddedEvent = {};
export const BeforeToolCallEvent = {};
export const AfterToolCallEvent = {};
export const BeforeModelCallEvent = {};
export const AfterModelCallEvent = {};
export const BeforeToolsEvent = {};
export const AfterToolsEvent = {};
export const ContentBlockEvent = {};
export const ModelMessageEvent = {};
export const ToolResultEvent = {};
export const ToolStreamUpdateEvent = {};
export const AgentResultEvent = {};
export const InterruptEvent = {};
export const ModelStreamUpdateEvent = {};
export const InterventionHandler = {};
export const InterventionActions = {};
export const ConstantBackoff = {};
export const LinearBackoff = {};
export const ExponentialBackoff = {};
export const ModelRetryStrategy = {};
export const DefaultModelRetryStrategy = {};
export const ConversationManager = {};
export const NullConversationManager = {};
export const SlidingWindowConversationManager = {};
export const SummarizingConversationManager = {};
export const SessionManager = {};
export const FileStorage = {};
export const AgentTrace = {};
export const AgentMetrics = {};
export const Sandbox = {};
export const PosixShellSandbox = {};
export const SandboxTimeoutError = Error;
export const SandboxAbortError = Error;
export const SandboxPathNotFoundError = Error;
export const InvokeModelStage = {};
export const ExecuteToolStage = {};
export const Graph = {};
export const Swarm = {};
export const MemoryManager = {};
export const ExtractionTrigger = {};
export const InvocationTrigger = {};
export const IntervalTrigger = {};
export const ModelExtractor = {};

export function contentBlockFromData(data: any) { return data; }
export function toolResultContentFromData(data: any) { return data; }
export function tool(config: any) { return config; }
export function isModelStreamEvent(event: any) { return true; }
export function configureLogging(config: any) {}
