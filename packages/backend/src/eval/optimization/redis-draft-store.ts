import { Injectable, Inject, Logger } from '@nestjs/common';
import { CACHE_MANAGER, type Cache } from '@nestjs/cache-manager';
import type { SkillDraft } from '@skillspell/shared';
import type { IDraftStore } from './draft-store.interface.js';

/** 24 hours — safe cleanup window for optimization runs. */
const DRAFT_TTL_MS = 86_400_000;

interface IterationIndex {
  iteration: number;
  score: number;
}

/**
 * Redis-backed implementation of IDraftStore.
 *
 * Replaces InMemoryDraftStore so optimization iteration drafts survive pod
 * restarts and are visible across all replicas.
 *
 * Key layout:
 *   draft:{optimizationId}:{iteration}         — individual draft object
 *   draft:{optimizationId}:__iterations__      — JSON array of { iteration, score }
 *
 * All keys use DRAFT_TTL_MS (24 h) for automatic expiry.
 * CACHE_MANAGER is globally registered (isGlobal: true in AppModule) — no
 * per-module CacheModule import is needed.
 */
@Injectable()
export class RedisDraftStore implements IDraftStore {
  private readonly logger = new Logger(RedisDraftStore.name);

  constructor(
    @Inject(CACHE_MANAGER) private readonly cacheManager: Cache,
  ) {}

  async save(optimizationId: string, iteration: number, draft: SkillDraft): Promise<void> {
    const draftKey = `draft:${optimizationId}:${iteration}`;
    const indexKey = `draft:${optimizationId}:__iterations__`;

    await this.cacheManager.set(draftKey, draft, DRAFT_TTL_MS);

    // Update iteration index — non-atomic get-then-set.
    // This is a known TOCTOU race: if two optimization jobs for the same optimizationId
    // write concurrently (e.g., under retry/multi-replica conditions), a concurrent write
    // between the get and set below can be silently overwritten.
    // Acceptable in the current design (single optimization loop per optimizationId) but
    // NOT safe for multi-replica deployments with concurrent optimizations. For that case,
    // replace with a Redis Lua script or WATCH/MULTI/EXEC atomic get-modify-set.
    const existing = await this.cacheManager.get<IterationIndex[]>(indexKey) ?? [];
    const filtered = existing.filter((e) => e.iteration !== iteration);
    filtered.push({ iteration, score: draft.testScore });
    await this.cacheManager.set(indexKey, filtered, DRAFT_TTL_MS);

    this.logger.debug(`Draft saved: ${draftKey} (score=${draft.testScore})`);
  }

  async get(optimizationId: string, iteration: number): Promise<SkillDraft | null> {
    return (await this.cacheManager.get<SkillDraft>(`draft:${optimizationId}:${iteration}`)) ?? null;
  }

  async getBest(
    optimizationId: string,
  ): Promise<{ iteration: number; draft: SkillDraft } | null> {
    const index = await this.cacheManager.get<IterationIndex[]>(
      `draft:${optimizationId}:__iterations__`,
    );
    if (!index?.length) return null;

    const best = index.reduce((a, b) => (b.score > a.score ? b : a));
    const draft = await this.get(optimizationId, best.iteration);
    if (!draft) {
      this.logger.warn(`getBest: index entry for iteration ${best.iteration} missing from cache`);
      return null;
    }
    return { iteration: best.iteration, draft };
  }

  async cleanup(optimizationId: string): Promise<void> {
    const indexKey = `draft:${optimizationId}:__iterations__`;
    const index = await this.cacheManager.get<IterationIndex[]>(indexKey) ?? [];
    await Promise.all(
      index.map((e) => this.cacheManager.del(`draft:${optimizationId}:${e.iteration}`)),
    );
    await this.cacheManager.del(indexKey);
    this.logger.debug(`Draft cleanup complete for optimizationId=${optimizationId}`);
  }
}
