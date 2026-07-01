import type { EvalAssertionResult } from '@skillspell/shared';

/**
 * Sort assertion results so failed assertions appear first.
 * Returns a new array — does not mutate the input.
 */
export function sortAssertions(results: EvalAssertionResult[]): EvalAssertionResult[] {
  return [...results].sort((a, b) => {
    if (a.passed === b.passed) return 0;
    return a.passed ? 1 : -1;
  });
}

/**
 * Compute the score delta between the skill run and a baseline run.
 * Returns null if no baseline score is available.
 */
export function computeDelta(
  withSkillScore: number,
  baselineScore: number | undefined,
): { value: number } | null {
  if (baselineScore === undefined) return null;
  return { value: withSkillScore - baselineScore };
}
