import {
  BadRequestException,
  ConflictException,
  ForbiddenException,
  Inject,
  Injectable,
  InternalServerErrorException,
  NotFoundException,
} from '@nestjs/common';
import { InjectDataSource } from '@nestjs/typeorm';
import { DataSource } from 'typeorm';
import {
  MARKETPLACE_LISTING_REPOSITORY,
  MARKETPLACE_REMOVAL_REQUEST_REPOSITORY,
  MARKETPLACE_SUBMISSION_REPOSITORY,
  ORGANIZATION_REPOSITORY,
  SKILL_REPOSITORY,
  type IMarketplaceListingRepository,
  type IMarketplaceRemovalRequestRepository,
  type IMarketplaceSubmissionRepository,
  type IOrganizationRepository,
  type ISkillRepository,
  type MarketplaceRemovalRequest,
  type MarketplaceSubmission,
  type UpsertMarketplaceListingData,
  type User,
} from '@skillspell/shared';
import { RequirementsCheckerService, SubmissionSnapshot } from './requirements-checker.service.js';
import type { SubmitSkillDto } from './dto/submit-skill.dto.js';
import { SubmissionRequirement } from '@skillspell/shared';

@Injectable()
export class MarketplaceSubmissionService {
  constructor(
    @Inject(MARKETPLACE_SUBMISSION_REPOSITORY)
    private readonly submissionRepo: IMarketplaceSubmissionRepository,
    @Inject(MARKETPLACE_LISTING_REPOSITORY)
    private readonly listingRepo: IMarketplaceListingRepository,
    @Inject(MARKETPLACE_REMOVAL_REQUEST_REPOSITORY)
    private readonly removalRequestRepo: IMarketplaceRemovalRequestRepository,
    @Inject(SKILL_REPOSITORY)
    private readonly skillRepo: ISkillRepository,
    @Inject(ORGANIZATION_REPOSITORY)
    private readonly orgRepo: IOrganizationRepository,
    // DataSource for wrapping multi-step state transitions in DB transactions
    @InjectDataSource()
    private readonly dataSource: DataSource,
    private readonly requirementsChecker: RequirementsCheckerService,
  ) {}

  /** Submit a skill version to the marketplace for admin review. */
  async submit(dto: SubmitSkillDto, user: User): Promise<MarketplaceSubmission> {
    const skill = await this.skillRepo.findById(dto.skillId);
    if (!skill) throw new NotFoundException('Skill not found');
    if (skill.ownerId !== user.id)
      throw new ForbiddenException('You do not have permission to submit this skill.');

    const existing = await this.submissionRepo.findBySkillId(dto.skillId);
    if (existing.some((s) => s.status === 'pending_review'))
      throw new ConflictException(
        'You already have a version pending review. Wait for admin decision before submitting another.',
      );
    if (existing.some((s) => s.status === 'approved' && s.version === dto.version))
      throw new ConflictException(
        'This version is already approved on the marketplace. Submit a newer version instead.',
      );

    // If submitting an older version than what is currently live, a reason is required
    const listing = await this.listingRepo.findBySkillId(dto.skillId);
    if (listing && listing.status === 'active' && parseInt(dto.version, 10) < listing.snapshotVersion) {
      if (!dto.submitterNote?.trim()) {
        throw new BadRequestException(
          `Version ${dto.version} is older than the current marketplace version (v${listing.snapshotVersion}). A reason is required to submit a downgrade.`,
        );
      }
    }

    const categories = await this.skillRepo.findCategorySlugsBySkillId(dto.skillId);

    // Fetch completed eval runs for checklist computation (non-blocking)
    let requirementsMet: SubmissionRequirement[] | null = null;
    try {
      const evalRows = await this.dataSource.query<Array<{ baselineGrading: unknown | null }>>(
        `SELECT "baselineGrading"
         FROM eval_runs
         WHERE "skillId" = $1 AND status = 'completed'`,
        [dto.skillId],
      );
      const snapshot: SubmissionSnapshot = {
        snapshotName: skill.name,
        snapshotDescription: skill.description ?? null,
        snapshotCategories: categories,
      };
      requirementsMet = this.requirementsChecker.evaluateFromSnapshot(snapshot, { evalRuns: evalRows });
    } catch {
      // checklist computation is best-effort; submission is never blocked by this
    }

    const submission = await this.submissionRepo.create({
      skillId: dto.skillId,
      version: dto.version,
      submittedBy: user.id,
      snapshotName: skill.name,
      snapshotDescription: skill.description ?? null,
      snapshotCategories: categories,
      submitterNote: dto.submitterNote?.trim() ?? null,
      requirementsMet,
    });
    await this.skillRepo.update(dto.skillId, { status: 'in_review' });
    return submission;
  }

