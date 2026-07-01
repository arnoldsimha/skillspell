/**
 * EvalCase — A test case definition for evaluating a skill.
 */
export interface EvalCase {
  id: string;
  skillId: string;
  name: string;
  /** The test prompt to send. */
  prompt: string;
  /** Optional expected output for comparison. */
  expectedOutput?: string;
  /** Assertions to check against output. */
  assertions: EvalAssertion[];
  /** Additional context for the test. */
  context?: string;
  /**
   * Maximum output tokens allowed when running this eval case.
   * Defaults to 8192 at runtime. Set higher (up to 16000) for cases that
   * intentionally generate long outputs (e.g. full microservice code).
   */
  maxOutputTokens?: number;
  /** Skill version that existed when this test case was created. Defaults to 1 for legacy cases. */
  createdAtVersion?: number;
  createdAt: string;
  updatedAt: string;
}

/**
 * EvalAssertion — A single assertion to check against output.
 */
export interface EvalAssertion {
  type: 'contains' | 'not_contains' | 'regex' | 'semantic' | 'custom';
  /** The value to check for. */
  value: string;
  /** Human-readable description. */
  description?: string;
}

/**
 * EvalRun — Result from running a test case.
 */
export interface EvalRun {
  id: string;
  /** Reference to EvalCase. */
  evalId: string;
  skillId: string;
  config: EvalRunConfig;
  /** The prompt that was run. */
  prompt: string;
  /** Output when skill was applied. */
  outputWithSkill: string;
  /** Output without skill (baseline). */
  outputWithoutSkill?: string;
  /** Any generated files. */
  outputFiles: EvalOutputFile[];
  /** Grading results for the with-skill output. */
  grading: EvalGrading;
  /** Timing for the with-skill execution only. */
  timing: EvalTiming;
  /** Separate timing for the baseline (no-skill) execution. Only present when compareBaseline is true. */
  baselineTiming?: EvalTiming;
  /** Separate grading for the baseline (no-skill) output. Only present when compareBaseline is true. */
  baselineGrading?: EvalGrading;
  status: 'pending' | 'running' | 'completed' | 'failed';
  error?: string;
  /** 1-indexed iteration number — which improvement cycle produced this run. */
  iteration?: number;
  /** Snapshot of the skill version at the time this run was created. */
  skillVersion?: number;
  createdAt: string;
  completedAt?: string;
}

/**
 * EvalRunConfig — Configuration for an eval run.
 */
export interface EvalRunConfig {
  /** Model identifier — optional, defaults to 'main' on the backend. */
  model?: string;
  maxTokens?: number;
  temperature?: number;
  /** Whether to run without skill for comparison. */
  compareBaseline?: boolean;
}

/**
 * EvalOutputFile — An output file from an eval run.
 */
export interface EvalOutputFile {
  filename: string;
  type: 'text' | 'image' | 'pdf' | 'binary';
  mimeType: string;
  /** For text files. */
  content?: string;
  /** For binary/image/pdf files. */
  base64?: string;
  /** Size in bytes. */
  size: number;
}

/**
 * ExtractedClaim — A verifiable statement found in the eval output by the grader.
 * Claims are auto-discovered facts, process descriptions, or quality statements
 * that go beyond what predefined assertions check.
 */
export interface ExtractedClaim {
  /** The claim statement extracted from the output. */
  claim: string;
  /** Claim category: factual (numbers, names), process (steps, order), quality (completeness, correctness). */
  type: 'factual' | 'process' | 'quality';
  /** Whether the grader verified this claim as accurate. */
  verified: boolean;
  /** Evidence for or against the claim. */
  evidence: string;
  /** Confidence in the verification (0-1). */
  confidence?: number;
}

/**
 * EvalGrading — Results from grading an eval run.
 */
export interface EvalGrading {
  overall: 'pass' | 'fail' | 'partial';
  /** 0-100 */
  score: number;
  assertionResults: EvalAssertionResult[];
  gradedAt: string;
  gradedBy: 'auto' | 'human';
  /** Self-critique feedback from the grader about the test case quality. */
  evalFeedback?: {
    suggestions: Array<{
      /** The specific assertion text being critiqued, or null for general suggestions. */
      assertion?: string | null;
      /** What's wrong with this assertion or what coverage is missing. */
      reason: string;
    }>;
    /** One-sentence summary of the test suite's quality. */
    overall?: string;
  };
  /** Claims extracted and verified from the output (B4). Separate from user-defined assertions. */
  extractedClaims?: ExtractedClaim[];
  /** Plain-English summary of eval results for display to the user. Only present when LLM grading ran. */
  plainEnglishSummary?: string;
  /**
   * Set when AI grading could not be completed due to an infrastructure error
   * (API failure, timeout, unparseable response) rather than the skill output
   * being wrong. Runs with this set are excluded from quality metrics (pass
   * rate, scores) so a transient grader error doesn't look like a skill failure.
   */
  gradingError?: string;
}

