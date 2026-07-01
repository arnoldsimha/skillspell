import { Injectable, Logger, OnApplicationShutdown } from '@nestjs/common';
import { otelSdk } from './tracing.js';

/**
 * NestJS lifecycle-aware OTEL shutdown.
 *
 * Instead of registering raw SIGTERM/SIGINT handlers (which race with
 * NestJS's own shutdown hooks), this provider implements OnApplicationShutdown
 * so the OTEL SDK is flushed as part of NestJS's orderly teardown:
 *
 *   SIGTERM → NestJS enableShutdownHooks() → onApplicationShutdown()
 *     → sdk.shutdown() (flushes buffered traces/metrics/logs)
 *     → process exits
 */
@Injectable()
export class OtelShutdownService implements OnApplicationShutdown {
  private readonly logger = new Logger(OtelShutdownService.name);

  async onApplicationShutdown(): Promise<void> {
    if (otelSdk) {
      this.logger.log('Flushing OpenTelemetry before shutdown…');
      await otelSdk.shutdown();
      this.logger.log('OpenTelemetry shutdown complete');
    }
  }
}
