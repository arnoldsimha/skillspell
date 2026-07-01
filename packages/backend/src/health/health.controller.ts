import { Controller, Get, Inject, Injectable, ServiceUnavailableException } from '@nestjs/common';
import { HealthCheck, HealthCheckService, HealthIndicatorService, TypeOrmHealthIndicator } from '@nestjs/terminus';
import { CACHE_MANAGER, type Cache } from '@nestjs/cache-manager';
import { SkipThrottle } from '@nestjs/throttler';
import { Public } from '../auth/decorators/public.decorator.js';
import { SetupRoute } from '../auth/decorators/setup-route.decorator.js';
import { LifecycleService } from '../common/lifecycle.service.js';

/**
 * Custom Redis health indicator — uses HealthIndicatorService (terminus v11 API).
 *
 * Performs a cache round-trip via CACHE_MANAGER to verify Redis is reachable.
 */
@Injectable()
class RedisHealthIndicator {
  constructor(
    @Inject(CACHE_MANAGER) private readonly cacheManager: Cache,
    private readonly healthIndicatorService: HealthIndicatorService,
  ) {}

  async isHealthy(key: string) {
    const indicator = this.healthIndicatorService.check(key);
    try {
      await this.cacheManager.get('__healthcheck__');
      return indicator.up();
    } catch (error) {
      return indicator.down((error as Error).message);
    }
  }
}

/**
 * Health check controller — exposes GET /api/health.
 *
 * Reports Redis and PostgreSQL connection status via @nestjs/terminus.
 * Remains public (@Public) and accessible during first-run setup (@SetupRoute).
 *
 * Response shape (terminus standard):
 * {
 *   "status": "ok" | "error",
 *   "info": { "redis": { "status": "up" }, "database": { "status": "up" } },
 *   "error": {},
 *   "details": { "redis": { "status": "up" }, "database": { "status": "up" } }
 * }
 */
@SkipThrottle({ short: true, medium: true, long: true })
@Controller()
export class HealthController {
  constructor(
    private readonly health: HealthCheckService,
    private readonly db: TypeOrmHealthIndicator,
    private readonly redisHealth: RedisHealthIndicator,
    private readonly lifecycle: LifecycleService,
  ) {}

  /**
   * Liveness probe. Reports dependency health. Stays healthy during graceful
   * shutdown so k8s does not kill the pod before it finishes draining.
   */
  @SetupRoute()
  @Public()
  @Get('health')
  @HealthCheck()
  check() {
    return this.health.check([
      () => this.redisHealth.isHealthy('redis'),
      () => this.db.pingCheck('database'),
    ]);
  }

  /**
   * Readiness probe. Returns 503 once SIGTERM has been received so k8s removes
   * the pod from the Service endpoints and drains new traffic away while
   * in-flight work is notified+aborted. Otherwise reports dependency health.
   */
  @SetupRoute()
  @Public()
  @Get('ready')
  @HealthCheck()
  ready() {
    if (this.lifecycle.isShuttingDown) {
      throw new ServiceUnavailableException('Draining — shutting down');
    }
    return this.health.check([
      () => this.redisHealth.isHealthy('redis'),
      () => this.db.pingCheck('database'),
    ]);
  }
}

export { RedisHealthIndicator };
