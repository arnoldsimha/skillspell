import type {
  RefreshToken,
  SsoLink,
  SetupState,
} from '@skillspell/shared';

export const AUTH_TOKEN_REPOSITORY = Symbol('AUTH_TOKEN_REPOSITORY');

/**
 * Repository interface for refresh tokens, SSO links, and setup state.
 */
export interface IAuthTokenRepository {
  // ─── Refresh Tokens ─────────────────────────────────────────────────

  /** Save a new refresh token. */
  saveRefreshToken(token: RefreshToken): Promise<void>;
  /** Find a refresh token by its ID and user ID. */
  findRefreshToken(tokenId: string, userId: string): Promise<RefreshToken | null>;
  /**
   * Find a refresh token by tokenId alone — used during the refresh flow when the
   * access token (and therefore userId) is unavailable (CR-05). The returned record
   * includes userId so the caller can then perform the full compound validation.
   */
  findRefreshTokenByTokenId(tokenId: string): Promise<RefreshToken | null>;
  /** Mark a single refresh token as revoked. */
  revokeRefreshToken(tokenId: string, userId: string): Promise<void>;
  /** Revoke all refresh tokens for a user (e.g. on password change). */
  revokeAllRefreshTokens(userId: string): Promise<void>;
  /** Delete expired/revoked tokens for a user (housekeeping). */
  cleanupExpiredTokens(userId: string): Promise<void>;
  /** Delete all expired/revoked tokens globally (Finding 22: periodic cleanup). Returns count deleted. */
  deleteAllExpiredTokens(): Promise<number>;

  // ─── SSO Links ──────────────────────────────────────────────────────

  /** Save an SSO link. */
  saveSsoLink(link: SsoLink): Promise<void>;
  /** Find a user's SSO link by provider + provider user ID. */
  findBySsoProvider(provider: string, providerUserId: string): Promise<SsoLink | null>;
  /** List all SSO links for a user. */
  getSsoLinks(userId: string): Promise<SsoLink[]>;
  /** Remove an SSO link. */
  removeSsoLink(userId: string, provider: string, providerUserId: string): Promise<void>;

  // ─── Setup State ────────────────────────────────────────────────────

  /** Get the system setup state. */
  getSetupState(): Promise<SetupState | null>;
  /** Save the setup state (with condition to prevent overwrite). */
  saveSetupState(state: SetupState): Promise<void>;

}