  /** Approve a pending submission and upsert the marketplace listing. Admin only. */
  async approve(submissionId: string, admin: User): Promise<void> {
    // use org-scoped lookup so an admin who guesses a foreign-org submission UUID
    // gets a clean NotFoundException rather than a status-leaking ConflictException.
    const submission = await this.submissionRepo.findPendingByIdAndOrg(submissionId, admin.orgId);
    if (!submission) throw new NotFoundException('Submission not found or not pending in your org');

    // assertSkillBelongsToOrg returns { ownerOrgId } — single JOIN for both skill and org
    const { ownerOrgId } = await this.assertSkillBelongsToOrg(submission.skillId, admin.orgId);

    await this.assertNotSelfApproval(submission.submittedBy, admin);

    // verify the version snapshot exists before writing any state — prevents a
    // post-approval state where the skill appears in the browse list but 404s on detail.
    const parsedVersion = parseInt(submission.version!, 10);
    if (!isNaN(parsedVersion)) {
      const snapshot = await this.skillRepo.getVersionSnapshot(submission.skillId, parsedVersion);
      if (!snapshot)
        throw new BadRequestException(
          `Version snapshot v${parsedVersion} does not exist for this skill. The submitter must re-save the skill before it can be approved.`,
        );
    }

    // wrap multi-step state change in a transaction to prevent partial-failure
    // inconsistency (e.g. submission marked approved but listing upsert fails).
    const listingData = this.buildListingData(submission, ownerOrgId);
    const now = new Date();
    await this.dataSource.transaction(async (em) => {
      await em.query(
        `UPDATE marketplace_submissions
            SET status = 'approved', "reviewedBy" = $1, "reviewedAt" = $2
          WHERE id = $3`,
        [admin.id, now, submissionId],
      );
      // Upsert the listing — insert or update on skillId conflict
      await em.query(
        `INSERT INTO marketplace_listings
           ("skillId", "orgId", "submissionId", "snapshotName", "snapshotDescription",
            "snapshotCategories", "snapshotVersion", status, "firstApprovedAt", "lastApprovedAt")
         VALUES ($1, $2, $3, $4, $5, $6, $7, 'active', $8, $8)
         ON CONFLICT ("skillId") DO UPDATE SET
           "submissionId" = EXCLUDED."submissionId",
           "snapshotName" = EXCLUDED."snapshotName",
           "snapshotDescription" = EXCLUDED."snapshotDescription",
           "snapshotCategories" = EXCLUDED."snapshotCategories",
           "snapshotVersion" = EXCLUDED."snapshotVersion",
           status = 'active',
           "lastApprovedAt" = EXCLUDED."lastApprovedAt"`,
        [
          listingData.skillId,
          listingData.orgId,
          listingData.submissionId,
          listingData.snapshotName,
          listingData.snapshotDescription ?? null,
          listingData.snapshotCategories,
          listingData.snapshotVersion,
          now,
        ],
      );
      await em.query(
        `UPDATE skills SET status = 'published' WHERE id = $1`,
        [submission.skillId],
      );
    });
  }

  /** Reject a pending submission with an optional review note. Admin only. */
  async reject(submissionId: string, admin: User, reviewNote?: string): Promise<void> {
    // use org-scoped lookup (same as approve) to avoid info leakage on foreign-org IDs
    const submission = await this.submissionRepo.findPendingByIdAndOrg(submissionId, admin.orgId);
    if (!submission) throw new NotFoundException('Submission not found or not pending in your org');

    await this.assertSkillBelongsToOrg(submission.skillId, admin.orgId);

    await this.assertNotSelfApproval(submission.submittedBy, admin);

    await this.submissionRepo.updateStatus(submissionId, 'rejected', admin.id, reviewNote);
    // Restore 'published' if an older approved version is still live, otherwise 'ready'.
    const stillLive = await this.submissionRepo.findApprovedVersionsBySkillId(submission.skillId);
    await this.skillRepo.update(submission.skillId, {
      status: stillLive.length > 0 ? 'published' : 'ready',
    });
  }

