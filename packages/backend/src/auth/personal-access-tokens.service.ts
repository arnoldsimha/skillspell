import { BadRequestException, Inject, Injectable, NotFoundException, UnauthorizedException } from '@nestjs/common';
import { randomBytes } from 'node:crypto';
import { v4 as uuidv4 } from 'uuid';
import {
  PAT_REPOSITORY,
  type IPersonalAccessTokenRepository,
  type PersonalAccessToken,
} from '@skillspell/shared';
import { TokenService } from './token.service.js';
import { CreatePatDto } from './dto/create-pat.dto.js';

/**
 * PAT list item — omits tokenHash to prevent hash exposure in list responses.
 * tokenHash is an internal lookup key and must never be returned to clients.
 */
export type PatListItem = Omit<PersonalAccessToken, 'tokenHash'>;

/**
 * Response type for token creation.
 * Extends PatListItem (which already omits tokenHash) and adds rawToken.
 * tokenHash is never returned to clients — not even at creation.
 */
export interface CreatePatResponse extends PatListItem {
  /** Raw token — returned once only at creation. Never stored. */
  rawToken: string;
}

/**
 * PAT CRUD service.
 *
 * Handles creation, listing, revocation,
 * and validation (used by PatValidationService in Plan 05).
 *
 * Security: raw tokens are NEVER stored — only their SHA-256 hash.
 * The raw token is returned once at creation.
 */
@Injectable()
export class PersonalAccessTokensService {
  constructor(
    @Inject(PAT_REPOSITORY)
    private readonly patRepo: IPersonalAccessTokenRepository,
    private readonly tokenService: TokenService,
  ) {}

  /**
   * Create a personal access token.
   *
   * Generates a raw token (sksp_ prefix + 24 random bytes base64url),
   * stores only the SHA-256 hash, and returns the raw token once.
   */
  async create(userId: string, dto: CreatePatDto): Promise<CreatePatResponse> {
    const expiresAt = new Date(dto.expiresAt);
    const now = new Date();
    if (expiresAt <= now) {
      throw new BadRequestException('expiresAt must be in the future');
    }
    const maxExpiry = new Date(now.getTime() + 365 * 24 * 60 * 60 * 1000);
    if (expiresAt > maxExpiry) {
      throw new BadRequestException('expiresAt cannot exceed 1 year from now');
    }

    const rawToken = 'sksp_' + randomBytes(24).toString('base64url');
    const prefix = rawToken.slice(5, 13); // 8 display chars after 'sksp_'
    const tokenHash = this.tokenService.hashToken(rawToken);

    const patData: PersonalAccessToken = {
      id: uuidv4(),
      userId,
      name: dto.name,
      prefix,
      tokenHash,
      expiresAt: dto.expiresAt,
      revokedAt: null,
      lastUsedAt: null,
      createdAt: new Date().toISOString(),
    };

    const saved = await this.patRepo.create(patData);

    // Strip tokenHash from create response — never expose the hash to clients
    const { tokenHash: _hash, ...safeFields } = saved;
    return { ...safeFields, rawToken };
  }

  /**
   * List personal access tokens for a user.
   * Strips tokenHash from each record before returning.
   */
  async list(userId: string): Promise<PatListItem[]> {
    const pats = await this.patRepo.findByUserId(userId);
    return pats.map(({ tokenHash: _hash, ...rest }) => rest);
  }

  /**
   * Revoke a personal access token.
   * Repository enforces IDOR check (WHERE id AND userId).
   */
  async revoke(id: string, userId: string): Promise<void> {
    await this.patRepo.revoke(id, userId);
  }

  /**
   * Validate a raw PAT token.
   * Hashes the token, looks up by hash, checks revoked/expired status.
   * Throws UnauthorizedException for invalid, revoked, or expired tokens.
   * Returns the PAT record on success — caller is responsible for lastUsedAt update.
   *
   * Called by PatStrategy (Plan 05).
   */
  async validatePat(rawToken: string): Promise<PersonalAccessToken> {
    const tokenHash = this.tokenService.hashToken(rawToken);
    const pat = await this.patRepo.findByTokenHash(tokenHash);

    if (!pat) {
      throw new UnauthorizedException('Invalid personal access token');
    }
    if (pat.revokedAt !== null) {
      throw new UnauthorizedException('Personal access token has been revoked');
    }
    if (new Date(pat.expiresAt) < new Date()) {
      throw new UnauthorizedException('Personal access token has expired');
    }

    return pat;
  }

  /**
   * Update lastUsedAt for a PAT (fire-and-forget — never throws).
   * Called by PatStrategy after successful authentication.
   */
  async updateLastUsedAt(patId: string): Promise<void> {
    await this.patRepo.updateLastUsedAt(patId);
  }
}
