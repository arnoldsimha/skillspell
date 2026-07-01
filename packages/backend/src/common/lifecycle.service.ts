import { Injectable, Logger, type OnApplicationShutdown } from '@nestjs/common';

/**
 * Tracks process lifecycle state for graceful shutdown.
 *
 * On SIGTERM (k8s pod recycle) NestJS calls onApplicationShutdown; we flip
 * `isShuttingDown` so the readiness probe (`GET /api/ready`) starts reporting
 * not-ready. k8s then removes the pod from the Service endpoints, draining new
 * traffic away while in-flight work is notified+aborted (see StreamGateway).
 *
 * Liveness (`GET /api/health`) intentionally stays healthy during drain so k8s
 * does not kill the pod before it finishes shutting down.
 */
@Injectable()
export class LifecycleService implements OnApplicationShutdown {
  private readonly logger = new Logger(LifecycleService.name);
  private shuttingDown = false;

  get isShuttingDown(): boolean {
    return this.shuttingDown;
  }

  onApplicationShutdown(signal?: string): void {
    this.shuttingDown = true;
    this.logger.log(
      `Shutdown (${signal ?? 'signal'}) — readiness now reports not-ready (draining)`,
    );
  }
}
