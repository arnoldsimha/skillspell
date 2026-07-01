export const MARKETPLACE_REMOVAL_REQUEST_REPOSITORY =
  Symbol('MARKETPLACE_REMOVAL_REQUEST_REPOSITORY');

export type RemovalRequestScope = 'skill' | 'version';
export type RemovalRequestStatus = 'pending' | 'approved' | 'rejected';

export interface MarketplaceRemovalRequest {
  id: string;
  skillId: string;
  scope: RemovalRequestScope;
  targetSubmissionId: string | null;
  reason: string | null;
  submittedBy: string;
  status: RemovalRequestStatus;
  reviewedBy: string | null;
  reviewedAt: string | null;
  createdAt: string;
  // Enriched fields populated by org-scoped queries
  skillName?: string;
  submitterName?: string;
  targetVersion?: string | null;
}

export interface CreateRemovalRequestData {
  skillId: string;
  scope: RemovalRequestScope;
  targetSubmissionId: string | null;
  reason?: string;
  submittedBy: string;
}

export interface IMarketplaceRemovalRequestRepository {
  /** Insert a new removal request with status='pending'. */
  create(data: CreateRemovalRequestData): Promise<MarketplaceRemovalRequest>;
  /** Find a removal request by UUID. Returns null if not found. */
  findById(id: string): Promise<MarketplaceRemovalRequest | null>;
  /**
   * Find all pending removal requests for skills belonging to the given org.
   * Ordered by created_at ASC (FIFO — oldest requests handled first).
   */
  findPendingByOrg(orgId: string): Promise<MarketplaceRemovalRequest[]>;
  /** Check whether any pending request exists for the given skill (any scope). */
  hasPendingForSkill(skillId: string): Promise<boolean>;
  /** Set status to approved or rejected and record reviewer. */
  updateStatus(
    id: string,
    status: 'approved' | 'rejected',
    reviewedBy: string,
  ): Promise<void>;
}
