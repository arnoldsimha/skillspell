import { Inject, Injectable, Logger, OnModuleInit, OnModuleDestroy } from '@nestjs/common';
import { JwtService } from '@nestjs/jwt';
import { ConfigService } from '@nestjs/config';
import { createHash, randomUUID } from 'node:crypto';
import {
  AUTH_TOKEN_REPOSITORY,
  type IAuthTokenRepository,
  type User,
  type JwtPayload,
  type RefreshToken,
} from '@skillspell/shared';
import type { AppConfig } from '../config/configuration.js';
import { calculateExpiry } from './cookie.utils.js';

/**
 * Token generation and management service.
 *
 * Handles JWT access token creation, refresh token generation/rotation,
 * and token hash operations.
 */
/** Run cleanup every 6 hours (in ms). */
const TOKEN_CLEANUP_INTERVAL_MS = 6 * 60 * 60 * 1000;

@Injectable()
export class TokenService implements OnModuleInit, OnModuleDestroy {
  private readonly logger = new Logger(TokenService.name);
  private readonly refreshTokenExpiry: string;
  private cleanupTimer?: ReturnType<typeof setInterval>;
  private startupTimer?: ReturnType<typeof setTimeout>;

  constructor(
    private readonly jwtService: JwtService,
    private readonly configService: ConfigService<AppConfig, true>,
    @Inject(AUTH_TOKEN_REPOSITORY)
    private readonly authTokenRepo: IAuthTokenRepository,
  ) {
    this.refreshTokenExpiry = this.configService.get('auth.refreshTokenExpiry', {
      infer: true,
    });
  }

  /**
   * Start periodic cleanup of expired/revoked refresh tokens.
   * Uses setInterval instead of @nestjs/schedule to avoid adding a dependency.
   * Runs every 6 hours; multiple instances may run simultaneously but
   * DELETE on already-deleted rows is idempotent.
   */
  onModuleInit(): void {
    this.cleanupTimer = setInterval(() => {
      this.cleanupExpiredTokens().catch((err) =>
        this.logger.warn(`Token cleanup failed: ${err}`),
      );
    }, TOKEN_CLEANUP_INTERVAL_MS);

    // Also run once on startup (after a 30s delay to let the app settle)
    this.startupTimer = setTimeout(() => {
      this.startupTimer = undefined;
      this.cleanupExpiredTokens().catch((err) =>
        this.logger.warn(`Initial token cleanup failed: ${err}`),
      );
    }, 30_000);
  }

  onModuleDestroy(): void {
    if (this.cleanupTimer) {
      clearInterval(this.cleanupTimer);
    }
    if (this.startupTimer) {
      clearTimeout(this.startupTimer);
    }
  }

  /**
   * Delete all expired/revoked refresh tokens globally.
   */
  private async cleanupExpiredTokens(): Promise<void> {
    const deleted = await this.authTokenRepo.deleteAllExpiredTokens();
    if (deleted > 0) {
      this.logger.log(`Cleaned up ${deleted} expired/revoked refresh tokens`);
    }
  }

  /**
   * Generate an access token + refresh token pair for a user.
   */
  async generateTokenPair(
    user: User,
    deviceInfo?: string,
  ): Promise<{ accessToken: string; refreshToken: string }> {
    const accessToken = this.generateAccessToken(user);
    const refreshToken = await this.generateRefreshToken(user.id, deviceInfo);
    return { accessToken, refreshToken };
  }

  /**
   * Generate a short-lived JWT access token.
   */
  generateAccessToken(user: User): string {
    const payload: Omit<JwtPayload, 'iat' | 'exp'> = {
      sub: user.id,
      email: user.email,
      role: user.role,
      firstName: user.firstName,
      lastName: user.lastName,
    };

    return this.jwtService.sign(payload);
  }

  /**
   * Generate a long-lived refresh token and persist its hash in the DB.
   */
  async generateRefreshToken(
    userId: string,
    deviceInfo?: string,
  ): Promise<string> {
    const tokenId = randomUUID();
    const rawToken = `${tokenId}.${randomUUID()}`;
    const tokenHash = this.hashToken(rawToken);

    const expiresAt = calculateExpiry(this.refreshTokenExpiry);

    const record: RefreshToken = {
      id: tokenId,
      userId,
      tokenHash,
      deviceInfo,
      expiresAt: expiresAt.toISOString(),
      createdAt: new Date().toISOString(),
      revoked: false,
    };

    await this.authTokenRepo.saveRefreshToken(record);
    return rawToken;
  }

  /**
   * Rotate a refresh token for a known user.
   * Returns only the new refresh token — the caller is responsible for
   * generating the access token after looking up the user.
   */
  async rotateRefreshTokenForUser(
    rawRefreshToken: string,
    userId: string,
    deviceInfo?: string,
  ): Promise<string | null> {
    const tokenId = rawRefreshToken.split('.')[0];
    if (!tokenId) return null;

    const tokenHash = this.hashToken(rawRefreshToken);

    // Find the token in the DB
    const record = await this.authTokenRepo.findRefreshToken(tokenId, userId);
    if (!record) {
      this.logger.warn(`Refresh token ${tokenId} not found for user ${userId}`);
      return null;
    }

    // Verify hash matches
    if (record.tokenHash !== tokenHash) {
      this.logger.warn(`Token hash mismatch for token ${tokenId}`);
      // Possible token theft — revoke all tokens for this user
      await this.authTokenRepo.revokeAllRefreshTokens(userId);
      return null;
    }

    // Check if revoked
    if (record.revoked) {
      this.logger.warn(`Revoked token ${tokenId} reused — possible theft`);
      await this.authTokenRepo.revokeAllRefreshTokens(userId);
      return null;
    }

    // Check if expired
    if (new Date(record.expiresAt) < new Date()) {
      this.logger.warn(`Expired refresh token ${tokenId}`);
      return null;
    }

    // Revoke the old token
    await this.authTokenRepo.revokeRefreshToken(tokenId, userId);

    // Generate and return the new refresh token
    return this.generateRefreshToken(userId, deviceInfo);
  }

  /**
   * Revoke a specific refresh token.
   */
  async revokeRefreshToken(tokenId: string, userId: string): Promise<void> {
    await this.authTokenRepo.revokeRefreshToken(tokenId, userId);
  }

  /**
   * Revoke all refresh tokens for a user (e.g. on password change or logout-all).
   */
  async revokeAllRefreshTokens(userId: string): Promise<void> {
    await this.authTokenRepo.revokeAllRefreshTokens(userId);
  }

  /**
   * Decode a JWT token without verifying expiration.
   * Used to extract userId from an expired access token during refresh.
   */
  decodeTokenIgnoringExpiry(token: string): JwtPayload | null {
    try {
      // Verify signature but ignore expiration
      return this.jwtService.verify<JwtPayload>(token, {
        ignoreExpiration: true,
      });
    } catch {
      return null;
    }
  }

  /**
   * SHA-256 hash a token for storage.
   */
  hashToken(token: string): string {
    return createHash('sha256').update(token).digest('hex');
  }

}
