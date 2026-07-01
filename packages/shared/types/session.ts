/**
 * A single message in a skill's agent session history.
 * Stored as individual rows (one per message) to keep long
 * conversations manageable.
 *
 * Messages are managed via a rolling-window cap (eviction on append)
 * and cleaned up when the parent skill is deleted.
 */
export interface SessionMessage {
  skillId: string;
  sequence: number;
  role: 'user' | 'assistant';
  content: string;
  createdAt: string;
}
