import type { InviteToken } from '@skillspell/shared';

export const INVITE_TOKEN_REPOSITORY = Symbol('INVITE_TOKEN_REPOSITORY');

/**
 * Repository interface for invite token operations.
 */
export interface IInviteTokenRepository {
  /** Create a new invite token record. */
  create(invite: InviteToken): Promise<InviteToken>;
  /** Find an invite by its token hash. Returns null if not found. */
  findByTokenHash(tokenHash: string): Promise<InviteToken | null>;
  /** Find pending (unconsumed, unexpired) invites for an email. */
  findPendingByEmail(email: string): Promise<InviteToken[]>;
  /** Mark an invite as consumed. Pass null for userId when revoking/resending. */
  consume(id: string, userId: string | null): Promise<void>;
  /**
   * Atomically consume an existing invite and create its replacement.
   *
   * Both operations run inside a single database transaction so concurrent
   * requests cannot interleave (e.g. two resend clicks consuming the same
   * invite and creating duplicate replacements).
   */
  consumeAndReplace(
    consumeId: string,
    replacement: InviteToken,
  ): Promise<InviteToken>;
  /** List all invites for an organization. */
  findByOrg(orgId: string): Promise<InviteToken[]>;
}
