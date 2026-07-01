import { describe, it, expect } from 'vitest';
import { sortAssertions, computeDelta } from '../src/utils/evalSummary';
import type { EvalAssertionResult } from '../src/types/index';

function makeResult(passed: boolean, description = 'assertion'): EvalAssertionResult {
  return {
    assertion: { type: 'semantic', value: description, description },
    passed,
  };
}

describe('sortAssertions', () => {
  it('puts failed assertions before passing ones', () => {
    const input = [makeResult(true, 'A'), makeResult(false, 'B'), makeResult(true, 'C')];
    const result = sortAssertions(input);
    expect(result[0].passed).toBe(false);
    expect(result[1].passed).toBe(true);
    expect(result[2].passed).toBe(true);
  });

  it('preserves relative order within same pass status', () => {
    const input = [makeResult(false, 'B'), makeResult(false, 'D'), makeResult(true, 'A')];
    const result = sortAssertions(input);
    expect(result[0].assertion.description).toBe('B');
    expect(result[1].assertion.description).toBe('D');
    expect(result[2].assertion.description).toBe('A');
  });

  it('does not mutate the original array', () => {
    const input = [makeResult(true, 'A'), makeResult(false, 'B')];
    sortAssertions(input);
    expect(input[0].assertion.description).toBe('A');
  });

  it('returns empty array unchanged', () => {
    expect(sortAssertions([])).toEqual([]);
  });

  it('handles all passing', () => {
    const input = [makeResult(true, 'A'), makeResult(true, 'B')];
    expect(sortAssertions(input).every((r) => r.passed)).toBe(true);
  });

  it('handles all failing', () => {
    const input = [makeResult(false, 'A'), makeResult(false, 'B')];
    const result = sortAssertions(input);
    expect(result[0].assertion.description).toBe('A');
    expect(result[1].assertion.description).toBe('B');
  });
});

describe('computeDelta', () => {
  it('returns null when baselineScore is undefined', () => {
    expect(computeDelta(80, undefined)).toBeNull();
  });

  it('returns positive value when skill score is higher', () => {
    expect(computeDelta(82, 68)).toEqual({ value: 14 });
  });

  it('returns negative value when skill score is lower', () => {
    expect(computeDelta(34, 56)).toEqual({ value: -22 });
  });

  it('returns zero when scores are equal', () => {
    expect(computeDelta(70, 70)).toEqual({ value: 0 });
  });
});
