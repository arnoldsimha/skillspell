import {
  ForbiddenException,
  Inject,
  Injectable,
  Logger,
  NotFoundException,
} from '@nestjs/common';
import { CACHE_MANAGER, type Cache } from '@nestjs/cache-manager';
import {
  MARKETPLACE_LISTING_REPOSITORY,
  MARKETPLACE_SUBMISSION_REPOSITORY,
  SKILL_DOWNLOAD_EVENT_REPOSITORY,
  SKILL_FAVORITE_REPOSITORY,
  SKILL_REPOSITORY,
  SKILL_UPVOTE_REPOSITORY,
  USER_REPOSITORY,
  type IMarketplaceListingRepository,
  type IMarketplaceSubmissionRepository,
  type ISkillDownloadEventRepository,
  type ISkillFavoriteRepository,
  type ISkillRepository,
  type ISkillUpvoteRepository,
  type IUserRepository,
  type MarketplaceListing,
  type MarketplaceListItem,
  type MarketplaceSubmission,
  type User,
} from '@skillspell/shared';
import type { MarketplaceListQueryDto } from './dto/marketplace-list-query.dto.js';

@Injectable()
export class MarketplaceService {
  private readonly logger = new Logger(MarketplaceService.name);

  constructor(
    @Inject(MARKETPLACE_SUBMISSION_REPOSITORY)
    private readonly submissionRepo: IMarketplaceSubmissionRepository,
    @Inject(MARKETPLACE_LISTING_REPOSITORY)
    private readonly listingRepo: IMarketplaceListingRepository,
    @Inject(SKILL_DOWNLOAD_EVENT_REPOSITORY)
    private readonly dlEventRepo: ISkillDownloadEventRepository,
    @Inject(SKILL_REPOSITORY)
    private readonly skillRepo: ISkillRepository,
    @Inject(USER_REPOSITORY)
    private readonly userRepo: IUserRepository,
    @Inject(SKILL_UPVOTE_REPOSITORY)
    private readonly upvoteRepo: ISkillUpvoteRepository,
    @Inject(SKILL_FAVORITE_REPOSITORY)
    private readonly favoriteRepo: ISkillFavoriteRepository,
    @Inject(CACHE_MANAGER)
    private readonly cacheManager: Cache,
  ) {}

  /** Return all submissions by the authenticated user, enriched with skill names and removal details. */
  async findBySubmittedBy(user: User): Promise<(MarketplaceSubmission & { skillName: string; removalReason: string | null })[]> {
    const submissions = await this.submissionRepo.findBySubmittedBy(user.id);
    if (submissions.length === 0) return [];

    // Resolve skill names in bulk — deduplicate skillIds to minimize DB calls
    const uniqueSkillIds = [...new Set(submissions.map(s => s.skillId))];
    const skillMap = new Map<string, string>();
    await Promise.all(
      uniqueSkillIds.map(async (skillId) => {
        const skill = await this.skillRepo.findById(skillId);
        skillMap.set(skillId, skill?.name ?? 'Unknown Skill');
      }),
    );

    // For removed submissions, fetch listing to surface the removal reason
    const removedSkillIds = [...new Set(
      submissions.filter(s => s.status === 'removed').map(s => s.skillId),
    )];
    const removalReasonMap = new Map<string, string | null>();
    await Promise.all(
      removedSkillIds.map(async (skillId) => {
        const listing = await this.listingRepo.findBySkillId(skillId);
        removalReasonMap.set(skillId, listing?.removalReason ?? null);
      }),
    );

    return submissions.map(s => ({
      ...s,
      skillName: skillMap.get(s.skillId) ?? 'Unknown Skill',
      removalReason: removalReasonMap.get(s.skillId) ?? null,
    }));
  }

