import type { UserCredential } from '@skillspell/shared';

export const CREDENTIAL_REPOSITORY = Symbol('CREDENTIAL_REPOSITORY');

/**
 * Repository interface for password credential operations.
 */
export interface ICredentialRepository {
  /** Save a credential record. */
  saveCredential(credential: UserCredential): Promise<void>;
  /** Get the local credential for a user. */
  getCredential(userId: string): Promise<UserCredential | null>;
  /** Update specific fields on a credential (e.g. password hash, failed attempts). */
  updateCredential(
    userId: string,
    data: Partial<Pick<UserCredential, 'passwordHash' | 'mustChangePassword' | 'failedAttempts' | 'lockedUntil'>>,
  ): Promise<void>;
}
