import type { SkillFileItem } from './skill.js';

// ── Configuration ──────────────────────────────────────────────────────

/** User-configurable options for the optimization loop. */
export interface SkillOptimizationConfig {
  /** Maximum number of improve→eval iterations. @default 3 */
  maxIterations: number;
  /** Stop early if test pass rate reaches this threshold (0–1). @default 1.0 */
  targetPassRate?: number;
  /** Include user feedback from previous eval runs in the first iteration. */
  includeFeedback?: boolean;
  /**
   * Model used to EXECUTE eval cases during the loop. Defaults to 'main' — the
   * same model manual benchmarks and production use — so the skill is tuned for
   * the model it will actually run on. Set 'light' to trade fidelity for cheaper,
   * faster iterations. Grading and skill improvement always use the main model.
   * @default 'main'
   */
  evalModel?: 'main' | 'light';
}

/**
 * Minimum number of eval cases required for a blinded train/test split during
 * optimization. Below this, the holdout would be too small to produce a
 * meaningful score, so the loop falls back to running unblinded on the full set
 * (weakening its protection against overfitting). Single source of truth shared
 * by the backend split logic and the frontend "add more cases" hint.
 */
export const MIN_EVAL_CASES_FOR_BLINDED_SPLIT = 5;

// ── Iteration State ────────────────────────────────────────────────────

/** Sub-step labels within a single iteration. */
export type IterationSubStep =
  | 'running-train'
  | 'analyzing'
  | 'improving'
  | 'running-test'
  | 'done';

/** State of a single optimization iteration (emitted via SSE). */
export interface IterationState {
  iteration: number;
  subStep: IterationSubStep;
  trainScore: number;
  testScore: number;
  /** Number of training evals that passed (available after running-train). */
  trainPassed?: number;
  /** Total number of training eval cases. */
  trainTotal?: number;
  /** Number of test evals that passed (available after running-test). */
  testPassed?: number;
  /** Total number of test eval cases. */
  testTotal?: number;
  /** Accumulated cost in USD across all API calls so far. */
  totalCost?: number;
  /** Duration of this iteration in milliseconds. */
  durationMs?: number;
  /** Per-eval progress within the current running-train or running-test sub-step. */
  evalProgress?: { completed: number; total: number };
}

// ── Draft ──────────────────────────────────────────────────────────────

/** Snapshot of a skill draft at a specific iteration, with eval scores. */
export interface SkillDraft {
  name: string;
  description: string;
  skillContent: string;
  scripts: SkillFileItem[];
  references: SkillFileItem[];
  assets: SkillFileItem[];
  explanation?: string;
  trainScore: number;
  testScore: number;
}

// ── SSE Events ─────────────────────────────────────────────────────────

/** Discriminated union of all SSE event types sent during optimization. */
export type OptimizationEvent =
  | { type: 'iteration-progress'; data: IterationState }
  | { type: 'iteration-complete'; data: IterationState }
  | { type: 'optimization-complete'; data: OptimizationResult }
  | { type: 'optimization-error'; data: { message: string } }
  | { type: 'regression-detected'; data: { iteration: number; prevScore: number; currentScore: number; revertedTo: number } };

export type CoverageGapDimension =
  | 'input-length'
  | 'negative-cases'
  | 'edge-cases'
  | 'assertion-diversity'
  | 'expected-output';

export interface CoverageGap {
  dimension: CoverageGapDimension;
  severity: 'high' | 'medium';
  description: string;
  suggestionPrompt: string;
}

export interface CoverageGapReport {
  gaps: CoverageGap[];
  /** 0–100: percentage of the 5 dimensions with no detected gap. */
  coverageScore: number;
}

/** Final result emitted when the optimization loop finishes. */
export interface OptimizationResult {
  bestIteration: {
    iteration: number;
    draft: SkillDraft;
  } | null;
  iterations: IterationState[];
  improvement: {
    trainDelta: number;
    testDelta: number;
  };
  /** Total accumulated cost in USD for the entire optimization run. */
  totalCost?: number;
  /** Total wall-clock duration of the optimization loop in milliseconds. */
  durationMs?: number;
  /** Coverage gaps detected after the optimization run completes. */
  coverageGaps?: CoverageGapReport;
}
