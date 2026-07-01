/**
 * Supported export formats for IDE-specific skill packaging.
 */
export type ExportFormat =
  | 'claude'
  | 'cursor'
  | 'windsurf'
  | 'copilot'
  | 'roo';

/**
 * Metadata for each export format, used by the frontend to render the selector.
 */
export interface ExportFormatInfo {
  id: ExportFormat;
  name: string;
  description: string;
  outputPath: string;
}

/**
 * Represents a named file item stored as content within a skill.
 * On export, each item generates a file in the appropriate subdirectory.
 */
export interface SkillFileItem {
  name: string;
  content: string;
}

/**
 * Complete skill entity — single record in the database.
 * All content (SKILL.md, scripts, references, assets) is stored
 * as fields on this entity. The export service generates the
 * directory structure from these fields at download time.
 *
 * Conversation history is stored separately in the `session_messages` table
 * and managed by SessionService — not on this entity.
 */
export interface Skill {
  id: string;
  /** Owner user ID. Set automatically from the authenticated user on creation. */
  ownerId: string;
  name: string;
  description: string;
  status: 'draft' | 'ready' | 'in_review' | 'published';
  skillContent: string;
  scripts: SkillFileItem[];
  references: SkillFileItem[];
  assets: SkillFileItem[];
  version: number;
  createdAt: string;
  updatedAt: string;
  isPublished: boolean;
}

/**
 * Lightweight summary of a skill — excludes heavy content fields.
 *
 * Returned by listing endpoints (findAll) and backed by the sparse
 * GSI1 projection which only includes these summary attributes.
 */
export interface SkillSummary {
  id: string;
  /** Owner user ID. */
  ownerId: string;
  name: string;
  description: string;
  status: 'draft' | 'ready' | 'in_review' | 'published';
  version: number;
  createdAt: string;
  updatedAt: string;
  isPublished: boolean;
  /** The version currently live on the marketplace (from listing.snapshotVersion). */
  publishedVersion?: number;
  /** All versions with an approved marketplace submission — used to show 'published' on historical views. */
  approvedVersions?: number[];
}

/**
 * Proposal returned by Claude — not yet saved to database.
 * User must review and approve before this becomes a Skill.
 */
export interface SkillProposal {
  name: string;
  description: string;
  skillContent: string;
  scripts: SkillFileItem[];
  references: SkillFileItem[];
  assets: SkillFileItem[];
  explanation: string;
}

export interface CreateSkillData {
  /** Owner user ID. Set by the service from the authenticated request context. */
  ownerId: string;
  name: string;
  description: string;
  status?: string;
  skillContent?: string;
  scripts?: SkillFileItem[];
  references?: SkillFileItem[];
  assets?: SkillFileItem[];
}

export interface UpdateSkillData {
  name?: string;
  description?: string;
  status?: string;
  skillContent?: string;
  scripts?: SkillFileItem[];
  references?: SkillFileItem[];
  assets?: SkillFileItem[];
  isPublished?: boolean;
}

/**
 * Skill returned from generation/refinement endpoints.
 * Extends the saved Skill with an explanation of what was generated/changed.
 */
export interface SkillWithSession extends Skill {
  /** Explanation of what was generated or changed. */
  explanation?: string;
  /** Generation performance stats (tokens, time, cost). */
  stats?: import('./generation.js').GenerationStats;
  /** Validation issues found by SkillValidatorService (warnings, not hard errors). */
  validationIssues?: import('./generation.js').ValidationIssue[];
}

/**
 * A snapshot of a skill at a specific version.
 * Persisted before each optimization/refinement so users
 * can compare what changed between versions.
 */
export interface SkillVersionSnapshot {
  skillId: string;
  version: number;
  description: string;
  skillContent: string;
  scripts: SkillFileItem[];
  references: SkillFileItem[];
  assets: SkillFileItem[];
  /** Explanation of what was changed in this version (from AI optimization/refinement). */
  explanation?: string;
  createdAt: string;
}

/** Summary of a version (without full content) for listing. */
export interface SkillVersionSummary {
  skillId: string;
  version: number;
  description: string;
  /** Explanation of what was changed in this version (from AI optimization/refinement). */
  explanation?: string;
  createdAt: string;
}

/**
 * A cached Mermaid diagram generated from a skill's SKILL.md content.
 * Stored per skill version — auto-regenerated when the version changes.
 */
export interface SkillDiagram {
  skillId: string;
  version: number;
  mermaid: string;
  summary: string;
  createdAt: string;
}
