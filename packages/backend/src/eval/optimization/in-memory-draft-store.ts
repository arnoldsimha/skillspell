import { Injectable } from '@nestjs/common';
import type { SkillDraft } from '@skillspell/shared';
import type { IDraftStore } from './draft-store.interface.js';

/**
 * V1 in-memory implementation of IDraftStore.
 *
 * Stores drafts in a Map<optimizationId, Map<iteration, SkillDraft>>.
 * All data is lost on server restart — acceptable for V1 since the SSE
 * connection pins to one instance and the user can retry.
 */
@Injectable()
export class InMemoryDraftStore implements IDraftStore {
  private readonly store = new Map<string, Map<number, SkillDraft>>();

  async save(optimizationId: string, iteration: number, draft: SkillDraft): Promise<void> {
    if (!this.store.has(optimizationId)) {
      this.store.set(optimizationId, new Map());
    }
    this.store.get(optimizationId)!.set(iteration, draft);
  }

  async get(optimizationId: string, iteration: number): Promise<SkillDraft | null> {
    return this.store.get(optimizationId)?.get(iteration) ?? null;
  }

  async getBest(optimizationId: string): Promise<{ iteration: number; draft: SkillDraft } | null> {
    const iterations = this.store.get(optimizationId);
    if (!iterations?.size) return null;

    let best: { iteration: number; draft: SkillDraft } | null = null;
    for (const [iter, draft] of iterations) {
      if (!best || draft.testScore > best.draft.testScore) {
        best = { iteration: iter, draft };
      }
    }
    return best;
  }

  async cleanup(optimizationId: string): Promise<void> {
    this.store.delete(optimizationId);
  }
}