/**
 * EvalAssertionResult — Result of a single assertion check.
 */
export interface EvalAssertionResult {
  assertion: EvalAssertion;
  passed: boolean;
  /** Evidence/explanation for the result. */
  evidence?: string;
  /** Confidence level for semantic assertions. */
  confidence?: number;
}

/**
 * EvalTiming — Timing and token usage data.
 */
export interface EvalTiming {
  /** Total duration in milliseconds. */
  durationMs: number;
  inputTokens: number;
  outputTokens: number;
  totalTokens: number;
  /** Total tool invocations during execution. */
  toolCalls?: number;
  /** Number of errors encountered during execution. */
  errorsEncountered?: number;
  /** Total characters in the output. */
  outputChars?: number;
}

/**
 * StatsSummary — Descriptive statistics for a numeric metric (mean ± stddev, min, max).
 */
export interface StatsSummary {
  mean: number;
  stddev: number;
  min: number;
  max: number;
}

/**
 * ConfigStats — Aggregated statistics for a single config (with-skill or baseline).
 */
export interface ConfigStats {
  passRate: StatsSummary;
  durationMs: StatsSummary;
  tokens: StatsSummary;
  score: StatsSummary;
}

/**
 * EvalBenchmark — Aggregated benchmark statistics.
 */
export interface EvalBenchmark {
  skillId: string;
  totalRuns: number;
  /** 0-100 percentage. */
  passRate: number;
  /** 0-100 average. */
  averageScore: number;
  averageDurationMs: number;
  averageTokens: number;
  byAssertion: EvalAssertionStats[];
  byEvalCase: EvalCaseStats[];
  /** Per-assertion-value stats with discrimination analysis. */
  byAssertionValue?: EvalAssertionValueStats[];
  /** Variance statistics for with-skill runs. */
  withSkillStats?: ConfigStats;
  /** Variance statistics for baseline runs. Only present when baseline comparison was run. */
  baselineStats?: ConfigStats;
  /** Delta between with-skill and baseline (e.g. "+15.00" for pass rate improvement). */
  delta?: {
    passRate: string;
    durationMs: string;
    tokens: string;
    score: string;
  };
  /** Freeform analyst observations about patterns in the data. */
  notes?: string[];
  /** Per-iteration statistics for tracking improvement over time. */
  byIteration?: IterationStats[];
  generatedAt: string;
}

/**
 * EvalAssertionStats — Stats for a specific assertion type.
 */
export interface EvalAssertionStats {
  assertionType: string;
  totalChecks: number;
  passCount: number;
  passRate: number;
  /** Whether this assertion type discriminates between with-skill and baseline. */
  discrimination?: 'non-discriminating' | 'skill-adds-value' | 'skill-hurts' | 'broken' | 'inconclusive';
}

/**
 * IterationStats — Aggregated statistics for a single iteration (improvement cycle).
 */
export interface IterationStats {
  iteration: number;
  skillVersion: number;
  runCount: number;
  passRate: number;
  averageScore: number;
  /** Whether this iteration won, lost, or tied vs the previous iteration. */
  gradingResult?: 'won' | 'lost' | 'tie' | 'baseline';
  /** Delta compared to previous iteration. */
  delta?: {
    passRate: string;
    score: string;
  };
}

/**
 * EvalAssertionValueStats — Stats for a specific assertion value (not just type).
 * Used for non-discriminating assertion detection (Phase 2).
 */
export interface EvalAssertionValueStats {
  /** The assertion text/value. */
  assertionValue: string;
  /** The assertion type (contains, semantic, etc.). */
  assertionType: string;
  /** Human-readable description. */
  description?: string;
  /** Pass rate when skill is applied. */
  withSkillPassRate: number;
  /** Pass rate without skill (baseline). */
  baselinePassRate: number;
  totalWithSkillChecks: number;
  totalBaselineChecks: number;
  /** Whether this assertion discriminates between with-skill and baseline. */
  discrimination?: 'non-discriminating' | 'skill-adds-value' | 'skill-hurts' | 'broken' | 'inconclusive';
}

/**
 * AI-suggested replacement for a non-discriminating assertion.
 * Returned by the suggest-assertions endpoint.
 */
export interface AssertionReplacementSuggestion {
  /** The original assertion that is non-discriminating. */
  original: { assertionValue: string; assertionType: string };
  /** The suggested replacement assertion. */
  replacement: { value: string; type: string; description?: string };
  /** Why this replacement is better at discriminating. */
  reasoning: string;
}

/**
 * AI-generated analysis of a skill's key behaviors, edge cases, and weak areas.
 * Used as a pre-pass before generating test cases (C4).
 */
