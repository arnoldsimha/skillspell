import type { SkillFileItem, SkillProposal } from './skill.js';

/* ------------------------------------------------------------------ */
/*  SKILL VALIDATION                                                    */
/* ------------------------------------------------------------------ */

/** Severity level for a skill validation issue. */
export type ValidationSeverity = 'error' | 'warning' | 'info';

/** A single validation issue found during skill validation. */
export interface ValidationIssue {
  severity: ValidationSeverity;
  field: string;
  message: string;
}

/**
 * Generation/refinement performance statistics returned by the Agent SDK.
 */
export interface GenerationStats {
  /** Wall-clock duration in milliseconds. */
  durationMs: number;
  /** Total input tokens consumed (non-cached). */
  inputTokens: number;
  /** Total output tokens consumed. */
  outputTokens: number;
  /** Input tokens served from prompt cache. */
  cacheReadInputTokens: number;
  /** Input tokens written to prompt cache. */
  cacheCreationInputTokens: number;
  /** Estimated cost in USD. */
  costUsd: number;
  /** Number of Agent SDK turns. */
  numTurns: number;
}

/**
 * Result of a Claude SDK skill generation call.
 * Contains the proposed skill content before user approval.
 */
export interface SkillGenerationResult {
  name: string;
  description: string;
  skillContent: string;
  scripts: SkillFileItem[];
  references: SkillFileItem[];
  assets: SkillFileItem[];
  explanation: string;
  /** Performance stats from the Agent SDK. */
  stats?: GenerationStats;
  /** Validation issues found by SkillValidatorService (warnings, not hard errors). */
  validationIssues?: ValidationIssue[];
}

/**
 * Request to generate a new skill from a user prompt.
 */
export interface GenerateSkillRequest {
  prompt: string;
  /** User-chosen skill name (required, must be unique). */
  skillName: string;
  signal?: AbortSignal;
}

/**
 * Request to optimize an existing skill.
 */
export interface OptimizeSkillRequest {
  skillId: string;
  message: string;
}

/**
 * A single suggestion item returned by the smart suggestions endpoint.
 */
export interface SuggestionItem {
  label: string;
  prompt: string;
  /** Suggested kebab-case skill name for this suggestion. */
  suggestedName?: string;
}

/**
 * Request to get smart suggestions.
 */
export interface SuggestRequest {
  mode: 'create' | 'optimize';
  partialInput?: string;
  skillId?: string;
}

/* ------------------------------------------------------------------ */
/*  DRAFT OPTIMIZATION                                                 */
/* ------------------------------------------------------------------ */

/**
 * Request body for POST /generate/:id/optimize-draft.
 * Generates an optimization draft WITHOUT saving to the database.
 * On subsequent refinements, `draftContext` sends the current in-memory
 * draft so Claude refines the draft rather than the persisted skill.
 */
export interface OptimizeDraftRequest {
  /** The refinement/optimization instruction from the user. */
  refinement: string;
  /** Current in-memory draft context (sent on 2nd+ refinement within the same optimization session). */
  draftContext?: {
    name: string;
    description: string;
    skillContent: string;
    scripts: SkillFileItem[];
    references: SkillFileItem[];
    assets: SkillFileItem[];
  };
}

/**
 * Response from POST /generate/:id/optimize-draft.
 * Contains the proposed changes but is NOT saved to DB.
 */
export interface OptimizeDraftResponse extends SkillProposal {
  /** Generation performance stats (tokens, time, cost). */
  stats?: GenerationStats;
  /** Validation issues found by SkillValidatorService (warnings, not hard errors). */
  validationIssues?: ValidationIssue[];
}

/**
 * Request body for POST /skills/:id/approve-optimization.
 * Applies the approved draft as a new skill version.
 * Note: `name` is intentionally optional — the skill name is managed
 * separately on the main skill object, not through the optimization flow.
 */
export interface ApproveOptimizationRequest {
  name?: string;
  description: string;
  skillContent: string;
  scripts: SkillFileItem[];
  references: SkillFileItem[];
  assets: SkillFileItem[];
  /** Explanation of what was changed (from the AI). */
  explanation?: string;
}

/* ------------------------------------------------------------------ */
/*  DESCRIPTION OPTIMIZATION                                           */
/* ------------------------------------------------------------------ */

/**
 * A single trigger eval query for description optimization.
 * Tests whether a query should or should not trigger the skill.
 */
export interface TriggerEvalQuery {
  query: string;
  shouldTrigger: boolean;
}

/**
 * Result of evaluating a single trigger query against a description.
 */
export interface TriggerEvalResult {
  query: string;
  shouldTrigger: boolean;
  didTrigger: boolean;
  /** Trigger rate from multiple runs (0.0 – 1.0). */
  triggerRate: number;
  /** Whether the eval passed (triggered when should, or didn't when shouldn't). */
  correct: boolean;
}

/**
 * A single iteration in the description optimization loop.
 */
export interface OptimizationIteration {
  iteration: number;
  description: string;
  trainScore: number;
  testScore: number;
  trainResults: TriggerEvalResult[];
  testResults: TriggerEvalResult[];
}

/**
 * Full result of a description optimization run.
 */
export interface DescriptionOptimizationResult {
  originalDescription: string;
  bestDescription: string;
  iterations: OptimizationIteration[];
  bestIteration: number;
  improvement: { trainDelta: number; testDelta: number };
}

/**
 * Request body for POST /generate/:id/optimize-description/trigger-evals.
 * Generates trigger eval queries from the skill content.
 */
export interface GenerateTriggerEvalsRequest {
  /** Number of eval queries to generate (default: 20). */
  count?: number;
}

/**
 * Response from POST /generate/:id/optimize-description/trigger-evals.
 */
export interface GenerateTriggerEvalsResponse {
  queries: TriggerEvalQuery[];
}

/**
 * Request body for POST /generate/:id/optimize-description/run.
 * Runs the optimization loop with the provided eval queries.
 */
export interface RunDescriptionOptimizationRequest {
  queries: TriggerEvalQuery[];
  /** Max iterations (default: 5). */
  maxIterations?: number;
  /** Runs per query for trigger simulation (default: 3). */
  runsPerQuery?: number;
}

/**
 * Request body for POST /generate/:id/optimize-description/apply.
 * Applies the optimized description to the skill.
 */
export interface ApplyOptimizedDescriptionRequest {
  description: string;
}
