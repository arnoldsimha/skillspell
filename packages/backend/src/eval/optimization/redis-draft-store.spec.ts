import { Test, TestingModule } from '@nestjs/testing';
import { CACHE_MANAGER } from '@nestjs/cache-manager';
import type { Cache } from '@nestjs/cache-manager';
import type { SkillDraft } from '@skillspell/shared';
import { RedisDraftStore } from './redis-draft-store.js';

/**
 * Unit tests for RedisDraftStore — validates Redis-backed draft storage.
 *
 * Uses a mock CACHE_MANAGER to test the implementation without a live Redis instance.
 * Validates key formats, TTL usage, iteration index management, getBest scoring,
 * and cleanup behavior.
 */
describe('RedisDraftStore', () => {
  let store: RedisDraftStore;
  let cacheManagerMock: jest.Mocked<Cache>;

  const makeDraft = (testScore: number): SkillDraft => ({
    content: 'skill content',
    testScore,
  } as unknown as SkillDraft);

  beforeEach(async () => {
    cacheManagerMock = {
      get: jest.fn(),
      set: jest.fn().mockResolvedValue(undefined),
      del: jest.fn().mockResolvedValue(undefined),
    } as unknown as jest.Mocked<Cache>;

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        RedisDraftStore,
        {
          provide: CACHE_MANAGER,
          useValue: cacheManagerMock,
        },
      ],
    }).compile();

    store = module.get<RedisDraftStore>(RedisDraftStore);
  });

  describe('save()', () => {
    it('should set draft key with 24h TTL', async () => {
      const draft = makeDraft(0.8);
      cacheManagerMock.get.mockResolvedValue(null);

      await store.save('opt-1', 1, draft);

      expect(cacheManagerMock.set).toHaveBeenCalledWith(
        'draft:opt-1:1',
        draft,
        86_400_000,
      );
    });

    it('should set iteration index with 24h TTL', async () => {
      const draft = makeDraft(0.8);
      cacheManagerMock.get.mockResolvedValue(null);

      await store.save('opt-1', 1, draft);

      expect(cacheManagerMock.set).toHaveBeenCalledWith(
        'draft:opt-1:__iterations__',
        [{ iteration: 1, score: 0.8 }],
        86_400_000,
      );
    });

    it('should update existing iteration in index without duplicating', async () => {
      const existing = [{ iteration: 1, score: 0.5 }];
      cacheManagerMock.get.mockResolvedValue(existing);

      const draft = makeDraft(0.9);
      await store.save('opt-1', 1, draft);

      expect(cacheManagerMock.set).toHaveBeenCalledWith(
        'draft:opt-1:__iterations__',
        [{ iteration: 1, score: 0.9 }],
        86_400_000,
      );
    });

    it('should append new iteration to existing index', async () => {
      const existing = [{ iteration: 1, score: 0.5 }];
      cacheManagerMock.get.mockResolvedValue(existing);

      const draft = makeDraft(0.7);
      await store.save('opt-1', 2, draft);

      expect(cacheManagerMock.set).toHaveBeenCalledWith(
        'draft:opt-1:__iterations__',
        expect.arrayContaining([
          { iteration: 1, score: 0.5 },
          { iteration: 2, score: 0.7 },
        ]),
        86_400_000,
      );
    });
  });

  describe('get()', () => {
    it('should return draft from cache when found', async () => {
      const draft = makeDraft(0.8);
      cacheManagerMock.get.mockResolvedValue(draft);

      const result = await store.get('opt-1', 1);

      expect(cacheManagerMock.get).toHaveBeenCalledWith('draft:opt-1:1');
      expect(result).toBe(draft);
    });

    it('should return null when draft not in cache', async () => {
      cacheManagerMock.get.mockResolvedValue(null);

      const result = await store.get('opt-1', 99);

      expect(result).toBeNull();
    });

    it('should return null when cache returns undefined', async () => {
      cacheManagerMock.get.mockResolvedValue(undefined);

      const result = await store.get('opt-1', 1);

      expect(result).toBeNull();
    });
  });

  describe('getBest()', () => {
    it('should return null when iteration index is empty', async () => {
      cacheManagerMock.get.mockResolvedValue(null);

      const result = await store.getBest('opt-1');

      expect(result).toBeNull();
    });

    it('should return null when iteration index is an empty array', async () => {
      cacheManagerMock.get.mockResolvedValue([]);

      const result = await store.getBest('opt-1');

      expect(result).toBeNull();
    });

    it('should return the iteration with the highest testScore', async () => {
      const index = [
        { iteration: 1, score: 0.5 },
        { iteration: 2, score: 0.9 },
        { iteration: 3, score: 0.7 },
      ];
      const bestDraft = makeDraft(0.9);

      cacheManagerMock.get
        .mockResolvedValueOnce(index) // index key
        .mockResolvedValueOnce(bestDraft); // draft:opt-1:2

      const result = await store.getBest('opt-1');

      expect(result).toEqual({ iteration: 2, draft: bestDraft });
    });

    it('should return null and warn if best draft missing from cache', async () => {
      const index = [{ iteration: 1, score: 0.8 }];

      cacheManagerMock.get
        .mockResolvedValueOnce(index) // index key
        .mockResolvedValueOnce(null); // draft not in cache

      const result = await store.getBest('opt-1');

      expect(result).toBeNull();
    });
  });

  describe('cleanup()', () => {
    it('should delete all draft keys and index key', async () => {
      const index = [
        { iteration: 1, score: 0.5 },
        { iteration: 2, score: 0.8 },
      ];
      cacheManagerMock.get.mockResolvedValue(index);

      await store.cleanup('opt-1');

      expect(cacheManagerMock.del).toHaveBeenCalledWith('draft:opt-1:1');
      expect(cacheManagerMock.del).toHaveBeenCalledWith('draft:opt-1:2');
      expect(cacheManagerMock.del).toHaveBeenCalledWith('draft:opt-1:__iterations__');
    });

    it('should only delete index key when no iterations recorded', async () => {
      cacheManagerMock.get.mockResolvedValue(null);

      await store.cleanup('opt-1');

      expect(cacheManagerMock.del).toHaveBeenCalledTimes(1);
      expect(cacheManagerMock.del).toHaveBeenCalledWith('draft:opt-1:__iterations__');
    });
  });
});