  /** Return approved skills scoped to the caller's org with filters, including total count for pagination. */
  async findApproved(
    orgId: string,
    query: MarketplaceListQueryDto,
    userId?: string,
  ): Promise<{ items: MarketplaceListItem[]; total: number }> {
    const limit  = query.limit ?? 30;
    const page   = query.page ?? 1;
    const offset = (page - 1) * limit;

    return this.listingRepo.findActiveByOrgId(orgId, {
      search:     query.search,
      categories: query.categories,
      sort:       query.sort ?? 'popular',
      limit,
      offset,
      userId,
    });
  }

  /**
   * Return detail for a single approved marketplace skill including skill content.
   * Reads from marketplace_listings (canonical active record) and fetches the version
   * snapshot for content — never reads live skill data.
   * Returns null if no active listing exists for this skillId in the caller's org.
   */
  async findApprovedSkillDetail(
    skillId: string,
    orgId: string,
    userId: string,
  ): Promise<(MarketplaceListing & { version: string; name: string; description: string; categories: string[]; skillContent: string; scripts: import('@skillspell/shared').SkillFileItem[]; references: import('@skillspell/shared').SkillFileItem[]; assets: import('@skillspell/shared').SkillFileItem[]; isUpvoted: boolean; isFavorited: boolean; upvoteCount: number; submittedBy: string; submittedByName?: string }) | null> {
    const listing = await this.listingRepo.findBySkillId(skillId);
    if (!listing || listing.status !== 'active' || listing.orgId !== orgId) return null;

    const cachedCount = await this.cacheManager.get<number>(`upvote:count:${skillId}`);
    const [snapshot, upvotedIds, favoritedIds, upvoteCount, submission] = await Promise.all([
      this.skillRepo.getVersionSnapshot(skillId, listing.snapshotVersion),
      this.upvoteRepo.findSkillIdsByUser(userId, [skillId]),
      this.favoriteRepo.findSkillIdsByUser(userId, [skillId]),
      cachedCount == null ? this.upvoteRepo.countBySkillId(skillId) : Promise.resolve(cachedCount),
      this.submissionRepo.findById(listing.submissionId),
    ]);
    if (!snapshot) return null;
    if (cachedCount == null) {
      void this.cacheManager.set(`upvote:count:${skillId}`, upvoteCount);
    }

    let submittedBy = '';
    let submittedByName: string | undefined;
    if (submission) {
      submittedBy = submission.submittedBy;
      const submitter = await this.userRepo.findById(submission.submittedBy);
      submittedByName = submitter
        ? `${submitter.firstName} ${submitter.lastName}`.trim()
        : undefined;
    }

    return {
      ...listing,
      version: String(listing.snapshotVersion),
      name: listing.snapshotName,
      description: listing.snapshotDescription ?? '',
      categories: listing.snapshotCategories,
      skillContent: snapshot.skillContent,
      scripts: snapshot.scripts ?? [],
      references: snapshot.references ?? [],
      assets: snapshot.assets ?? [],
      isUpvoted: upvotedIds.includes(skillId),
      isFavorited: favoritedIds.includes(skillId),
      upvoteCount,
      submittedBy,
      submittedByName,
    };
  }

  /**
   * Record a download event.
   * Caller (controller) MUST wrap in try/catch — this method throws normally.
   */
  async recordDownloadEvent(skillId: string, version: string): Promise<void> {
    await this.dlEventRepo.create({ skillId, version });
  }

  /**
   * Return all pending_review submissions scoped to the admin's org,
   * enriched with skill names and submitter full names for the pending table.
   * Admin only — enforced by RolesGuard at controller layer.
   *
   * findPendingByOrg() already JOINs skills and users and populates skillName
   * and submitterName on each row — no extra per-row lookups needed.
   */
  async listPendingSubmissions(
    admin: User,
  ): Promise<(MarketplaceSubmission & { skillName: string; submitterName: string })[]> {
    const submissions = await this.submissionRepo.findPendingByOrg(admin.orgId);
    return submissions.map(s => ({
      ...s,
      skillName: s.skillName ?? 'Unknown Skill',
      submitterName: s.submitterName ?? s.submittedBy,
    }));
  }

