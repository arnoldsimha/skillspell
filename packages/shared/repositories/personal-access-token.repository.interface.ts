import type { PersonalAccessToken } from '@skillspell/shared';

export const PAT_REPOSITORY = Symbol('PAT_REPOSITORY');

/**
 * Repository interface for personal access token operations.
 *
 * PATs are long-lived credentials used by the CLI for authentication.
 * Only the SHA-256 hash is stored — the raw token is never persisted.
 */
export interface IPersonalAccessTokenRepository {
  /** Create a new personal access token record. Returns the saved PAT. */
  create(pat: PersonalAccessToken): Promise<PersonalAccessToken>;
  /** Find a PAT by its SHA-256 token hash. Returns null if not found. */
  findByTokenHash(tokenHash: string): Promise<PersonalAccessToken | null>;
  /** List all PATs for a user (both active and revoked). */
  findByUserId(userId: string): Promise<PersonalAccessToken[]>;
  /** Find a PAT by its UUID. Returns null if not found. */
  findById(id: string): Promise<PersonalAccessToken | null>;
  /**
   * Mark a PAT as revoked by setting revokedAt to the current timestamp.
   * Verifies that the PAT belongs to userId before revoking (IDOR prevention — T-3-04).
   * Throws NotFoundException if the PAT does not exist or does not belong to userId.
   */
  revoke(id: string, userId: string): Promise<void>;
  /**
   * Update lastUsedAt to now. Called non-blocking after successful PAT authentication.
   * Should not throw — errors are caught and logged by the caller (D-06).
   */
  updateLastUsedAt(id: string): Promise<void>;
}
