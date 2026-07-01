/**
 * Shared word-level diff utility based on Longest Common Subsequence (LCS).
 * Extracted from DescriptionOptimizer for reuse across eval comparison views.
 *
 * Performance notes:
 * - O(m×n) time and space where m,n are word counts
 * - Early exit for identical strings
 * - Callers should wrap in useMemo and check word count before calling
 */

export type DiffSegment = { type: 'equal' | 'removed' | 'added'; text: string };

/** Maximum word count before we refuse to compute the diff (prevents O(n²) memory issues). */
export const DIFF_WORD_LIMIT = 10_000;

/** Tokenize text into words + whitespace tokens for diff. */
function tokenize(text: string): string[] {
  return text.match(/\S+|\s+/g) || [];
}

/**
 * Compute a word-level diff using the longest common subsequence (LCS) approach.
 * Splits on word boundaries, then finds LCS to determine equal/removed/added segments.
 *
 * Returns null if either input exceeds DIFF_WORD_LIMIT (caller should show fallback UI).
 */
export function computeWordDiff(a: string, b: string): DiffSegment[] | null {
  // Early exit for identical strings
  if (a === b) {
    return [{ type: 'equal', text: a }];
  }

  const wordsA = tokenize(a);
  const wordsB = tokenize(b);

  // Safety: refuse to diff very large texts
  if (wordsA.length > DIFF_WORD_LIMIT || wordsB.length > DIFF_WORD_LIMIT) {
    return null;
  }

  // Build LCS table
  const m = wordsA.length;
  const n = wordsB.length;
  const dp: number[][] = Array.from({ length: m + 1 }, () => Array(n + 1).fill(0));
  for (let i = 1; i <= m; i++) {
    for (let j = 1; j <= n; j++) {
      dp[i][j] = wordsA[i - 1] === wordsB[j - 1]
        ? dp[i - 1][j - 1] + 1
        : Math.max(dp[i - 1][j], dp[i][j - 1]);
    }
  }

  // Backtrack to produce diff
  const result: DiffSegment[] = [];
  let i = m, j = n;
  const stack: DiffSegment[] = [];
  while (i > 0 || j > 0) {
    if (i > 0 && j > 0 && wordsA[i - 1] === wordsB[j - 1]) {
      stack.push({ type: 'equal', text: wordsA[i - 1] });
      i--; j--;
    } else if (j > 0 && (i === 0 || dp[i][j - 1] >= dp[i - 1][j])) {
      stack.push({ type: 'added', text: wordsB[j - 1] });
      j--;
    } else {
      stack.push({ type: 'removed', text: wordsA[i - 1] });
      i--;
    }
  }
  stack.reverse();

  // Merge consecutive segments of the same type
  for (const seg of stack) {
    const last = result[result.length - 1];
    if (last && last.type === seg.type) {
      last.text += seg.text;
    } else {
      result.push({ ...seg });
    }
  }

  return result;
}
