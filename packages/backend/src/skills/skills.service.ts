import {
  Injectable,
  Inject,
  NotFoundException,
  ConflictException,
  ForbiddenException,
  BadRequestException,
  Logger,
} from '@nestjs/common';
import {
  SKILL_REPOSITORY,
  type ISkillRepository,
  SESSION_REPOSITORY,
  type ISessionRepository,
  EVAL_REPOSITORY,
  type IEvalRepository,
  MARKETPLACE_SUBMISSION_REPOSITORY,
  type IMarketplaceSubmissionRepository,
  MARKETPLACE_LISTING_REPOSITORY,
  type IMarketplaceListingRepository,
  MARKETPLACE_REMOVAL_REQUEST_REPOSITORY,
  type IMarketplaceRemovalRequestRepository,
  SKILL_CATEGORY_REPOSITORY,
  type ISkillCategoryRepository,
  CATEGORY_REPOSITORY,
  type ICategoryRepository,
  type Skill,
  type SkillSummary,
  type CreateSkillData,
  type UpdateSkillData,
  type SkillVersionSnapshot,
  type SkillVersionSummary,
  type ApproveOptimizationRequest,
} from '@skillspell/shared';
import { UpdateSkillMetadataDto } from './dto/update-skill-metadata.dto.js';
import { RequestContext } from '../common/context/request-context.service.js';
import { updateFrontMatterName } from '../common/utils/skill-content.utils.js';
import { normalizeLiteralNewlines } from '../generation/prompts/llm-response-parser.js';
import { GenerationService } from '../generation/generation.service.js';

@Injectable()
export class SkillsService {
  private readonly logger = new Logger(SkillsService.name);

  constructor(
    @Inject(SKILL_REPOSITORY)
    private readonly skillRepo: ISkillRepository,
    @Inject(SESSION_REPOSITORY)
    private readonly sessionRepo: ISessionRepository,
    @Inject(EVAL_REPOSITORY)
    private readonly evalRepo: IEvalRepository,
    private readonly ctx: RequestContext,
    private readonly generationService: GenerationService,
    @Inject(MARKETPLACE_SUBMISSION_REPOSITORY)
    private readonly marketplaceSubmissionRepo: IMarketplaceSubmissionRepository,
    @Inject(MARKETPLACE_LISTING_REPOSITORY)
    private readonly marketplaceListingRepo: IMarketplaceListingRepository,
    @Inject(SKILL_CATEGORY_REPOSITORY)
    private readonly skillCategoryRepo: ISkillCategoryRepository,
    @Inject(CATEGORY_REPOSITORY)
    private readonly categoryRepo: ICategoryRepository,
    @Inject(MARKETPLACE_REMOVAL_REQUEST_REPOSITORY)
    private readonly removalRequestRepo: IMarketplaceRemovalRequestRepository,
  ) {}

  /* ------------------------------------------------------------------ */
  /*  FIND                                                               */
  /* ------------------------------------------------------------------ */

  async findAll(): Promise<SkillSummary[]> {
    return this.skillRepo.findByOwner(this.ctx.userId);
  }

  /**
   * Discover skills for an authenticated user.
   *
   * Returns two categories merged into a single deduplicated list:
   *   1. All published skills (isPublished = true) from any owner.
   *   2. All skills owned by the calling user regardless of publish state.
   *
   * This is the correct authenticated list view: the caller sees everything
   * public plus their own private work, but never another user's private skills.
   *
   * Deduplication is by skill id — the caller's own published skills appear
   * once even though they qualify under both categories.
   *
   * Pagination (limit/offset) and optional name search are applied to the
   * published half only (consistent with the public endpoint behaviour).
   * The caller's own skills are returned in full (they are bounded by ownership).
   */
  async discover(
    limit: number,
    offset: number,
    search?: string,
  ): Promise<SkillSummary[]> {
    const [published, own] = await Promise.all([
      this.skillRepo.findPublished(limit, offset, search),
      this.skillRepo.findByOwner(this.ctx.userId),
    ]);

    // Merge: start with published, then append own skills that aren't already present.
    const seen = new Set<string>(published.map((s) => s.id));
    const merged: SkillSummary[] = [...published];

    for (const skill of own) {
      if (!seen.has(skill.id)) {
        merged.push(skill);
        seen.add(skill.id);
      }
    }

    return merged;
  }