  /**
   * Remove a single approved version. If it was the last version, the listing is
   * marked removed; otherwise the listing is updated to point at the previous version.
   * Admin only.
   */
  async removeVersion(submissionId: string, admin: User): Promise<void> {
    const submission = await this.submissionRepo.findById(submissionId);
    if (!submission) throw new NotFoundException('Submission not found');
    if (submission.status !== 'approved')
      throw new ConflictException('Only approved submissions can be removed');

    // assertSkillBelongsToOrg returns { ownerOrgId } — single JOIN for both skill and org
    const { ownerOrgId } = await this.assertSkillBelongsToOrg(submission.skillId, admin.orgId);

    // Verify the listing explicitly belongs to the admin's org, not just the skill owner
    const listing = await this.listingRepo.findBySkillId(submission.skillId);
    if (!listing || listing.orgId !== admin.orgId) {
      throw new ForbiddenException('Submission does not belong to your org marketplace.');
    }

    // Fetch remaining approved versions BEFORE the transaction (read-only, outside tx is fine)
    // We need this to determine the new listing state after removal.
    // pass orgId to scope the version lookup to the admin's org
    const allApproved = await this.submissionRepo.findApprovedVersionsBySkillId(submission.skillId, admin.orgId);
    const remaining = allApproved.filter(s => s.id !== submissionId);

    await this.removeApprovedVersionTx(submissionId, submission.skillId, ownerOrgId, admin.id, remaining, 'admin_policy');
  }

  /** Skill owner requests removal of their skill from the marketplace. */
  async requestRemoval(
    skillId: string,
    user: User,
    scope: 'skill' | 'version',
    targetSubmissionId?: string,
    reason?: string,
  ): Promise<void> {
    const skill = await this.skillRepo.findById(skillId);
    if (!skill) throw new NotFoundException('Skill not found');
    if (skill.ownerId !== user.id)
      throw new ForbiddenException('You do not have permission to request removal of this skill.');

    const listing = await this.listingRepo.findBySkillId(skillId);
    // assert listing belongs to the caller's org — findBySkillId is not org-scoped,
    // so in multi-org or data-inconsistency scenarios a foreign-org listing could be returned.
    if (!listing || listing.orgId !== user.orgId || listing.status === 'removed')
      throw new BadRequestException('This skill is not on the marketplace.');

    const hasPending = await this.removalRequestRepo.hasPendingForSkill(skillId);
    if (hasPending)
      throw new ConflictException('A removal request is already pending admin review.');

    if (scope === 'version') {
      if (!targetSubmissionId) throw new BadRequestException('targetSubmissionId is required for version scope.');
      const target = await this.submissionRepo.findById(targetSubmissionId);
      if (!target || target.skillId !== skillId || target.status !== 'approved')
        throw new NotFoundException('Target submission not found or not an approved version of this skill.');
    }

    try {
      await this.dataSource.transaction(async (em) => {
        await em.query(
          `INSERT INTO marketplace_removal_requests
             (id, "skillId", scope, "targetSubmissionId", reason, "submittedBy", status, "createdAt")
           VALUES (gen_random_uuid(), $1, $2, $3, $4, $5, 'pending', now())`,
          [skillId, scope, scope === 'version' ? (targetSubmissionId ?? null) : null, reason ?? null, user.id],
        );
        await em.query(
          `UPDATE marketplace_listings
              SET status = 'removal_requested', "removalReason" = $1
            WHERE "skillId" = $2`,
          [reason ?? null, skillId],
        );
      });
    } catch (err: unknown) {
      if ((err as { code?: string }).code === '23505') {
        throw new ConflictException('A removal request is already pending admin review.');
      }
      throw err;
    }
  }