  /**
   * List approved marketplace skills for admin's org (management table) with pagination.
   *
   * Replaced the hard-coded limit:200 with explicit limit/offset so
   * admins can page through orgs with more than 200 approved skills. Defaults to a
   * safe 100-item page when no params are supplied.
   */
  async listApprovedSubmissions(
    admin: User,
    limit = 100,
    offset = 0,
  ): Promise<{ items: MarketplaceListItem[]; total: number }> {
    const [items, total] = await Promise.all([
      this.submissionRepo.findApprovedByOrg(admin.orgId, { limit, offset }),
      this.submissionRepo.findApprovedCountByOrg(admin.orgId, {}),
    ]);
    return { items, total };
  }

  /**
   * Fetch a pending submission with its skill content for admin preview.
   * Org-scoped via findPendingByOrg — only submissions belonging to the admin's org are reachable.
   */
  async getSubmissionPreview(
    submissionId: string,
    orgId: string,
  ): Promise<MarketplaceSubmission & { skillName: string; description: string; skillContent: string; scripts: import('@skillspell/shared').SkillFileItem[]; references: import('@skillspell/shared').SkillFileItem[]; assets: import('@skillspell/shared').SkillFileItem[]; submitterName: string }> {
    // Use org-scoped point lookup — avoids loading all pending submissions to find one
    const submission = await this.submissionRepo.findPendingByIdAndOrg(submissionId, orgId);
    if (!submission) throw new NotFoundException(`Submission ${submissionId} not found`);

    const parsedVersion = parseInt(submission.version!, 10);
    const [skill, submitter, snapshot] = await Promise.all([
      this.skillRepo.findById(submission.skillId),
      this.userRepo.findById(submission.submittedBy),
      isNaN(parsedVersion) ? Promise.resolve(null) : this.skillRepo.getVersionSnapshot(submission.skillId, parsedVersion),
    ]);

    if (!skill) throw new NotFoundException('Skill not found');
    if (!snapshot) throw new NotFoundException('Version snapshot not found — skill content was not saved for this version');

    const submitterName = submitter
      ? `${submitter.firstName} ${submitter.lastName}`.trim()
      : submission.submittedBy;

    return {
      ...submission,
      skillName: skill.name,
      description: snapshot.description ?? skill.description ?? '',
      skillContent: snapshot.skillContent,
      scripts: snapshot.scripts,
      references: snapshot.references,
      assets: snapshot.assets,
      submitterName,
    };
  }

  /**
   * Remove a skill from the marketplace — sets ALL approved submissions to removed
   * and marks the listing as removed.
   * Admin only — enforced by RolesGuard at controller layer.
   *
   * Uses a single bulk UPDATE to avoid the TOCTOU race that a fetch-filter-loop had:
   * a concurrent approve call between fetch and updates would leave a row non-removed.
   */
  async removeFromMarketplace(skillId: string, admin: User, reason: string): Promise<void> {
    await this.assertSkillBelongsToOrg(skillId, admin.orgId);
    await this.submissionRepo.removeAllApprovedBySkillId(skillId, admin.id);
    await this.listingRepo.setStatus(skillId, 'removed', {
      removedBy: admin.id,
      removalType: 'admin_policy',
      removalReason: reason,
    });
    await this.skillRepo.update(skillId, { status: 'ready' });
  }

  /**
   * Return all approved versions for a skill, scoped to the caller's org.
   * Access is granted only if the skill has an active listing in the caller's org.
   */
  /**
   * Admin: list all approved versions for a skill without requiring an active
   * marketplace listing. Returns empty array when the skill has no approved
   * submissions (first-time submission, never published).
   */
  async listApprovedVersionsForAdmin(skillId: string): Promise<MarketplaceSubmission[]> {
    return this.submissionRepo.findApprovedVersionsBySkillId(skillId);
  }

