import type { MarketplaceListItem } from './marketplace-submission.repository.interface.js';

export const MARKETPLACE_LISTING_REPOSITORY = 'MARKETPLACE_LISTING_REPOSITORY';

export type MarketplaceListingStatus = 'active' | 'removal_requested' | 'removed';
export type MarketplaceRemovalType = 'admin_policy' | 'owner_request';

export interface MarketplaceListing {
  id: string;
  skillId: string;
  orgId: string;
  submissionId: string;
  snapshotName: string;
  snapshotDescription: string | null;
  snapshotCategories: string[];
  snapshotVersion: number;
  status: MarketplaceListingStatus;
  removalReason: string | null;
  removedBy: string | null;
  removalType: MarketplaceRemovalType | null;
  firstApprovedAt: string;
  lastApprovedAt: string;
}

export interface UpsertMarketplaceListingData {
  skillId: string;
  orgId: string;
  submissionId: string;
  snapshotName: string;
  snapshotDescription: string | null;
  snapshotCategories: string[];
  snapshotVersion: number;
}

export interface FindListingsOptions {
  search?: string;
  categories?: string[];
  limit?: number;
  offset?: number;
  sort?: 'popular' | 'newest' | 'downloads' | 'upvotes' | 'name';
  userId?: string;
  skillIds?: string[];
}

export interface IMarketplaceListingRepository {
  upsert(data: UpsertMarketplaceListingData): Promise<MarketplaceListing>;
  findBySkillId(skillId: string): Promise<MarketplaceListing | null>;
  findActiveByOrgId(
    orgId: string,
    opts?: FindListingsOptions,
  ): Promise<{ items: MarketplaceListItem[]; total: number }>;
  setStatus(
    skillId: string,
    status: MarketplaceListingStatus,
    meta?: {
      removedBy?: string;
      removalReason?: string;
      removalType?: MarketplaceRemovalType;
    },
  ): Promise<void>;
}