  /**
   * Get lightweight skill metadata (no heavy content fields).
   * Always reconciles skill.status against the live marketplace listing so
   * stale DB state (e.g. status='ready' after a reject() left an approved
   * version still on the marketplace) is corrected on read.
   *
   * Returns:
   *  - publishedVersion: the version currently live on the marketplace listing
   *  - approvedVersions: all versions with an approved submission (for historical view badges)
   *
   * Status priority:
   *  - 'in_review' always wins — a pending submission is visible regardless of listing state
   *  - Active listing → status='published', healing any stale 'ready'/'draft'
   *  - Otherwise return skill.status as-is
   */
  async getMetadata(id: string): Promise<SkillSummary> {
    const meta = await this.skillRepo.findMetadataById(id);
    if (!meta) {
      throw new NotFoundException(`Skill with id "${id}" not found`);
    }
    // Fetch listing + approved versions in parallel — status can drift out of sync.
    const [listing, approvedSubmissions] = await Promise.all([
      this.marketplaceListingRepo.findBySkillId(id),
      this.marketplaceSubmissionRepo.findApprovedVersionsBySkillId(id),
    ]);
    const approvedVersions = approvedSubmissions
      .map(s => parseInt(s.version ?? '', 10))
      .filter(v => !isNaN(v));

    if (listing?.status === 'active') {
      const resolvedStatus = meta.status === 'in_review' ? 'in_review' : 'published';
      return { ...meta, status: resolvedStatus, publishedVersion: listing.snapshotVersion, approvedVersions };
    }
    return approvedVersions.length > 0 ? { ...meta, approvedVersions } : meta;
  }

  /**
   * Get full skill detail (including content fields).
   *
   * Always fetches from the database — does NOT use ctx.skill since
   * the guard now only stores lightweight metadata.
   */
  async findById(id: string): Promise<Skill> {
    const fetched = await this.skillRepo.findById(id);
    if (!fetched) {
      throw new NotFoundException(`Skill with id "${id}" not found`);
    }
    return fetched;
  }

  /* ------------------------------------------------------------------ */
  /*  NAME CHECK                                                         */
  /* ------------------------------------------------------------------ */

  /**
   * Check whether a skill with the given name already exists for the current owner.
   * Returns `true` if the name is taken, `false` otherwise.
   * Optionally accepts `excludeId` to ignore a specific skill (for rename checks).
   */
  async nameExists(name: string, excludeId?: string): Promise<boolean> {
    const existing = await this.skillRepo.findByName(name, this.ctx.userId);
    if (!existing) return false;
    // If we're updating a skill, ignore the skill itself
    if (excludeId && existing.id === excludeId) return false;
    return true;
  }

  /* ------------------------------------------------------------------ */
  /*  CREATE                                                             */
  /* ------------------------------------------------------------------ */

  async create(data: Omit<CreateSkillData, 'ownerId'>): Promise<Skill> {
    // Fast-path uniqueness check; the DB unique constraint is the authoritative guard.
    const taken = await this.nameExists(data.name);
    if (taken) {
      throw new ConflictException(
        `A skill named "${data.name}" already exists. Please choose a different name.`,
      );
    }

    try {
      const created = await this.skillRepo.create({
        ...data,
        ownerId: this.ctx.userId,
      });
      this.triggerDiagramPreGeneration(created.id);
      return created;
    } catch (error: unknown) {
      const err = error as Record<string, unknown>;
      if (err?.code === '23505' || err?.name === 'ConditionalCheckFailedException') {
        throw new ConflictException(
          `A skill named "${data.name}" already exists. Please choose a different name.`,
        );
      }
      throw error;
    }
  }

  /* ------------------------------------------------------------------ */
  /*  UPDATE                                                             */
  /* ------------------------------------------------------------------ */

  async update(id: string, data: UpdateSkillData): Promise<Skill> {
    // Check name uniqueness when renaming (ignore the skill itself).
    if (data.name !== undefined) {
      const taken = await this.nameExists(data.name, id);
      if (taken) {
        throw new ConflictException(
          `A skill named "${data.name}" already exists. Please choose a different name.`,
        );
      }
    }

    // Guard has verified ownership (ctx.skill is metadata-only).
    // Fetch full skill only when we need to update front-matter name.
    if (data.name !== undefined && !data.skillContent) {
      const existing = await this.skillRepo.findById(id);
      if (existing?.skillContent) {
        const updatedContent = updateFrontMatterName(
          existing.skillContent,
          data.name,
        );
        if (updatedContent !== existing.skillContent) {
          data = { ...data, skillContent: updatedContent };
        }
      }
    }
    return this.skillRepo.update(id, data);
  }

