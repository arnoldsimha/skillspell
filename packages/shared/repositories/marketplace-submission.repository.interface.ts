import type { SubmissionRequirement } from '../types/marketplace.js';

export const MARKETPLACE_SUBMISSION_REPOSITORY = Symbol('MARKETPLACE_SUBMISSION_REPOSITORY');

export type MarketplaceSubmissionStatus =
  | 'pending_review'
  | 'approved'
  | 'rejected'
  | 'removed';

export interface MarketplaceSubmission {
  id: string;
  skillId: string;
  version: string | null;
  status: MarketplaceSubmissionStatus;
  submittedBy: string;
  reviewedBy: string | null;
  reviewNote: string | null;
  submittedAt: string;
  reviewedAt: string | null;
  snapshotName: string | null;
  snapshotDescription: string | null;
  snapshotCategories: string[];
  submitterNote?: string | null;
  requirementsMet: SubmissionRequirement[] | null;
  // Enriched fields populated by org-scoped list queries
  skillName?: string;
  submitterName?: string;
}

export interface CreateMarketplaceSubmissionData {
  skillId: string;
  version: string;
  submittedBy: string;
  snapshotName: string;
  snapshotDescription: string | null;
  snapshotCategories: string[];
  submitterNote?: string | null;
  requirementsMet?: SubmissionRequirement[] | null;
}

export interface IMarketplaceSubmissionRepository {
  /** Create a new submission with status=pending_review. */
  create(data: CreateMarketplaceSubmissionData): Promise<MarketplaceSubmission>;
  /** Find a submission by its UUID. Returns null if not found. */
  findById(id: string): Promise<MarketplaceSubmission | null>;
  /** Find all submissions for a given skill. */
  findBySkillId(skillId: string): Promise<MarketplaceSubmission[]>;
  /**
   * Find submissions for a skill that are active (status=pending_review or approved).
   * Used by SkillsService.delete() to enforce the ownership constraint (MKT-07).
   */
  findActiveBySkillId(skillId: string): Promise<MarketplaceSubmission[]>;
  /** Find all submissions by the given user. */
  findBySubmittedBy(userId: string): Promise<MarketplaceSubmission[]>;
  /**
   * Update submission status and optionally set reviewer info.
   * Used by admin approve/reject/remove operations in Phase 20.
   */
  updateStatus(
    id: string,
    status: MarketplaceSubmissionStatus,
    reviewedBy?: string,
    reviewNote?: string,
  ): Promise<void>;
  /**
   * Atomically set ALL approved submissions for a skill to removed in a single UPDATE.
   * Eliminates the TOCTOU race that a fetch-filter-loop pattern would have.
   * Used by SC-8 removeFromMarketplace.
   */
  removeAllApprovedBySkillId(skillId: string, reviewedBy: string): Promise<void>;
  /**
   * Find all pending_review submissions for skills belonging to the given org.
   * Joins through skills → users for org filtering.
   * Ordered by submittedAt DESC.
   * Used by GET /api/admin/marketplace/pending (Phase 23, SC-1 gap closure).
   */
  findPendingByOrg(orgId: string): Promise<MarketplaceSubmission[]>;
  /**
   * Find a single pending_review submission by id, scoped to an org.
   * Returns null if the submission does not exist or does not belong to the org.
   * Used by getSubmissionPreview to avoid loading all pending submissions.
   */
  findPendingByIdAndOrg(submissionId: string, orgId: string): Promise<MarketplaceSubmission | null>;
  /**
   * Find all approved submissions for skills belonging to the given org.
   * Joins through skills → users for org filtering.
   * Aggregates total download counts from skill_download_events.
   * Used by GET /api/marketplace (Phase 20, SC-3).
   */
  findApprovedByOrg(orgId: string, opts: FindApprovedByOrgOptions): Promise<MarketplaceListItem[]>;
  /** Returns total count of approved skills matching the filter criteria — used for "Page N of M" pagination. */
  findApprovedCountByOrg(orgId: string, opts: Pick<FindApprovedByOrgOptions, 'search' | 'categories'>): Promise<number>;
  /**
   * Direct lookup: find a single approved submission for a specific skill within an org.
   * Returns null if no approved submission exists. This avoids the O(n) in-process scan
   * used by the previous limit:100 implementation (CR-06).
   */
  findApprovedBySkillAndOrg(skillId: string, orgId: string): Promise<MarketplaceListItem | null>;
  /**
   * Find all approved submissions (across all versions) for a given skill.
   * IN-007: orgId is optional — when provided, the query additionally asserts that the
   * skill owner belongs to that org, preventing cross-org version enumeration.
   */
  findApprovedVersionsBySkillId(skillId: string, orgId?: string): Promise<MarketplaceSubmission[]>;
  /** Find a specific approved submission by skill ID and version string. Returns null if not found. */
  findApprovedVersionBySkillAndVersion(skillId: string, version: string): Promise<MarketplaceSubmission | null>;
  /** Set the given submission to removed status, recording who removed it. */
  removeVersion(submissionId: string, removedBy: string): Promise<void>;
}

export interface MarketplaceListItem {
  skillId: string;
  submissionId: string;
  version: string;
  name: string;
  description: string;
  categories: string[];
  downloadCount: number;
  submittedAt: string;
  reviewedAt?: string | null;
  submittedBy: string;
  submittedByName?: string;
  /** ISO date of the first approved submission for this skill. */
  createdAt?: string;
  /** ISO date of the latest approved submission for this skill. */
  updatedAt?: string;
  // New engagement fields
  upvoteCount: number;
  isUpvoted: boolean;
  isFavorited: boolean;
}

export interface FindApprovedByOrgOptions {
  search?: string;
  categories?: string[];
  limit?: number;
  offset?: number;
}