  /** Admin approves an owner's removal request — removes approved versions and the listing. */
  async approveRemoval(removalRequestId: string, admin: User): Promise<void> {
    const removalRequest = await this.removalRequestRepo.findById(removalRequestId);
    if (!removalRequest) throw new NotFoundException('Removal request not found');
    if (removalRequest.status !== 'pending')
      throw new ConflictException('Not a pending removal request');

    const { ownerOrgId } = await this.assertSkillBelongsToOrg(removalRequest.skillId, admin.orgId);

    await this.assertNotSelfApproval(removalRequest.submittedBy, admin);

    const now = new Date();

    if (removalRequest.scope === 'version') {
      const submission = await this.submissionRepo.findById(removalRequest.targetSubmissionId!);
      this.assertApprovedVersionOfSkill(submission, removalRequest.skillId);

      const listing = await this.listingRepo.findBySkillId(removalRequest.skillId);
      if (!listing || listing.orgId !== admin.orgId)
        throw new ForbiddenException('Listing does not belong to your org.');

      const allApproved = await this.submissionRepo.findApprovedVersionsBySkillId(
        removalRequest.skillId, admin.orgId,
      );
      const remaining = allApproved.filter((s) => s.id !== removalRequest.targetSubmissionId);

      // Pass removalRequestId so the removal request is marked approved atomically inside the tx.
      await this.removeApprovedVersionTx(
        removalRequest.targetSubmissionId!,
        removalRequest.skillId,
        ownerOrgId,
        admin.id,
        remaining,
        'owner_request',
        removalRequestId,
      );
    } else {
      // Fix m2: verify listing ownership for skill-scope before transacting
      const listing = await this.listingRepo.findBySkillId(removalRequest.skillId);
      if (!listing || listing.orgId !== admin.orgId) {
        throw new ForbiddenException('Listing does not belong to your org marketplace.');
      }

      await this.dataSource.transaction(async (em) => {
        await em.query(
          `UPDATE marketplace_submissions
              SET status = 'removed', "reviewedBy" = $1, "reviewedAt" = $2
            WHERE "skillId" = $3 AND status = 'approved'`,
          [admin.id, now, removalRequest.skillId],
        );
        await em.query(
          `UPDATE marketplace_listings
              SET status = 'removed', "removedBy" = $1, "removalType" = 'owner_request'
            WHERE "skillId" = $2`,
          [admin.id, removalRequest.skillId],
        );
        await em.query(
          `UPDATE skills SET status = 'ready' WHERE id = $1`,
          [removalRequest.skillId],
        );
        // Fix m1: mark removal request approved atomically inside the transaction so a
        // failure between the tx and a post-tx call cannot leave the request 'pending'
        // with the listing already removed.
        await em.query(
          `UPDATE marketplace_removal_requests
              SET status = 'approved', "reviewedBy" = $1, "reviewedAt" = $2
            WHERE id = $3`,
          [admin.id, now, removalRequestId],
        );
      });
    }
  }

  /** Admin rejects an owner's removal request — listing reverts to active. */
  async rejectRemoval(removalRequestId: string, admin: User): Promise<void> {
    const removalRequest = await this.removalRequestRepo.findById(removalRequestId);
    if (!removalRequest) throw new NotFoundException('Removal request not found');
    if (removalRequest.status !== 'pending')
      throw new ConflictException('Not a pending removal request');

    await this.assertSkillBelongsToOrg(removalRequest.skillId, admin.orgId);

    await this.assertNotSelfApproval(removalRequest.submittedBy, admin);

    await this.removalRequestRepo.updateStatus(removalRequestId, 'rejected', admin.id);
    const listing = await this.listingRepo.findBySkillId(removalRequest.skillId);
    if (listing && listing.status === 'removal_requested') {
      await this.listingRepo.setStatus(removalRequest.skillId, 'active');
      await this.skillRepo.update(removalRequest.skillId, { status: 'published' });
    }
  }

  /** Return all pending_review submissions for admin's org. Admin only. */
  async listPendingSubmissions(admin: User): Promise<MarketplaceSubmission[]> {
    return this.submissionRepo.findPendingByOrg(admin.orgId);
  }

  /** Return all pending removal requests for admin's org. Admin only. */
  async listRemovalRequests(admin: User): Promise<MarketplaceRemovalRequest[]> {
    return this.removalRequestRepo.findPendingByOrg(admin.orgId);
  }

  /** Return all submissions made by the authenticated user. */
  async findMySubmissions(user: User): Promise<MarketplaceSubmission[]> {
    return this.submissionRepo.findBySubmittedBy(user.id);
  }

  /** Return the submission eligibility requirements for a skill. */
  async getEligibility(skillId: string, user: User): Promise<SubmissionRequirement[]> {
    await this.assertSkillBelongsToOrg(skillId, user.orgId);

    const [evalRows, skill, existing] = await Promise.all([
      this.dataSource.query<Array<{ baselineGrading: unknown | null }>>(
        `SELECT "baselineGrading"
         FROM eval_runs
         WHERE "skillId" = $1 AND status = 'completed'`,
        [skillId],
      ),
      this.skillRepo.findById(skillId),
      this.submissionRepo.findBySkillId(skillId),
    ]);

    const requirements = this.requirementsChecker.evaluate({ evalRuns: evalRows });

    // Surface "already approved" as a failed requirement so the UI blocks
    // submission before the user hits a runtime error.
    const currentVersion = String(skill?.version ?? '');
    const isAlreadyApproved =
      currentVersion !== '' &&
      existing.some((s) => s.status === 'approved' && s.version === currentVersion);

    requirements.push({
      id: 'version_not_approved',
      label: isAlreadyApproved
        ? 'This version is already live on the marketplace'
        : 'Version not yet published',
      hint: 'Make changes to the skill to create a new version, then submit again.',
      met: !isAlreadyApproved,
      required: true,
    });

    return requirements;
  }

  // ─── Private helpers ──────────────────────────────────────────────────────