  /* ------------------------------------------------------------------ */
  /*  DELETE                                                             */
  /* ------------------------------------------------------------------ */

  async delete(id: string): Promise<void> {
    // Prevent deletion of marketplace-active skills.
    const active = await this.marketplaceSubmissionRepo.findActiveBySkillId(id);
    const approved = active.find((s) => s.status === 'approved');
    const removalPending = await this.removalRequestRepo.hasPendingForSkill(id);
    const pendingReview = active.find((s) => s.status === 'pending_review');

    if (approved) {
      throw new BadRequestException(
        'This skill is published on the marketplace. Request removal before deleting.',
      );
    }
    if (removalPending) {
      throw new BadRequestException(
        'A marketplace removal request is pending admin review. You cannot delete this skill until it is resolved.',
      );
    }
    if (pendingReview) {
      throw new ForbiddenException(
        'Cannot delete a skill with pending or approved marketplace submissions. ' +
        'An org admin must remove it from the marketplace first.',
      );
    }

    // Guard has already verified ownership.
    //
    // All child tables (eval_cases, eval_runs, eval_feedback, eval_benchmarks,
    // session_messages, skill_versions, skill_diagrams) have ON DELETE CASCADE
    // FKs pointing to skills, so deleting the skill row cascades to all related
    // rows automatically. The explicit per-table cleanups below run first and
    // are defensive no-ops under CASCADE.
    const cleanups: Array<{ label: string; fn: () => Promise<void> }> = [
      { label: 'eval runs',           fn: () => this.evalRepo.deleteEvalRunsBySkill(id) },
      { label: 'eval feedback',       fn: () => this.evalRepo.deleteFeedbackBySkill(id) },
      { label: 'eval cases',          fn: () => this.evalRepo.deleteEvalCasesBySkill(id) },
      { label: 'benchmark snapshots', fn: () => this.evalRepo.deleteBenchmarkSnapshots(id) },
      { label: 'session messages',    fn: () => this.sessionRepo.deleteSession(id) },
    ];

    for (const { label, fn } of cleanups) {
      try {
        await fn();
      } catch (err) {
        this.logger.warn(`Failed to delete ${label} for skill ${id}: ${err}`);
      }
    }

    // Delete the skill itself (Postgres CASCADE handles any remaining children).
    await this.skillRepo.delete(id);
  }

  /* ------------------------------------------------------------------ */
  /*  PUBLISH TOGGLE                                                     */
  /* ------------------------------------------------------------------ */

  /**
   * Toggle the isPublished flag on a skill.
   * Guard has already verified ownership before this method is called.
   */
  async publish(id: string, isPublished: boolean): Promise<Skill> {
    const existing = await this.skillRepo.findById(id);
    if (!existing) {
      throw new NotFoundException(`Skill with id "${id}" not found`);
    }
    return this.skillRepo.update(id, { isPublished });
  }

  /* ------------------------------------------------------------------ */
  /*  VERSION HISTORY                                                    */
  /* ------------------------------------------------------------------ */

  /**
   * List all version summaries for a skill.
   * If the current version doesn't have a stored snapshot yet,
   * it's automatically saved and included in the list.
   */
  async getVersionHistory(skillId: string): Promise<SkillVersionSummary[]> {
    const meta = await this.skillRepo.findMetadataById(skillId);
    if (!meta) {
      throw new NotFoundException(`Skill with id "${skillId}" not found`);
    }

    // Ensure the current version has a snapshot
    const snapshots = await this.skillRepo.getVersionHistory(skillId);
    const hasCurrentVersion = snapshots.some(
      (s) => s.version === meta.version,
    );

    if (!hasCurrentVersion) {
      // Need full skill to save a version snapshot (requires content fields)
      const fullSkill = await this.skillRepo.findById(skillId);
      if (fullSkill) {
        await this.skillRepo.saveVersionSnapshot(fullSkill);
      }
      // Re-query to include the new snapshot
      return this.skillRepo.getVersionHistory(skillId);
    }

    return snapshots;
  }

