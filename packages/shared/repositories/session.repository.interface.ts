import type { SessionMessage } from '@skillspell/shared';

export const SESSION_REPOSITORY = Symbol('SESSION_REPOSITORY');

export interface ISessionRepository {
  /** Get all messages for a skill session, ordered by sequence ascending. */
  getMessages(skillId: string): Promise<SessionMessage[]>;

  /** Append messages to a skill session. */
  appendMessages(
    skillId: string,
    messages: Array<{ role: 'user' | 'assistant'; content: string }>,
  ): Promise<void>;

  /**
   * Atomically append a message and evict the oldest if the count
   * would exceed `maxMessages`. The delete + put are all-or-nothing.
   */
  appendWithEviction(
    skillId: string,
    message: { role: 'user' | 'assistant'; content: string },
    maxMessages: number,
  ): Promise<void>;

  /** Delete oldest messages to enforce max message count. */
  trimToMaxMessages(skillId: string, maxMessages: number): Promise<void>;

  /** Delete all session messages for a skill. */
  deleteSession(skillId: string): Promise<void>;

  /** Get current message count for a skill session. */
  getMessageCount(skillId: string): Promise<number>;
}
