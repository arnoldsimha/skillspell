import { formatError } from '../../common/utils/format-error.js';
import {
  CanActivate,
  ExecutionContext,
  HttpException,
  HttpStatus,
  Inject,
  Injectable,
  Logger,
} from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import { CACHE_MANAGER, type Cache } from '@nestjs/cache-manager';
import { IS_SETUP_ROUTE_KEY } from '../decorators/setup-route.decorator.js';
import {
  AUTH_TOKEN_REPOSITORY,
  type IAuthTokenRepository,
} from '@skillspell/shared';

/**
 * Global guard that blocks application usage until first-run setup is complete.
 *
 * Applied globally via APP_GUARD. When setup is not complete:
 * - Routes decorated with {@link SetupRoute} are always allowed through
 * - All other routes return 503 Service Unavailable directing the user
 *   to complete setup
 *
 * The setup-complete flag is stored in Redis (CACHE_MANAGER) so all replicas
 * share the same state. The previous in-process boolean was instance-local and could
 * produce split-brain in multi-replica Kubernetes deployments. Redis TTL is set to 0
 * (permanent) once setup is complete — the flag never expires because setup is a
 * one-time operation. A short-lived in-process cache (5 s) is retained for the
 * "pending" state to avoid hammering Redis on every unauthenticated request.
 */
@Injectable()
export class SetupGuard implements CanActivate {
  private readonly logger = new Logger(SetupGuard.name);

  /** Redis key for the cross-replica setup-complete flag. */
  private static readonly SETUP_COMPLETE_KEY = 'setup:complete';

  /**
   * In-process fast-path for the "pending" case — avoids a Redis round-trip on
   * every request while setup is still in progress. Cleared by signalSetupComplete().
   */
  private pendingCachedUntil = 0;
  private static readonly PENDING_CACHE_TTL_MS = 5_000;

  constructor(
    private readonly reflector: Reflector,
    @Inject(AUTH_TOKEN_REPOSITORY)
    private readonly authTokenRepo: IAuthTokenRepository,
    @Inject(CACHE_MANAGER)
    private readonly cacheManager: Cache,
  ) {}

  async canActivate(context: ExecutionContext): Promise<boolean> {
    // Fast-path: check Redis flag (shared across all replicas)
    const redisFlag = await this.cacheManager.get<boolean>(SetupGuard.SETUP_COMPLETE_KEY);
    if (redisFlag === true) {
      return true;
    }

    // Routes decorated with @SetupRoute() are always allowed through
    const isSetupRoute = this.reflector.getAllAndOverride<boolean>(
      IS_SETUP_ROUTE_KEY,
      [context.getHandler(), context.getClass()],
    );
    if (isSetupRoute) return true;

    // Avoid hammering the DB while setup is pending — reuse the last
    // negative result for up to PENDING_CACHE_TTL_MS.
    const now = Date.now();
    if (now < this.pendingCachedUntil) {
      throw this.setupRequiredException();
    }

    // Check setup state from DB
    try {
      const state = await this.authTokenRepo.getSetupState();
      if (state?.setupComplete) {
        // Persist the flag to Redis so all replicas benefit immediately
        await this.cacheManager.set(SetupGuard.SETUP_COMPLETE_KEY, true, 0);
        return true;
      }
      this.pendingCachedUntil = now + SetupGuard.PENDING_CACHE_TTL_MS;
    } catch (error) {
      // If the auth table doesn't exist yet, setup is definitely not complete
      this.logger.warn(
        `Failed to check setup state: ${formatError(error)}`,
      );
      this.pendingCachedUntil = now + SetupGuard.PENDING_CACHE_TTL_MS;
    }

    // Setup not complete — block all non-setup routes.
    throw this.setupRequiredException();
  }

  /**
   * Immediately mark setup as complete in Redis so all replicas see it.
   * Called by AuthController after a successful setup() so the guard
   * stops blocking normal requests without waiting for the next DB check.
   */
  async signalSetupComplete(): Promise<void> {
    await this.cacheManager.set(SetupGuard.SETUP_COMPLETE_KEY, true, 0);
    // Also clear the in-process pending cache to avoid a 5-second lag on this replica
    this.pendingCachedUntil = 0;
  }

  /** Build the 503 response that directs the client to complete setup. */
  private setupRequiredException(): HttpException {
    return new HttpException(
      {
        statusCode: HttpStatus.SERVICE_UNAVAILABLE,
        errorCode: 'SETUP_REQUIRED',
        message: 'Initial setup has not been completed. Please run the setup wizard.',
        error: 'Setup Required',
      },
      HttpStatus.SERVICE_UNAVAILABLE,
    );
  }
}