  async listVersions(skillId: string, orgId: string): Promise<(MarketplaceSubmission & { downloadCount: number })[]> {
    const listing = await this.listingRepo.findBySkillId(skillId);
    if (!listing || listing.status !== 'active' || listing.orgId !== orgId)
      throw new NotFoundException('Skill not found in marketplace');
    const versions = await this.submissionRepo.findApprovedVersionsBySkillId(skillId);
    const versionStrings = versions.map(v => v.version).filter((v): v is string => v != null);
    const countMap = await this.dlEventRepo.countBySkillIdGroupedByVersion(skillId, versionStrings);
    return versions.map(v => ({
      ...v,
      downloadCount: v.version ? (countMap.get(v.version) ?? 0) : 0,
    }));
  }

  /**
   * Validate that a specific version is still available for download.
   * Throws NotFoundException if the version has been removed from the marketplace.
   */
  async validateVersionDownload(skillId: string, version: string, orgId: string): Promise<void> {
    await this.assertSkillBelongsToOrg(skillId, orgId);
    const match = await this.submissionRepo.findApprovedVersionBySkillAndVersion(skillId, version);
    if (!match)
      throw new NotFoundException('This version is no longer available on the marketplace.');
  }

  async toggleUpvote(
    skillId: string,
    user: User,
  ): Promise<{ upvoteCount: number; isUpvoted: boolean }> {
    const listing = await this.listingRepo.findBySkillId(skillId);
    if (!listing || listing.status !== 'active' || listing.orgId !== user.orgId) {
      throw new NotFoundException('Skill not found in marketplace');
    }
    const isUpvoted = await this.upvoteRepo.toggle(skillId, user.id);
    const upvoteCount = await this.upvoteRepo.countBySkillId(skillId);
    await this.cacheManager.set(`upvote:count:${skillId}`, upvoteCount);
    return { upvoteCount, isUpvoted };
  }

  async toggleFavorite(
    skillId: string,
    user: User,
  ): Promise<{ isFavorited: boolean }> {
    const listing = await this.listingRepo.findBySkillId(skillId);
    if (!listing || listing.status !== 'active' || listing.orgId !== user.orgId) {
      throw new NotFoundException('Skill not found in marketplace');
    }
    const isFavorited = await this.favoriteRepo.toggle(skillId, user.id);
    return { isFavorited };
  }

  async getFavorites(
    user: User,
    opts: { limit?: number; page?: number },
  ): Promise<{ items: MarketplaceListItem[]; total: number }> {
    const limit  = Math.min(opts.limit ?? 30, 100);
    const page   = Math.max(opts.page ?? 1, 1);
    const offset = (page - 1) * limit;

    const [favorites, total] = await Promise.all([
      this.favoriteRepo.findByUser(user.id, { limit, offset }),
      // count only favorites with an active listing so pagination total matches
      // the number of renderable items — raw countByUser includes delisted skills.
      this.favoriteRepo.countActiveByUser(user.id, user.orgId),
    ]);

    if (favorites.length === 0) return { items: [], total };

    const skillIds = favorites.map(f => f.skillId);
    const { items } = await this.listingRepo.findActiveByOrgId(user.orgId, {
      skillIds: skillIds,
      // explicit cap in case per-page limit is increased in the future
      limit: Math.min(skillIds.length, 100),
      offset: 0,
      userId: user.id,
    });

    // Preserve favorite order (most recently favorited first)
    const bySkillId = new Map(items.map(i => [i.skillId, i]));
    const ordered = skillIds.flatMap(id => {
      const item = bySkillId.get(id);
      return item ? [item] : [];
    });

    return { items: ordered, total };
  }

  /** Throws ForbiddenException if the skill's owner does not belong to the given org. */
  private async assertSkillBelongsToOrg(skillId: string, orgId: string): Promise<void> {
    const result = await this.skillRepo.findSkillWithOwnerOrgId(skillId);
    if (!result) throw new NotFoundException(`Skill ${skillId} not found`);
    if (result.ownerOrgId !== orgId) {
      throw new ForbiddenException('Access denied');
    }
  }
}