export interface SkillAnalysis {
  /** Core behaviors the skill MUST exhibit. */
  keyBehaviors: string[];
  /** Specific edge cases and boundary conditions to test. */
  edgeCases: string[];
  /** Rules, limitations, or guardrails the skill must follow. */
  constraints: string[];
  /** Areas where the skill is likely to fail or produce suboptimal output. */
  weakAreas: string[];
  /** Specific types of inputs that create meaningful test diversity. */
  inputVariations: string[];
  /** Recommended assertion types and patterns for this skill. */
  assertionStrategy: string[];
}

/**
 * EvalCaseStats — Stats for a specific eval case.
 */
export interface EvalCaseStats {
  evalId: string;
  evalName: string;
  runCount: number;
  passCount: number;
  passRate: number;
  averageScore: number;
}

/**
 * EvalFeedback — User feedback on an eval run.
 */
export interface EvalFeedback {
  id: string;
  runId: string;
  skillId: string;
  /** The feedback text. */
  feedback: string;
  rating?: 'good' | 'bad' | 'neutral';
  /** Optional suggested fix. */
  suggestedFix?: string;
  createdAt: string;
  updatedAt: string;
}

/**
 * Request to create a new eval case.
 */
export interface CreateEvalCaseRequest {
  name: string;
  prompt: string;
  expectedOutput?: string;
  assertions: EvalAssertion[];
  context?: string;
  maxOutputTokens?: number;
}

/**
 * Request to update an existing eval case (partial update).
 */
export interface UpdateEvalCaseRequest {
  name?: string;
  prompt?: string;
  expectedOutput?: string;
  assertions?: EvalAssertion[];
  context?: string;
  maxOutputTokens?: number;
}

/**
 * A test prompt suggestion returned by the eval suggest-prompts endpoint.
 */
export interface TestPromptSuggestion {
  label: string;
  prompt: string;
  name: string;
  expectedOutput?: string;
  context?: string;
  assertions?: EvalAssertion[];
  maxOutputTokens?: number;
}

/**
 * Request to run eval cases.
 */
export interface RunEvalsRequest {
  /** Specific evals to run, or all if empty. */
  evalIds?: string[];
  config: EvalRunConfig;
  /** Number of times to run each eval case. Default 1, use 3-5 for benchmarking. */
  runsPerCase?: number;
  /** Run against a specific skill version instead of the current one. */
  targetVersion?: number;
}

/**
 * Request to save feedback on an eval run.
 */
export interface SaveFeedbackRequest {
  runId: string;
  feedback: string;
  rating?: 'good' | 'bad' | 'neutral';
  suggestedFix?: string;
}

/**
 * C3: Failure explanation — synthesizes grading data into a plain-language
 * explanation of why an eval run failed, with actionable fix suggestions.
 */
export interface FailureExplanation {
  /** Whether the explanation was built locally from evidence or via an AI call. */
  mode: 'synthesized' | 'ai-explained';
  /** Plain-language summary of what went wrong. */
  summary: string;
  /** The root cause in the skill instructions (AI mode only). */
  rootCause?: string;
  /** Concrete changes to make in the skill to fix this failure. */
  suggestions: string[];
}

// ── Eval Run SSE Progress Events ─────────────────────────────────────

/** SSE event: an individual eval case has started executing. */
export interface EvalProgressStarted {
  evalId: string;
  evalName: string;
  /** 1-based index of this eval in the run. */
  index: number;
  /** Total number of evals to run. */
  total: number;
  /** Phase: executing the prompt or grading the output. */
  phase: 'executing' | 'grading';
}

/** SSE event: an individual eval case has completed (or failed). */
export interface EvalProgressCompleted {
  evalId: string;
  evalName: string;
  /** 1-based index of this eval in the run. */
  index: number;
  /** Total number of evals to run. */
  total: number;
  status: 'completed' | 'failed';
  /** 0-100 score from grading. */
  score?: number;
  /** pass/fail/partial overall grading result. */
  overall?: 'pass' | 'fail' | 'partial';
  /** Duration of this individual eval in milliseconds. */
  durationMs: number;
}

/** SSE event: all evals have finished. Summary stats only — frontend refetches full runs via React Query. */
export interface EvalRunStreamComplete {
  totalRuns: number;
  passed: number;
  failed: number;
  /** Total wall-clock duration in milliseconds. */
  durationMs: number;
}

/** Discriminated union of all eval run SSE event types. */
export type EvalRunEvent =
  | { type: 'eval-started'; data: EvalProgressStarted }
  | { type: 'eval-grading'; data: EvalProgressStarted }
  | { type: 'eval-completed'; data: EvalProgressCompleted }
  | { type: 'eval-run-complete'; data: EvalRunStreamComplete }
  | { type: 'eval-run-error'; data: { message: string } };
