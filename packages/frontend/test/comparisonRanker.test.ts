import { describe, it, expect } from 'vitest';
import { rankComparisonCandidates } from '../src/utils/comparisonRanker';
import type { EvalRun } from '../src/types/index';

/* ─── Test Helpers ──────────────────────────────────────────────────── */

/** Minimal EvalRun factory — only the fields used by the ranker. */
function makeRun(overrides: Partial<EvalRun> & { id: string }): EvalRun {
  return {
    evalId: 'case-1',
    skillId: 'skill-1',
    config: { maxTokens: 4096 },
    prompt: 'test prompt',
    outputWithSkill: 'output',
    outputFiles: [],
    grading: {
      overall: 'pass',
      score: 90,
      assertionResults: [],
      gradedAt: '2026-01-01T00:00:00Z',
      gradedBy: 'auto',
    },
    timing: {
      durationMs: 1000,
      inputTokens: 100,
      outputTokens: 200,
      totalTokens: 300,
    },
    status: 'completed',
    skillVersion: 1,
    createdAt: '2026-01-01T00:00:00Z',
    ...overrides,
  };
}

/* ─── Tests ─────────────────────────────────────────────────────────── */

describe('rankComparisonCandidates', () => {
  // ─── Filtering ──────────────────────────────────────────────────────

  describe('filtering', () => {
    it('returns empty array when allRuns is empty', () => {
      const slotA = makeRun({ id: 'a', skillVersion: 3 });
      const result = rankComparisonCandidates(slotA, [], new Set(['a']));
      expect(result).toEqual([]);
    });

    it('returns empty array when no runs share the same evalId as slotA', () => {
      const slotA = makeRun({ id: 'a', evalId: 'case-1', skillVersion: 3 });
      const others = [
        makeRun({ id: 'b', evalId: 'case-2', skillVersion: 2 }),
        makeRun({ id: 'c', evalId: 'case-3', skillVersion: 1 }),
      ];
      const result = rankComparisonCandidates(slotA, others, new Set(['a']));
      expect(result).toEqual([]);
    });

    it('excludes the slotA run itself from results', () => {
      const slotA = makeRun({ id: 'a', skillVersion: 3 });
      const allRuns = [
        slotA,
        makeRun({ id: 'b', skillVersion: 2 }),
      ];
      const result = rankComparisonCandidates(slotA, allRuns, new Set(['a']));
      expect(result).toHaveLength(1);
      expect(result[0].runId).toBe('b');
    });

    it('excludes additional IDs passed in excludeIds set', () => {
      const slotA = makeRun({ id: 'a', skillVersion: 3 });
      const allRuns = [
        slotA,
        makeRun({ id: 'b', skillVersion: 2 }),
        makeRun({ id: 'c', skillVersion: 1 }),
      ];
      const result = rankComparisonCandidates(slotA, allRuns, new Set(['a', 'b']));
      expect(result).toHaveLength(1);
      expect(result[0].runId).toBe('c');
    });

    it('returns at most 5 suggestions even when more candidates exist', () => {
      const slotA = makeRun({ id: 'a', skillVersion: 10 });
      const allRuns: EvalRun[] = [slotA];
      for (let i = 1; i <= 8; i++) {
        allRuns.push(makeRun({ id: `r${i}`, skillVersion: i }));
      }
      const result = rankComparisonCandidates(slotA, allRuns, new Set(['a']));
      expect(result).toHaveLength(5);
    });
  });

  // ─── Priority ranking ──────────────────────────────────────────────

  describe('priority ranking', () => {
    it('ranks adjacent version (v_n-1) as priority 1 with reason "Previous version"', () => {
      const slotA = makeRun({ id: 'a', skillVersion: 3 });
      const prev = makeRun({ id: 'b', skillVersion: 2 });
      const result = rankComparisonCandidates(slotA, [slotA, prev], new Set(['a']));
      expect(result[0].priority).toBe(1);
      expect(result[0].reason).toBe('Previous version (v2)');
    });

    it('ranks adjacent version (v_n+1) as priority 1 with reason "Next version"', () => {
      const slotA = makeRun({ id: 'a', skillVersion: 3 });
      const next = makeRun({ id: 'b', skillVersion: 4 });
      const result = rankComparisonCandidates(slotA, [slotA, next], new Set(['a']));
      expect(result[0].priority).toBe(1);
      expect(result[0].reason).toBe('Next version (v4)');
    });

    it('ranks score-flipped different-version as priority 2 (pass→fail)', () => {
      const slotA = makeRun({ id: 'a', skillVersion: 5, grading: { overall: 'pass', score: 90, assertionResults: [], gradedAt: '', gradedBy: 'auto' } });
      const flipped = makeRun({ id: 'b', skillVersion: 2, grading: { overall: 'fail', score: 30, assertionResults: [], gradedAt: '', gradedBy: 'auto' } });
      const result = rankComparisonCandidates(slotA, [slotA, flipped], new Set(['a']));
      expect(result[0].priority).toBe(2);
      expect(result[0].reason).toContain('Score changed');
    });

    it('ranks same-score different-version as priority 3', () => {
      const slotA = makeRun({ id: 'a', skillVersion: 5 });
      const other = makeRun({ id: 'b', skillVersion: 1 }); // same overall ('pass'), non-adjacent
      const result = rankComparisonCandidates(slotA, [slotA, other], new Set(['a']));
      expect(result[0].priority).toBe(3);
      expect(result[0].reason).toContain('Different version');
    });

    it('ranks same-version re-run with different score as priority 4 "Re-run variance"', () => {
      const slotA = makeRun({ id: 'a', skillVersion: 3, grading: { overall: 'pass', score: 90, assertionResults: [], gradedAt: '', gradedBy: 'auto' } });
      const rerun = makeRun({ id: 'b', skillVersion: 3, grading: { overall: 'fail', score: 40, assertionResults: [], gradedAt: '', gradedBy: 'auto' } });
      const result = rankComparisonCandidates(slotA, [slotA, rerun], new Set(['a']));
      expect(result[0].priority).toBe(4);
      expect(result[0].reason).toBe('Re-run variance');
    });

    it('ranks same-version re-run with identical score as priority 5', () => {
      const slotA = makeRun({ id: 'a', skillVersion: 3 });
      const rerun = makeRun({ id: 'b', skillVersion: 3 }); // same overall + score
      const result = rankComparisonCandidates(slotA, [slotA, rerun], new Set(['a']));
      expect(result[0].priority).toBe(5);
      expect(result[0].reason).toBe('Re-run (identical score)');
    });
  });

  // ─── Sort order ────────────────────────────────────────────────────

  describe('sort order', () => {
    it('sorts by priority ascending (1 before 2 before 3, etc.)', () => {
      const slotA = makeRun({ id: 'a', skillVersion: 5, grading: { overall: 'pass', score: 90, assertionResults: [], gradedAt: '', gradedBy: 'auto' } });
      const runs = [
        slotA,
        makeRun({ id: 'p5', skillVersion: 5 }), // priority 5: same version, same score
        makeRun({ id: 'p1', skillVersion: 4 }), // priority 1: adjacent
        makeRun({ id: 'p2', skillVersion: 1, grading: { overall: 'fail', score: 30, assertionResults: [], gradedAt: '', gradedBy: 'auto' } }), // priority 2: score flipped, non-adjacent
        makeRun({ id: 'p3', skillVersion: 2 }), // priority 3: different version, same score, non-adjacent
      ];
      const result = rankComparisonCandidates(slotA, runs, new Set(['a']));
      expect(result.map((r) => r.priority)).toEqual([1, 2, 3, 5]);
    });

    it('within same priority, sorts by version descending (most recent first)', () => {
      const slotA = makeRun({ id: 'a', skillVersion: 10 });
      const runs = [
        slotA,
        makeRun({ id: 'v3', skillVersion: 3 }),
        makeRun({ id: 'v7', skillVersion: 7 }),
        makeRun({ id: 'v1', skillVersion: 1 }),
        makeRun({ id: 'v5', skillVersion: 5 }),
      ];
      const result = rankComparisonCandidates(slotA, runs, new Set(['a']));
      // All are priority 3 (different version, same score, non-adjacent to v10 except v9/v11 which don't exist)
      const versions = result.map((r) => r.run.skillVersion);
      expect(versions).toEqual([7, 5, 3, 1]);
    });

    it('handles null skillVersion gracefully (treated as 0)', () => {
      const slotA = makeRun({ id: 'a', skillVersion: 3 });
      const nullVersion = makeRun({ id: 'b', skillVersion: undefined });
      const v1 = makeRun({ id: 'c', skillVersion: 1 });
      const runs = [slotA, nullVersion, v1];
      const result = rankComparisonCandidates(slotA, runs, new Set(['a']));
      // v1 is non-adjacent (priority 3), null is also different version (priority 3)
      // v1 (version 1) should come before null (version 0)
      expect(result).toHaveLength(2);
      expect(result[0].run.skillVersion).toBe(1);
      expect(result[1].run.skillVersion).toBeUndefined();
    });
  });

  // ─── Label formatting ─────────────────────────────────────────────

  describe('label formatting', () => {
    it('formats label as "v{N} · ✓ {score}" for passing runs', () => {
      const slotA = makeRun({ id: 'a', skillVersion: 3 });
      const passing = makeRun({ id: 'b', skillVersion: 2, grading: { overall: 'pass', score: 92, assertionResults: [], gradedAt: '', gradedBy: 'auto' } });
      const result = rankComparisonCandidates(slotA, [slotA, passing], new Set(['a']));
      expect(result[0].label).toBe('v2 · ✓ 92');
    });

    it('formats label as "v{N} · ✗ {score}" for failing runs', () => {
      const slotA = makeRun({ id: 'a', skillVersion: 3 });
      const failing = makeRun({ id: 'b', skillVersion: 2, grading: { overall: 'fail', score: 25, assertionResults: [], gradedAt: '', gradedBy: 'auto' } });
      const result = rankComparisonCandidates(slotA, [slotA, failing], new Set(['a']));
      expect(result[0].label).toBe('v2 · ✗ 25');
    });

    it('formats label as "v{N} · ~ {score}" for partial runs', () => {
      const slotA = makeRun({ id: 'a', skillVersion: 3 });
      const partial = makeRun({ id: 'b', skillVersion: 2, grading: { overall: 'partial', score: 55, assertionResults: [], gradedAt: '', gradedBy: 'auto' } });
      const result = rankComparisonCandidates(slotA, [slotA, partial], new Set(['a']));
      expect(result[0].label).toBe('v2 · ~ 55');
    });

    it('formats label as "v? · ..." when skillVersion is null', () => {
      const slotA = makeRun({ id: 'a', skillVersion: 3 });
      const noVersion = makeRun({ id: 'b', skillVersion: undefined });
      const result = rankComparisonCandidates(slotA, [slotA, noVersion], new Set(['a']));
      expect(result[0].label).toMatch(/^v\? · /);
    });
  });

  // ─── Edge cases ───────────────────────────────────────────────────

  describe('edge cases', () => {
    it('works when slotA is the only run for this test case (returns empty)', () => {
      const slotA = makeRun({ id: 'a', skillVersion: 3 });
      const result = rankComparisonCandidates(slotA, [slotA], new Set(['a']));
      expect(result).toEqual([]);
    });

    it('works with exactly 2 runs (returns 1 suggestion)', () => {
      const slotA = makeRun({ id: 'a', skillVersion: 3 });
      const other = makeRun({ id: 'b', skillVersion: 2 });
      const result = rankComparisonCandidates(slotA, [slotA, other], new Set(['a']));
      expect(result).toHaveLength(1);
    });

    it('handles runs with identical versions and scores (priority 5 for all)', () => {
      const slotA = makeRun({ id: 'a', skillVersion: 3 });
      const runs = [
        slotA,
        makeRun({ id: 'b', skillVersion: 3 }),
        makeRun({ id: 'c', skillVersion: 3 }),
        makeRun({ id: 'd', skillVersion: 3 }),
      ];
      const result = rankComparisonCandidates(slotA, runs, new Set(['a']));
      expect(result).toHaveLength(3);
      expect(result.every((r) => r.priority === 5)).toBe(true);
    });

    it('handles mix of priorities correctly across 10+ candidates', () => {
      const slotA = makeRun({ id: 'a', skillVersion: 5, grading: { overall: 'pass', score: 90, assertionResults: [], gradedAt: '', gradedBy: 'auto' } });
      const runs: EvalRun[] = [
        slotA,
        // Priority 1: adjacent
        makeRun({ id: 'adj-prev', skillVersion: 4 }),
        makeRun({ id: 'adj-next', skillVersion: 6 }),
        // Priority 2: score flipped, non-adjacent
        makeRun({ id: 'flip-v1', skillVersion: 1, grading: { overall: 'fail', score: 20, assertionResults: [], gradedAt: '', gradedBy: 'auto' } }),
        makeRun({ id: 'flip-v2', skillVersion: 2, grading: { overall: 'fail', score: 30, assertionResults: [], gradedAt: '', gradedBy: 'auto' } }),
        // Priority 3: different version, same score
        makeRun({ id: 'same-v3', skillVersion: 3 }),
        makeRun({ id: 'same-v7', skillVersion: 7 }),
        makeRun({ id: 'same-v8', skillVersion: 8 }),
        // Priority 4: same version, different score
        makeRun({ id: 'rerun-var', skillVersion: 5, grading: { overall: 'fail', score: 40, assertionResults: [], gradedAt: '', gradedBy: 'auto' } }),
        // Priority 5: same version, same score
        makeRun({ id: 'rerun-same', skillVersion: 5 }),
        makeRun({ id: 'rerun-same2', skillVersion: 5 }),
      ];
      const result = rankComparisonCandidates(slotA, runs, new Set(['a']));
      // Max 5 results
      expect(result).toHaveLength(5);
      // Should get: 2 × priority 1, 2 × priority 2, 1 × priority 3
      expect(result[0].priority).toBe(1);
      expect(result[1].priority).toBe(1);
      expect(result[2].priority).toBe(2);
      expect(result[3].priority).toBe(2);
      expect(result[4].priority).toBe(3);
    });
  });
});
