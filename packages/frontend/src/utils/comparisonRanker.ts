import type { EvalRun } from '@skillspell/shared';

export interface ComparisonSuggestion {
  /** Run ID of the suggested candidate for slot B. */
  runId: string;
  /** Human-readable reason for this suggestion. */
  reason: string;
  /** 1 = best suggestion, higher = less relevant. */
  priority: number;
  /** Display label: "v2 · ✗ 45" */
  label: string;
  /** The run object for easy access. */
  run: EvalRun;
}

/**
 * Given a selected run (slot A) and all available runs, return ranked
 * suggestions for slot B. Only same-test-case runs are eligible
 * (cross-case is blocked at the selection layer).
 *
 * @param slotARun    The run currently in slot A.
 * @param allRuns     All available runs (already version-filtered).
 * @param excludeIds  Run IDs to exclude (e.g. slotA itself, slotB if filled).
 * @returns           Up to 5 ranked suggestions, sorted by priority ascending.
 */
export function rankComparisonCandidates(
  slotARun: EvalRun,
  allRuns: EvalRun[],
  excludeIds: Set<string>,
): ComparisonSuggestion[] {
  // Only same-test-case runs are eligible
  const candidates = allRuns.filter(
    (r) => r.evalId === slotARun.evalId && !excludeIds.has(r.id),
  );

  const scored = candidates.map((run) => {
    const sameVersion = run.skillVersion === slotARun.skillVersion;
    const adjacentVersion =
      run.skillVersion != null &&
      slotARun.skillVersion != null &&
      Math.abs(run.skillVersion - slotARun.skillVersion) === 1;
    const scoreFlipped = run.grading.overall !== slotARun.grading.overall;

    let priority: number;
    let reason: string;

    if (!sameVersion && adjacentVersion) {
      priority = 1;
      reason =
        run.skillVersion! < slotARun.skillVersion!
          ? `Previous version (v${run.skillVersion})`
          : `Next version (v${run.skillVersion})`;
    } else if (!sameVersion && scoreFlipped) {
      priority = 2;
      reason = `Score changed (v${run.skillVersion ?? '?'})`;
    } else if (!sameVersion) {
      priority = 3;
      reason = `Different version (v${run.skillVersion ?? '?'})`;
    } else if (sameVersion && scoreFlipped) {
      priority = 4;
      reason = 'Re-run variance';
    } else {
      priority = 5;
      reason = 'Re-run (identical score)';
    }

    const overallIcon =
      run.grading.overall === 'pass'
        ? '✓'
        : run.grading.overall === 'fail'
          ? '✗'
          : '~';

    return {
      runId: run.id,
      reason,
      priority,
      label: `v${run.skillVersion ?? '?'} · ${overallIcon} ${run.grading.score}`,
      run,
    };
  });

  // Sort by priority ascending, then by version descending (most recent first)
  scored.sort((a, b) => {
    if (a.priority !== b.priority) return a.priority - b.priority;
    return (b.run.skillVersion ?? 0) - (a.run.skillVersion ?? 0);
  });

  return scored.slice(0, 5);
}
