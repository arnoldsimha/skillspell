/**
 * OpenTelemetry SDK bootstrap — must be imported BEFORE any other module.
 *
 * This file initializes the OTEL NodeSDK with:
 * - OTLP/proto exporters for traces, metrics, and logs
 * - Selective auto-instrumentation (HTTP, Express, NestJS, pg)
 * - Resource attributes (service name, version)
 *
 * The SDK is only started when OTEL_EXPORTER_OTLP_ENDPOINT is set.
 * In dev, this points to the Aspire Dashboard (http://localhost:18890).
 * In prod, point it to your collector (Azure Monitor, Jaeger, etc.).
 *
 * @see https://opentelemetry.io/docs/languages/js/getting-started/nodejs/
 * @see https://learn.microsoft.com/en-us/dotnet/aspire/fundamentals/dashboard/standalone
 */
import { config } from 'dotenv';
import { resolve } from 'node:path';
import EventEmitter from 'node:events';

// Load .env BEFORE checking OTEL_EXPORTER_OTLP_ENDPOINT.
// tracing.ts is the first import in main.ts — dotenv hasn't run yet.
// In compiled mode __dirname = dist/src/telemetry/, go up 3 levels to package root.
config({ path: resolve(__dirname, '..', '..', '..', '.env') });

// Enable GenAI tool-definition capture if LANGFUSE_OTEL_PAYLOADS is set.
// Must run BEFORE the Strands/OTel tracer module initializes.
//
// Strands emits prompt/completion content as OTel span events unconditionally.
// We deliberately do NOT opt into `gen_ai_latest_experimental`: that switches
// Strands to a single `gen_ai.client.inference.operation.details` event which
// Langfuse does NOT map (verified — input/output arrive empty). The default
// STABLE convention emits per-message `gen_ai.user.message`/`gen_ai.choice`
// events, which Langfuse maps to observation input/output. We only add
// `gen_ai_tool_definitions` (tool JSON schemas on spans) — orthogonal to the
// message convention and safe to combine with stable.
if (process.env.LANGFUSE_OTEL_PAYLOADS === 'true') {
  const existing = process.env.OTEL_SEMCONV_STABILITY_OPT_IN;
  const opts = 'gen_ai_tool_definitions';
  process.env.OTEL_SEMCONV_STABILITY_OPT_IN = existing ? `${existing},${opts}` : opts;
}

import { NodeSDK } from '@opentelemetry/sdk-node';
import { OTLPMetricExporter } from '@opentelemetry/exporter-metrics-otlp-proto';
import { buildTraceProcessors } from './trace-exporters.js';
import { OTLPLogExporter } from '@opentelemetry/exporter-logs-otlp-proto';
import { getNodeAutoInstrumentations } from '@opentelemetry/auto-instrumentations-node';
import { PeriodicExportingMetricReader } from '@opentelemetry/sdk-metrics';
import { BatchLogRecordProcessor } from '@opentelemetry/sdk-logs';
import { resourceFromAttributes } from '@opentelemetry/resources';
import {
  ATTR_SERVICE_NAME,
  ATTR_SERVICE_VERSION,
} from '@opentelemetry/semantic-conventions';

const otelEnabled = process.env.OTEL_ENABLED === 'true';
const otlpEndpoint = process.env.OTEL_EXPORTER_OTLP_ENDPOINT;

/** Exported so NestJS shutdown hooks can flush pending telemetry. */
export let otelSdk: NodeSDK | undefined;

