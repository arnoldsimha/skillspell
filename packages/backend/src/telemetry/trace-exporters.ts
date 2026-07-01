import {
  BatchSpanProcessor,
  type SpanProcessor,
} from '@opentelemetry/sdk-trace-base';
import { OTLPTraceExporter } from '@opentelemetry/exporter-trace-otlp-proto';
import { LangfuseSpanProcessor } from '@langfuse/otel';

export interface LangfuseConfig {
  /** Langfuse instance base URL, e.g. http://localhost:3001 (no path suffix). */
  baseUrl: string;
  publicKey: string;
  secretKey: string;
}

/**
 * Build the trace span-processor fan-out for the OTEL NodeSDK.
 *
 * - **Aspire** — every span, via OTLP/proto to the Aspire dashboard (unchanged).
 * - **Langfuse** (only when configured) — the official `@langfuse/otel`
 *   `LangfuseSpanProcessor`. It self-filters to LLM spans (default smart filter:
 *   `gen_ai.*` spans + known LLM instrumentors) and maps GenAI semantic-convention
 *   spans — including Strands' prompt/completion message events — into Langfuse's
 *   input/output/usage model. This replaces the previous raw OTLP→Langfuse exporter,
 *   which only carried token/model attributes (prompts/completions came through
 *   empty because the OTLP endpoint did not extract the GenAI message events).
 *
 * The processor reads keys from the params below; it appends the correct Langfuse
 * ingest path to `baseUrl` itself, so pass the bare base URL.
 */
export function buildTraceProcessors(
  aspireEndpoint: string,
  langfuse?: LangfuseConfig,
): SpanProcessor[] {
  const processors: SpanProcessor[] = [
    new BatchSpanProcessor(
      new OTLPTraceExporter({ url: `${aspireEndpoint}/v1/traces` }),
    ),
  ];
  if (langfuse) {
    processors.push(
      new LangfuseSpanProcessor({
        baseUrl: langfuse.baseUrl,
        publicKey: langfuse.publicKey,
        secretKey: langfuse.secretKey,
      }),
    );
  }
  return processors;
}