  /**
   * Assert the skill's owner belongs to the given org.
   * Returns { ownerOrgId } so callers can build listing data without a second DB hit.
   * Uses a single JOIN query instead of two serial lookups.
   */
  private async assertSkillBelongsToOrg(
    skillId: string,
    orgId: string,
  ): Promise<{ ownerOrgId: string }> {
    const result = await this.skillRepo.findSkillWithOwnerOrgId(skillId);
    if (!result) throw new NotFoundException('Skill not found');
    if (result.ownerOrgId !== orgId)
      throw new ForbiddenException('You can only manage submissions from your organization.');
    return { ownerOrgId: result.ownerOrgId };
  }

  /** Single source of truth for building listing upsert data from a submission snapshot. */
  private buildListingData(
    submission: MarketplaceSubmission,
    orgId: string,
  ): UpsertMarketplaceListingData {
    if (!submission.version) {
      throw new InternalServerErrorException(
        `Submission ${submission.id} has no version — cannot build listing data`,
      );
    }
    return {
      skillId: submission.skillId,
      orgId,
      submissionId: submission.id,
      snapshotName: submission.snapshotName ?? '',
      snapshotDescription: submission.snapshotDescription ?? null,
      snapshotCategories: submission.snapshotCategories ?? [],
      snapshotVersion: parseInt(submission.version, 10),
    };
  }

  /**
   * Assert that a submission is a valid approved version of the given skill.
   * Unifies the guard used in requestRemoval (scope=version) and approveRemoval (scope=version).
   * wrong target = not found, not a conflict.
   */
  private assertApprovedVersionOfSkill(
    target: MarketplaceSubmission | null,
    skillId: string,
  ): void {
    if (!target || target.skillId !== skillId || target.status !== 'approved')
      throw new NotFoundException(
        'Target submission not found or not an approved version of this skill.',
      );
  }

  /**
   * Assert the admin is not self-approving/rejecting when the org forbids it.
   * Skips the org lookup entirely when submitterId !== admin.id (the common case).
   */
  private async assertNotSelfApproval(submitterId: string, admin: User): Promise<void> {
    if (submitterId === admin.id) {
      const org = await this.orgRepo.findById(admin.orgId);
      if (!org?.marketplaceAllowSelfApproval)
        throw new ForbiddenException('You cannot approve or reject your own submission.');
    }
  }

  /**
   * Shared transaction body for removing a single approved submission version.
   * Called by both removeVersion (admin_policy) and approveRemoval scope=version (owner_request).
   * Preconditions (org scope, listing ownership, submission validity) are the caller's responsibility.
   *
   * @param removalRequestId - when provided (approveRemoval scope=version), marks the removal
   *   request approved atomically inside the transaction so partial failures cannot leave the
   *   request in 'pending' with the listing already removed.
   */
  private async removeApprovedVersionTx(
    submissionId: string,
    skillId: string,
    ownerOrgId: string,
    adminId: string,
    remaining: MarketplaceSubmission[],
    removalType: 'admin_policy' | 'owner_request',
    removalRequestId?: string,
  ): Promise<void> {
    const now = new Date();
    await this.dataSource.transaction(async (em) => {
      await em.query(
        `UPDATE marketplace_submissions
            SET status = 'removed', "reviewedBy" = $1, "reviewedAt" = $2
          WHERE id = $3`,
        [adminId, now, submissionId],
      );

      if (remaining.length === 0) {
        await em.query(
          `UPDATE marketplace_listings
              SET status = 'removed', "removedBy" = $1, "removalType" = $2
            WHERE "skillId" = $3`,
          [adminId, removalType, skillId],
        );
        await em.query(
          `UPDATE skills SET status = 'ready' WHERE id = $1`,
          [skillId],
        );
      } else {
        const prev = remaining[0];
        const prevData = this.buildListingData(prev, ownerOrgId);
        await em.query(
          `UPDATE marketplace_listings SET
             "submissionId" = $1,
             "snapshotName" = $2,
             "snapshotDescription" = $3,
             "snapshotCategories" = $4,
             "snapshotVersion" = $5,
             status = 'active',
             "lastApprovedAt" = $6
           WHERE "skillId" = $7`,
          [
            prevData.submissionId,
            prevData.snapshotName,
            prevData.snapshotDescription ?? null,
            prevData.snapshotCategories,
            prevData.snapshotVersion,
            now,
            skillId,
          ],
        );
      }

      if (removalRequestId) {
        await em.query(
          `UPDATE marketplace_removal_requests
              SET status = 'approved', "reviewedBy" = $1, "reviewedAt" = $2
            WHERE id = $3`,
          [adminId, now, removalRequestId],
        );
      }
    });
  }
}
