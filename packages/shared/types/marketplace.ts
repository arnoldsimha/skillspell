/**
 * RequirementId — Unique identifier for a submission requirement rule.
 * Extend this union when adding new requirement rules.
 */
export type RequirementId = 'baseline_eval_run' | 'version_not_approved';

/**
 * SubmissionRequirement — A single requirement for skill marketplace submission.
 */
export interface SubmissionRequirement {
  /** Unique identifier for this requirement. */
  id: RequirementId;
  /** Human-readable label shown in the UI. */
  label: string;
  /** Hint text shown to users when requirement is not met. */
  hint: string;
  /** Whether this requirement is currently met. */
  met: boolean;
  /** Whether this requirement is mandatory (true) or a recommendation only (false). */
  required: boolean;
}