if (otelEnabled && otlpEndpoint) {
  // OTEL HTTP instrumentation adds listeners per-response; raise the default
  // limit to suppress the harmless MaxListenersExceededWarning from Node.js.
  EventEmitter.defaultMaxListeners = 20;

  const resource = resourceFromAttributes({
    [ATTR_SERVICE_NAME]: process.env.OTEL_SERVICE_NAME ?? 'skillspell-backend',
    [ATTR_SERVICE_VERSION]: process.env.npm_package_version ?? '0.0.1',
  });

  const lfBase = process.env.LANGFUSE_BASE_URL;
  const lfPublic = process.env.LANGFUSE_PUBLIC_KEY;
  const lfSecret = process.env.LANGFUSE_SECRET_KEY;
  const langfuse =
    lfBase && lfPublic && lfSecret
      ? {
          baseUrl: lfBase.replace(/\/$/, ''),
          publicKey: lfPublic,
          secretKey: lfSecret,
        }
      : undefined;

  otelSdk = new NodeSDK({
    resource,

    // ── Traces (fan-out: Aspire always; Langfuse for gen_ai spans when configured) ──
    spanProcessors: buildTraceProcessors(otlpEndpoint, langfuse),

    // ── Metrics ──
    metricReader: new PeriodicExportingMetricReader({
      exporter: new OTLPMetricExporter({ url: `${otlpEndpoint}/v1/metrics` }),
      exportIntervalMillis: 15_000,
    }),

    // ── Logs ──
    logRecordProcessors: [
      new BatchLogRecordProcessor(
        new OTLPLogExporter({ url: `${otlpEndpoint}/v1/logs` }),
      ),
    ],

    // ── Auto-instrumentation ──
    // Only enable instrumentations this project actually uses.
    // Disabling unused ones avoids unnecessary monkey-patching,
    // reduces memory overhead, and cuts span noise.
    instrumentations: [
      getNodeAutoInstrumentations({
        // ── Enabled (used by this project) ──
        // @opentelemetry/instrumentation-http       — inbound + outbound HTTP
        // @opentelemetry/instrumentation-express     — Express route spans
        // @opentelemetry/instrumentation-nestjs-core — NestJS handler/guard/pipe spans
        // @opentelemetry/instrumentation-pg          — PostgreSQL query spans
        // @opentelemetry/instrumentation-undici      — Node.js fetch() spans
        // @opentelemetry/instrumentation-runtime-node — event loop / GC metrics

        // ── Disabled (not used — avoids monkey-patching overhead + span noise) ──
        '@opentelemetry/instrumentation-fs': { enabled: false },
        '@opentelemetry/instrumentation-dns': { enabled: false },
        '@opentelemetry/instrumentation-net': { enabled: false },
        '@opentelemetry/instrumentation-grpc': { enabled: false },
        '@opentelemetry/instrumentation-aws-sdk': { enabled: false },
        '@opentelemetry/instrumentation-aws-lambda': { enabled: false },
        '@opentelemetry/instrumentation-mongodb': { enabled: false },
        '@opentelemetry/instrumentation-mongoose': { enabled: false },
        '@opentelemetry/instrumentation-redis': { enabled: false },
        '@opentelemetry/instrumentation-ioredis': { enabled: false },
        '@opentelemetry/instrumentation-graphql': { enabled: false },
        '@opentelemetry/instrumentation-mysql': { enabled: false },
        '@opentelemetry/instrumentation-mysql2': { enabled: false },
        '@opentelemetry/instrumentation-kafkajs': { enabled: false },
        '@opentelemetry/instrumentation-amqplib': { enabled: false },
        '@opentelemetry/instrumentation-dataloader': { enabled: false },
        '@opentelemetry/instrumentation-generic-pool': { enabled: false },
        '@opentelemetry/instrumentation-connect': { enabled: false },
        '@opentelemetry/instrumentation-hapi': { enabled: false },
        '@opentelemetry/instrumentation-koa': { enabled: false },
        '@opentelemetry/instrumentation-restify': { enabled: false },
        '@opentelemetry/instrumentation-router': { enabled: false },
        '@opentelemetry/instrumentation-memcached': { enabled: false },
        '@opentelemetry/instrumentation-socket.io': { enabled: false },
        '@opentelemetry/instrumentation-tedious': { enabled: false },
        '@opentelemetry/instrumentation-oracledb': { enabled: false },
        '@opentelemetry/instrumentation-knex': { enabled: false },
        '@opentelemetry/instrumentation-cassandra-driver': { enabled: false },
        '@opentelemetry/instrumentation-lru-memoizer': { enabled: false },
        '@opentelemetry/instrumentation-bunyan': { enabled: false },
        '@opentelemetry/instrumentation-pino': { enabled: false },
        '@opentelemetry/instrumentation-winston': { enabled: false },
        '@opentelemetry/instrumentation-cucumber': { enabled: false },
        '@opentelemetry/instrumentation-openai': { enabled: false },
      }),
    ],
  });

  otelSdk.start();

  // NOTE: No manual SIGTERM/SIGINT handlers here.
  // NestJS's enableShutdownHooks() handles process signals, and the
  // OtelShutdownService (registered in AppModule) calls sdk.shutdown()
  // via the OnApplicationShutdown lifecycle hook. This avoids a race
  // condition between NestJS's and our own signal handlers.

  // eslint-disable-next-line no-console
  console.log(`📡 OpenTelemetry enabled → ${otlpEndpoint}${langfuse ? ' (+ Langfuse LLM tracing)' : ''}`);
} else if (!otelEnabled) {
  // eslint-disable-next-line no-console
  console.log('📡 OpenTelemetry disabled (OTEL_ENABLED !== true)');
} else {
  // eslint-disable-next-line no-console
  console.log('📡 OpenTelemetry disabled (OTEL_EXPORTER_OTLP_ENDPOINT not set)');
}
