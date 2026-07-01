import { Inject, Injectable, Logger } from '@nestjs/common';
import { CACHE_MANAGER, type Cache } from '@nestjs/cache-manager';
import { USER_REPOSITORY, type IUserRepository } from '@skillspell/shared';
import { TokenService } from './token.service.js';

/**
 * Entry stored for each CLI one-time code.
 * expiresAt here is the code TTL (60s from issue), not the access token expiry.
 */
export interface CliCodeEntry {
  userId: string;
  email: string;
  accessToken: string;
  refreshToken: string;
  expiresAt: number; // epoch ms — when the CODE expires (60s TTL), not the access token
}

/**
 * CLI authentication service.
 *
 * Manages the in-memory one-time code store used during the SSO CLI flow.
 * Codes are single-use and expire after 60 seconds.
 *
 * Redis-backed store — codes survive pod restarts and are consistent across replicas (AUTH-01).
 * Codes are single-use and expire after CODE_TTL_MS via Redis TTL.
 */
@Injectable()
export class CliAuthService {
  private readonly logger = new Logger(CliAuthService.name);
  readonly CODE_TTL_MS = 60_000; // 60 seconds

  constructor(
    private readonly tokenService: TokenService,
    @Inject(USER_REPOSITORY)
    private readonly userRepo: IUserRepository,
    @Inject(CACHE_MANAGER) private readonly cacheManager: Cache,
  ) {}

  /**
   * Store a one-time code with its associated token pair.
   * Auto-deletes after CODE_TTL_MS via Redis TTL — no setTimeout required.
   */
  async storeCliCode(code: string, entry: CliCodeEntry): Promise<void> {
    await this.cacheManager.set(`cli:code:${code}`, entry, this.CODE_TTL_MS);
    this.logger.debug(`CLI code stored (TTL: ${this.CODE_TTL_MS}ms)`);
  }

  /**
   * Consume a one-time code. Single-use: deleted on first successful retrieval.
   * Returns null if code not found, already used, or TTL expired.
   */
  async consumeCliCode(code: string): Promise<CliCodeEntry | null> {
    const entry = await this.cacheManager.get<CliCodeEntry>(`cli:code:${code}`);
    if (!entry) {
      this.logger.debug('CLI code not found — already used or expired');
      return null;
    }
    // Single-use: delete immediately before returning
    await this.cacheManager.del(`cli:code:${code}`);
    // Belt-and-suspenders: check expiresAt even though Redis TTL handles expiry
    if (Date.now() > entry.expiresAt) {
      this.logger.debug('CLI code expired (expiresAt exceeded)');
      return null;
    }
    this.logger.debug('CLI code consumed successfully');
    return entry;
  }

  /**
   * Rotate a CLI refresh token and return a new access + refresh token pair.
   * Returns null if the refresh token is invalid, expired, revoked, or the user
   * no longer exists / is inactive.
   *
   * Called by the POST /api/auth/cli/refresh endpoint.
   * userId is required by rotateRefreshTokenForUser (compound key lookup in DB).
   * The access token is generated from DB ground truth — caller-supplied email
   * is intentionally ignored to prevent JWT claim poisoning.
   */
  async refreshCliToken(
    rawRefreshToken: string,
    userId: string,
  ): Promise<{ accessToken: string; refreshToken: string } | null> {
    // Check user liveness BEFORE rotating to avoid revoking a valid token
    // for a user that no longer exists or has been deactivated.
    const user = await this.userRepo.findById(userId);
    if (!user || !user.isActive) {
      this.logger.warn(`CLI refresh: user ${userId} not found or inactive — refusing rotation`);
      return null;
    }

    const newRefreshToken = await this.tokenService.rotateRefreshTokenForUser(
      rawRefreshToken,
      userId,
      'SkillSpell CLI',
    );

    if (!newRefreshToken) {
      this.logger.debug(`CLI refresh token rotation failed for user ${userId}`);
      return null;
    }

    // Use DB user for ground-truth claims — never trust caller-supplied identity.
    const newAccessToken = this.tokenService.generateAccessToken(user);
    return { accessToken: newAccessToken, refreshToken: newRefreshToken };
  }
}
