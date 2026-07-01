import { Inject, Injectable, Logger, UnauthorizedException } from '@nestjs/common';
import { PassportStrategy } from '@nestjs/passport';
import { Strategy as BaseStrategy } from 'passport-strategy';
import type { Request } from 'express';
import {
  USER_REPOSITORY,
  type IUserRepository,
  type User,
} from '@skillspell/shared';
import { PersonalAccessTokensService } from '../personal-access-tokens.service.js';

/**
 * Minimal inline Passport strategy base class for raw-token Bearer validation.
 *
 * Equivalent to passport-custom without the npm dependency.
 * passport-strategy is a transitive dep of passport — no new packages needed.
 *
 * Implements the Passport strategy interface:
 * - authenticate(req): entry point called by Passport
 * - success(user, info?): call to set req.user and proceed
 * - fail(challenge, status?): call to deny the request
 * - error(err): call to propagate an unexpected error
 */
class PatPassportStrategy extends (BaseStrategy as any) {
  name = 'pat';
  private readonly _verify: (
    req: Request,
    done: (err: any, user?: any, info?: any) => void,
  ) => void;

  constructor(
    verify: (req: Request, done: (err: any, user?: any, info?: any) => void) => void,
  ) {
    super();
    this._verify = verify;
  }

  authenticate(req: Request): void {
    this._verify(req, (err, user, info) => {
      if (err) return this.error(err);
      if (!user) return this.fail(info || { message: 'Invalid PAT' }, 401);
      this.success(user, info);
    });
  }
}

/**
 * Passport 'pat' strategy for Personal Access Token authentication.
 *
 * Registered in AuthModule providers. JwtAuthGuard uses AuthGuard(['jwt', 'pat'])
 * so Passport tries 'jwt' first; if the token starts with 'sksp_', JWT verification
 * fails and Passport falls through to this strategy.
 *
 * This is the mandated Passport multi-strategy approach.
 * lastUsedAt update is fire-and-forget — never blocks the request.
 * Expired and revoked tokens are rejected with UnauthorizedException.
 */
@Injectable()
export class PatStrategy extends PassportStrategy(PatPassportStrategy, 'pat') {
  private readonly logger = new Logger(PatStrategy.name);

  constructor(
    private readonly patService: PersonalAccessTokensService,
    @Inject(USER_REPOSITORY)
    private readonly userRepo: IUserRepository,
  ) {
    super();
  }

  /**
   * Validate the incoming request for a PAT Bearer token.
   *
   * Returns null if the token is not a PAT (doesn't start with 'sksp_') — Passport
   * treats null/false as strategy failure and moves on to the next strategy or 401.
   *
   * Returns the authenticated User if the PAT is valid.
   *
   * Throws UnauthorizedException if:
   * - The token IS a PAT but is not found in the DB
   * - The token is revoked (revokedAt IS NOT NULL)
   * - The token is expired (expiresAt < now)
   * - The user associated with the PAT is not found or is deactivated
   */
  async validate(req: Request): Promise<User | null> {
    const authHeader = req.headers['authorization'];
    const rawToken =
      typeof authHeader === 'string' && authHeader.startsWith('Bearer ')
        ? authHeader.slice(7)
        : null;

    if (!rawToken?.startsWith('sksp_')) {
      // Not a PAT — Passport will fail this strategy cleanly
      return null;
    }

    // validatePat() hashes the token, looks it up, and throws UnauthorizedException
    // if not found, expired (expiresAt < now), or revoked (revokedAt IS NOT NULL).
    const pat = await this.patService.validatePat(rawToken);

    const user = await this.userRepo.findById(pat.userId);
    if (!user) {
      throw new UnauthorizedException('User associated with token not found');
    }

    if (!user.isActive) {
      throw new UnauthorizedException('Account is deactivated');
    }

    // Fire-and-forget lastUsedAt update — do NOT await
    // Never reject the request if this update fails.
    this.patService.updateLastUsedAt(pat.id)
      .catch(err => this.logger.warn(`lastUsedAt update failed for PAT ${pat.id}: ${err}`));

    // Mark the request so JwtAuthGuard can enforce PAT scope restrictions.
    // PATs are restricted to /api/public/* routes only (PAT scope enforcement).
    (req as any)._patAuthenticated = true;

    return user;
  }
}
