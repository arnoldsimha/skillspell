import { Injectable } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository, In } from 'typeorm';
import type {
  IMarketplaceSubmissionRepository,
  MarketplaceSubmission,
  MarketplaceSubmissionStatus,
  CreateMarketplaceSubmissionData,
  MarketplaceListItem,
  FindApprovedByOrgOptions,
  SubmissionRequirement,
} from '@skillspell/shared';
import {
  MarketplaceSubmissionEntity,
  MarketplaceSubmissionStatus as EntityStatus,
} from '../entities/marketplace-submission.entity';

@Injectable()
export class PostgresMarketplaceSubmissionRepository
  implements IMarketplaceSubmissionRepository
{
  constructor(
    @InjectRepository(MarketplaceSubmissionEntity)
    private readonly repo: Repository<MarketplaceSubmissionEntity>,
  ) {}

  async create(data: CreateMarketplaceSubmissionData): Promise<MarketplaceSubmission> {
    const entity = this.repo.create({
      skillId: data.skillId,
      version: data.version,
      submittedBy: data.submittedBy,
      snapshotName: data.snapshotName,
      snapshotDescription: data.snapshotDescription ?? null,
      snapshotCategories: data.snapshotCategories,
      submitterNote: data.submitterNote ?? null,
      requirementsMet: data.requirementsMet ?? null,
    });
    const saved = await this.repo.save(entity);
    return this.toSubmission(saved);
  }

  async findById(id: string): Promise<MarketplaceSubmission | null> {
    const entity = await this.repo.findOneBy({ id });
    return entity ? this.toSubmission(entity) : null;
  }

  async findBySkillId(skillId: string): Promise<MarketplaceSubmission[]> {
    const entities = await this.repo.find({
      where: { skillId },
      order: { submittedAt: 'DESC' },
    });
    return entities.map((e) => this.toSubmission(e));
  }

  async findActiveBySkillId(skillId: string): Promise<MarketplaceSubmission[]> {
    const entities = await this.repo.find({
      where: {
        skillId,
        status: In(['pending_review', 'approved']),
      },
    });
    return entities.map((e) => this.toSubmission(e));
  }

  async findBySubmittedBy(userId: string): Promise<MarketplaceSubmission[]> {
    const entities = await this.repo.find({
      where: { submittedBy: userId },
      order: { submittedAt: 'DESC' },
    });
    return entities.map((e) => this.toSubmission(e));
  }

  async updateStatus(
    id: string,
    status: MarketplaceSubmissionStatus,
    reviewedBy?: string,
    reviewNote?: string,
  ): Promise<void> {
    const patch: Partial<MarketplaceSubmissionEntity> = {
      status: status as any,
      reviewedAt: new Date(), // always update — reflects the current action's timestamp
    };
    if (reviewedBy !== undefined) patch.reviewedBy = reviewedBy;
    if (reviewNote !== undefined) patch.reviewNote = reviewNote;
    await this.repo.update(id, patch);
  }

  async removeAllApprovedBySkillId(skillId: string, reviewedBy: string): Promise<void> {
    await this.repo.update(
      { skillId, status: 'approved' as any },
      { status: 'removed' as any, reviewedBy, reviewedAt: new Date() },
    );
  }

  async findPendingByOrg(orgId: string): Promise<MarketplaceSubmission[]> {
    // IN-001: uses shared buildEnrichedSubmissionQb base
    const rows = await this.buildEnrichedSubmissionQb(orgId)
      .where('ms.status = :status', { status: 'pending_review' })
      .andWhere('u."orgId" = :orgId', { orgId })
      .orderBy('ms."submittedAt"', 'DESC')
      .getRawMany();
    return rows.map((r) => this.toEnrichedSubmission(r));
  }

  async findApprovedByOrg(orgId: string, opts: FindApprovedByOrgOptions): Promise<MarketplaceListItem[]> {
    const limit = opts.limit ?? 20;
    const offset = opts.offset ?? 0;

    // TypeORM's query builder doesn't support PostgreSQL's DISTINCT ON syntax,
    // so we use a raw query here.
    const sqlParams: unknown[] = [orgId];
    let whereExtra = '';

    if (opts.search) {
      sqlParams.push(`%${opts.search}%`);
      whereExtra += ` AND ms.snapshot_name ILIKE $${sqlParams.length}`;
    }
    if (opts.categories && opts.categories.length > 0) {
      sqlParams.push(opts.categories);
      whereExtra += ` AND EXISTS (
        SELECT 1 FROM skill_categories sc2
          JOIN categories c2 ON c2.id = sc2."categoryId"
         WHERE sc2."skillId" = ms."skillId" AND c2.slug = ANY($${sqlParams.length})
      )`;
    }

    sqlParams.push(limit, offset);
    const limitIdx = sqlParams.length - 1;
    const offsetIdx = sqlParams.length;

    const sql = `
      SELECT DISTINCT ON (ms."skillId")
        ms.id                                                          AS "submissionId",
        ms."skillId"                                                   AS "skillId",
        ms.version                                                     AS version,
        ms."submittedAt"                                               AS "submittedAt",
        ms."reviewedAt"                                                AS "reviewedAt",
        ms."submittedBy"                                               AS "submittedBy",
        ms."reviewedAt"                                                AS "reviewedAt",
        ms.snapshot_name                                               AS name,
        ms.snapshot_description                                        AS description,
        submitter."firstName" || ' ' || submitter."lastName"          AS "submittedByName",
        (SELECT COUNT(*)::int FROM skill_download_events sde
           WHERE sde."skillId" = ms."skillId")                        AS "downloadCount",
        COALESCE((SELECT array_agg(c.slug)
                    FROM skill_categories sc
                    JOIN categories c ON c.id = sc."categoryId"
                   WHERE sc."skillId" = ms."skillId"), '{}')          AS categories
      FROM   marketplace_submissions ms
      INNER  JOIN skills   s        ON s.id       = ms."skillId"
      INNER  JOIN users    u        ON u.id        = s."ownerId"
      LEFT   JOIN users    submitter ON submitter.id = ms."submittedBy"
      WHERE  ms.status = 'approved'
        AND  u."orgId" = $1
        ${whereExtra}
      ORDER  BY ms."skillId", ms."submittedAt" DESC
      LIMIT  $${limitIdx} OFFSET $${offsetIdx}
    `;

    interface ApprovedRow {
      submissionId: string;
      skillId: string;
      version: string | number;
      submittedAt: Date | string;
      reviewedAt: Date | string | null;
      submittedBy: string;
      name: string;
      description: string;
      submittedByName: string | null;
      downloadCount: number | string;
      categories: string[] | null;
    }
    const rows: ApprovedRow[] = await this.repo.manager.query(sql, sqlParams);
    const toIso = (v: Date | string | null | undefined): string | null =>
      v == null ? null : v instanceof Date ? v.toISOString() : String(v);
    return rows.map((r) => ({
      submissionId: r.submissionId,
      skillId: r.skillId,
      version: String(r.version),
      name: r.name,
      description: r.description,
      categories: r.categories ?? [],
      downloadCount: Number(r.downloadCount ?? 0),
      submittedAt: toIso(r.submittedAt) ?? '',
      reviewedAt: toIso(r.reviewedAt),
      submittedBy: r.submittedBy,
      submittedByName: r.submittedByName ?? undefined,
      upvoteCount: 0,
      isUpvoted: false,
      isFavorited: false,
    }));
  }

  async findApprovedCountByOrg(
    orgId: string,
    opts: Pick<FindApprovedByOrgOptions, 'search' | 'categories'>,
  ): Promise<number> {
    const qb = this.repo
      .createQueryBuilder('ms')
      .innerJoin('skills', 's', 's.id = ms."skillId"')
      .innerJoin('users', 'u', 'u.id = s."ownerId"')
      .where('ms.status = :status', { status: 'approved' })
      .andWhere('u."orgId" = :orgId', { orgId });

    if (opts.search) {
      // Use snapshot_name (not s.name) to match findApprovedByOrg — prevents
      // count/data divergence after a skill is renamed post-approval.
      qb.andWhere('ms.snapshot_name ILIKE :search', { search: `%${opts.search}%` });
    }
    if (opts.categories && opts.categories.length > 0) {
      qb.andWhere(
        `EXISTS (SELECT 1 FROM skill_categories sc2 JOIN categories c2 ON c2.id = sc2."categoryId" WHERE sc2."skillId" = ms."skillId" AND c2.slug = ANY(:categories))`,
        { categories: opts.categories },
      );
    }

    return qb.getCount();
  }

  /**
   * CR-06: Direct single-row lookup for a specific approved skill within an org.
   * Replaces the limit:100 in-process Array.find scan that silently missed skills
   * beyond the first 100 results.
   */
  async findApprovedBySkillAndOrg(skillId: string, orgId: string): Promise<MarketplaceListItem | null> {
    const qb = this.repo
      .createQueryBuilder('ms')
      .select('ms.id', 'submissionId')
      .addSelect('ms."skillId"', 'skillId')
      .addSelect('ms.version', 'version')
      .addSelect('ms."submittedAt"', 'submittedAt')
      .addSelect('ms."submittedBy"', 'submittedBy')
      .addSelect('s.name', 'name')
      .addSelect('s.description', 'description')
      .innerJoin('skills', 's', 's.id = ms."skillId"')
      .innerJoin('users', 'u', 'u.id = s."ownerId"')
      .addSelect(
        '(SELECT COUNT(*)::int FROM skill_download_events sde WHERE sde."skillId" = ms."skillId")',
        'downloadCount',
      )
      .addSelect(
        `COALESCE((SELECT array_agg(c.slug) FROM skill_categories sc JOIN categories c ON c.id = sc."categoryId" WHERE sc."skillId" = ms."skillId"), '{}')`,
        'categories',
      )
      .addSelect(
        `(SELECT MIN(ms2."submittedAt") FROM marketplace_submissions ms2 WHERE ms2."skillId" = ms."skillId" AND ms2.status = 'approved')`,
        'createdAt',
      )
      .where('ms.status = :status', { status: 'approved' })
      .andWhere('u."orgId" = :orgId', { orgId })
      .andWhere('ms."skillId" = :skillId', { skillId })
      .orderBy('ms."submittedAt"', 'DESC')
      .limit(1);

    const row = await qb.getRawOne();
    if (!row) return null;

    const toIso = (v: unknown): string => {
      if (v == null) return '';
      return v instanceof Date ? v.toISOString() : String(v);
    };

    return {
      submissionId: row.submissionId,
      skillId: row.skillId,
      version: row.version,
      name: row.name,
      description: row.description,
      categories: row.categories ?? [],
      downloadCount: Number(row.downloadCount ?? 0),
      submittedAt: toIso(row.submittedAt),
      submittedBy: row.submittedBy,
      createdAt: toIso(row.createdAt),
      updatedAt: toIso(row.submittedAt),
      upvoteCount: 0,
      isUpvoted: false,
      isFavorited: false,
    };
  }

  async findPendingByIdAndOrg(submissionId: string, orgId: string): Promise<MarketplaceSubmission | null> {
    // IN-001: uses shared buildEnrichedSubmissionQb base
    const rows = await this.buildEnrichedSubmissionQb(orgId)
      .where('ms.id = :submissionId', { submissionId })
      .andWhere('ms.status = :status', { status: 'pending_review' })
      .andWhere('u."orgId" = :orgId', { orgId })
      .limit(1)
      .getRawMany();
    return rows.length > 0 ? this.toEnrichedSubmission(rows[0]) : null;
  }

  async findApprovedVersionsBySkillId(skillId: string, orgId?: string): Promise<MarketplaceSubmission[]> {
    // IN-007: when orgId is provided, join through skill owner to scope the query to the org
    if (orgId) {
      const rows = await this.repo
        .createQueryBuilder('ms')
        .innerJoin('skills', 's', 's.id = ms."skillId"')
        .innerJoin('users', 'u', 'u.id = s."ownerId"')
        .where('ms."skillId" = :skillId', { skillId })
        .andWhere('ms.status = :status', { status: EntityStatus.APPROVED })
        .andWhere('u."orgId" = :orgId', { orgId })
        .orderBy('ms."submittedAt"', 'DESC')
        .getMany();
      return rows.map((r) => this.toSubmission(r));
    }
    const rows = await this.repo.find({
      where: { skillId, status: EntityStatus.APPROVED },
      order: { submittedAt: 'DESC' },
    });
    return rows.map((r) => this.toSubmission(r));
  }

  async findApprovedVersionBySkillAndVersion(
    skillId: string,
    version: string,
  ): Promise<MarketplaceSubmission | null> {
    const entity = await this.repo.findOne({
      where: { skillId, version, status: EntityStatus.APPROVED },
    });
    return entity ? this.toSubmission(entity) : null;
  }

  async removeVersion(submissionId: string, removedBy: string): Promise<void> {
    await this.repo.update(submissionId, {
      status: EntityStatus.REMOVED,
      reviewedBy: removedBy,
      reviewedAt: new Date(),
    });
  }

  // ─── Private helpers ─────────────────────────────────────────────────────

  /**
   * IN-001: Shared base query builder for enriched submission queries that need
   * skill name, submitter name, and org-scope via the skill owner.
   *
   * All three pending/removal query methods share the same 14 SELECT columns and
   * the same JOIN pattern. Callers chain additional WHERE / ORDER / LIMIT clauses.
   *
   * Aliases:
   *   ms  — marketplace_submissions
   *   s   — skills (for skillName and ownerId)
   *   u   — users (skill owner — used for org-scope: u."orgId" = :orgId)
   *   submitter — users (submitting user — LEFT JOIN so hard-deleted users don't drop rows)
   */
  private buildEnrichedSubmissionQb(orgId: string) {
    // orgId is accepted as a parameter so callers can pass the right binding.
    // The WHERE clause is left to the caller — this builder only sets up
    // SELECT columns and JOINs.
    void orgId; // binding is applied by the caller via .andWhere('u."orgId" = :orgId', { orgId })
    return this.repo
      .createQueryBuilder('ms')
      .select('ms.id', 'id')
      .addSelect('ms."skillId"', 'skillId')
      .addSelect('ms.version', 'version')
      .addSelect('ms.status', 'status')
      .addSelect('ms."submittedBy"', 'submittedBy')
      .addSelect('ms."reviewedBy"', 'reviewedBy')
      .addSelect('ms."reviewNote"', 'reviewNote')
      .addSelect('ms."submittedAt"', 'submittedAt')
      .addSelect('ms."reviewedAt"', 'reviewedAt')
      .addSelect('ms.snapshot_name', 'snapshot_name')
      .addSelect('ms.snapshot_description', 'snapshot_description')
      .addSelect('ms.snapshot_categories', 'snapshot_categories')
      .addSelect('ms.submitter_note', 'submitter_note')
      .addSelect('ms.requirements_met', 'requirements_met')
      .addSelect('s.name', 'skillName')
      .addSelect(`submitter."firstName" || ' ' || submitter."lastName"`, 'submitterName')
      // Org-scope is via skill owner (not submitter) — CR-001
      .innerJoin('skills', 's', 's.id = ms."skillId"')
      .innerJoin('users', 'u', 'u.id = s."ownerId"')
      // LEFT JOIN so submissions from hard-deleted submitters remain visible — CR-006
      .leftJoin('users', 'submitter', 'submitter.id = ms."submittedBy"');
  }

  // ─── Mappers ────────────────────────────────────────────────────────

  // Maps a raw query result (getRawMany) that includes joined skill/user name fields
  private toEnrichedSubmission(r: Record<string, unknown>): MarketplaceSubmission {
    return {
      id: r['id'] as string,
      skillId: r['skillId'] as string,
      version: (r['version'] as string | null) ?? null,
      status: r['status'] as MarketplaceSubmissionStatus,
      submittedBy: r['submittedBy'] as string,
      reviewedBy: (r['reviewedBy'] as string | null) ?? null,
      reviewNote: (r['reviewNote'] as string | null) ?? null,
      submittedAt: r['submittedAt'] instanceof Date
        ? (r['submittedAt'] as Date).toISOString()
        : (r['submittedAt'] as string),
      reviewedAt: r['reviewedAt']
        ? r['reviewedAt'] instanceof Date
          ? (r['reviewedAt'] as Date).toISOString()
          : (r['reviewedAt'] as string)
        : null,
      snapshotName: (r['snapshot_name'] as string | null) ?? null,
      snapshotDescription: (r['snapshot_description'] as string | null) ?? null,
      snapshotCategories: (r['snapshot_categories'] as string[]) ?? [],
      submitterNote: (r['submitter_note'] as string | null) ?? null,
      requirementsMet: (r['requirements_met'] as SubmissionRequirement[] | null) ?? null,
      skillName: (r['skillName'] as string | undefined) ?? undefined,
      submitterName: (r['submitterName'] as string | undefined) ?? undefined,
    };
  }

  private toSubmission(entity: MarketplaceSubmissionEntity): MarketplaceSubmission {
    return {
      id: entity.id,
      skillId: entity.skillId,
      version: entity.version ?? null,
      status: entity.status as unknown as MarketplaceSubmissionStatus,
      submittedBy: entity.submittedBy,
      reviewedBy: entity.reviewedBy,
      reviewNote: entity.reviewNote,
      submittedAt: entity.submittedAt.toISOString(),
      reviewedAt: entity.reviewedAt ? entity.reviewedAt.toISOString() : null,
      snapshotName: entity.snapshotName ?? null,
      snapshotDescription: entity.snapshotDescription ?? null,
      snapshotCategories: entity.snapshotCategories ?? [],
      submitterNote: entity.submitterNote ?? null,
      requirementsMet: entity.requirementsMet ?? null,
    };
  }
}