  /** Get a full version snapshot. */
  async getVersionSnapshot(
    skillId: string,
    version: number,
  ): Promise<SkillVersionSnapshot> {
    // Guard has already verified ownership

    const snapshot = await this.skillRepo.getVersionSnapshot(skillId, version);
    if (!snapshot) {
      throw new NotFoundException(
        `Version ${version} not found for skill "${skillId}"`,
      );
    }
    return snapshot;
  }

  /* ------------------------------------------------------------------ */
  /*  APPROVE OPTIMIZATION                                               */
  /* ------------------------------------------------------------------ */

  /**
   * Apply an approved optimization draft as a new skill version.
   *
   * This is the final step of the draft-based optimization flow:
   * 1. User iterates with optimize-draft (no DB writes)
   * 2. User clicks "Approve" -> this method is called
   * 3. Pre-refinement snapshot is saved (if missing)
   * 4. Skill is updated AND version is incremented atomically
   * 5. Post-refinement snapshot is saved
   *
   * Result: exactly ONE new version regardless of how many draft iterations.
   */
  async approveOptimization(
    skillId: string,
    data: ApproveOptimizationRequest,
  ): Promise<Skill> {
    const meta = await this.skillRepo.findMetadataById(skillId);
    if (!meta) {
      throw new NotFoundException(`Skill with id "${skillId}" not found`);
    }

    // Save a snapshot of the CURRENT (pre-optimization) state if one doesn't exist yet.
    const existingSnapshots = await this.skillRepo.getVersionHistory(skillId);
    const hasCurrentVersionSnapshot = existingSnapshots.some(
      (s) => s.version === meta.version,
    );
    if (!hasCurrentVersionSnapshot) {
      // Need full skill to save a version snapshot (requires content fields)
      const fullSkill = await this.skillRepo.findById(skillId);
      if (fullSkill) {
        await this.skillRepo.saveVersionSnapshot(fullSkill);
      }
    }

    // Atomically update fields AND increment version in a single database call.
    // Name is intentionally preserved from the existing skill — it is managed
    // separately via the skill update endpoint, not through optimization.
    const updatePayload: UpdateSkillData = {
      description: data.description,
      skillContent: normalizeLiteralNewlines(data.skillContent),
      scripts: data.scripts,
      references: data.references,
      assets: data.assets,
    };
    // Only include name if explicitly provided (backward compatibility)
    if (data.name !== undefined) {
      updatePayload.name = data.name;
    }
    const updated = await this.skillRepo.updateAndIncrementVersion(skillId, updatePayload);

    // Save a version snapshot of the NEW state (after increment)
    await this.skillRepo.saveVersionSnapshot(updated, data.explanation);

    // Fire-and-forget: pre-generate diagram for the new version
    this.triggerDiagramPreGeneration(skillId, true);

    this.logger.log(
      `Approved optimization for skill "${updated.name}" -> v${updated.version} (${skillId})`,
    );

    return updated;
  }

  /* ------------------------------------------------------------------ */
  /*  TAXONOMY ASSIGNMENT                                                */
  /* ------------------------------------------------------------------ */

  /**
   * Set category assignments for a skill.
   * Replaces all existing category associations with the provided IDs.
   * Passing an empty array removes all category assignments.
   */
  async setTaxonomy(
    skillId: string,
    dto: UpdateSkillMetadataDto,
  ): Promise<{ categoryIds: string[] }> {
    const categoryIds = dto.categoryIds ?? [];
    await this.skillCategoryRepo.setForSkill(skillId, categoryIds);
    return { categoryIds };
  }

  /**
   * Get the current category assignments for a skill.
   */
  async getTaxonomy(
    skillId: string,
  ): Promise<{ categories: { id: string; name: string }[] }> {
    const skillCats = await this.skillCategoryRepo.findBySkillId(skillId);
    if (skillCats.length === 0) return { categories: [] };
    // Batch all category lookups into a single IN query
    const categories = await this.categoryRepo.findByIds(skillCats.map((sc) => sc.categoryId));
    return {
      categories: categories.map((c) => ({ id: c.id, name: c.name })),
    };
  }

  private triggerDiagramPreGeneration(skillId: string, force = false): void {
    setImmediate(() => {
      this.generationService.generateDiagram(skillId, force).catch((err) =>
        this.logger.error(`Pre-generation failed for skill "${skillId}": ${err}`),
      );
    });
  }
}
