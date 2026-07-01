import type { SkillDraft } from '@skillspell/shared';

/**
 * Injection token for the DraftStore abstraction.
 *
 * V1: InMemoryDraftStore (Map-based, request-scoped)
 * V2: Could be PostgresDraftStore, RedisDraftStore, etc.
 */
export const DRAFT_STORE = Symbol('DRAFT_STORE');

/**
 * Abstraction for storing optimization iteration drafts.
 *
 * Allows swapping the storage layer (in-memory → DB → Redis)
 * without changing the SkillOptimizationService.
 */
export interface IDraftStore {
  /** Save a draft for a specific optimization run + iteration. */
  save(optimizationId: string, iteration: number, draft: SkillDraft): Promise<void>;

  /** Get the draft for a specific iteration. */
  get(optimizationId: string, iteration: number): Promise<SkillDraft | null>;

  /** Get the best draft (by test score) across all iterations. */
  getBest(optimizationId: string): Promise<{ iteration: number; draft: SkillDraft } | null>;

  /** Clean up all drafts for a completed/cancelled optimization. */
  cleanup(optimizationId: string): Promise<void>;
}
