import { Injectable } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import {
  FindListingsOptions,
  IMarketplaceListingRepository,
  MarketplaceListing,
  MarketplaceListingStatus,
  MarketplaceListItem,
  MarketplaceRemovalType,
  UpsertMarketplaceListingData,
} from '@skillspell/shared';
import {
  MarketplaceListingEntity,
  MarketplaceListingStatus as EntityStatus,
} from '../entities/marketplace-listing.entity';

@Injectable()
export class PostgresMarketplaceListingRepository implements IMarketplaceListingRepository {
  constructor(
    @InjectRepository(MarketplaceListingEntity)
    private readonly repo: Repository<MarketplaceListingEntity>,
  ) {}

  async upsert(data: UpsertMarketplaceListingData): Promise<MarketplaceListing> {
    const now = new Date();
    // Atomic upsert — no TOCTOU race on concurrent approvals for the same skill.
    // Note: firstApprovedAt is intentionally NOT in the orUpdate column list — on conflict
    // (re-approval) the original firstApprovedAt is preserved. On first INSERT the value
    // is set from `now`.
    await this.repo
      .createQueryBuilder()
      .insert()
      .into(MarketplaceListingEntity)
      .values({
        skillId: data.skillId,
        orgId: data.orgId,
        submissionId: data.submissionId,
        snapshotName: data.snapshotName,
        snapshotDescription: data.snapshotDescription ?? null,
        snapshotCategories: data.snapshotCategories,
        snapshotVersion: data.snapshotVersion,
        status: EntityStatus.ACTIVE,
        firstApprovedAt: now,
        lastApprovedAt: now,
      })
      .orUpdate(
        [
          'submissionId',
          'snapshotName',
          'snapshotDescription',
          'snapshotCategories',
          'snapshotVersion',
          'status',
          'lastApprovedAt',
        ],
        ['skillId'],
      )
      .execute();

    // WR-012: heal the edge case where a listing row was created by setStatus() before
    // the first upsert ran — setStatus doesn't set firstApprovedAt, leaving it NULL.
    // The UPDATE is a no-op for the normal case (firstApprovedAt already set by the INSERT above).
    await this.repo.query(
      `UPDATE marketplace_listings
          SET "firstApprovedAt" = "lastApprovedAt"
        WHERE "skillId" = $1 AND "firstApprovedAt" IS NULL`,
      [data.skillId],
    );

    return (await this.findBySkillId(data.skillId))!;
  }

  async findBySkillId(skillId: string): Promise<MarketplaceListing | null> {
    const entity = await this.repo.findOne({ where: { skillId } });
    return entity ? this.toInterface(entity) : null;
  }

  async findActiveByOrgId(
    orgId: string,
    opts: FindListingsOptions = {},
  ): Promise<{ items: MarketplaceListItem[]; total: number }> {
    const search     = opts?.search?.trim();
    const categories = opts?.categories ?? [];
    const limit      = opts?.limit ?? 30;
    const offset     = opts?.offset ?? 0;
    const sort       = opts?.sort ?? 'popular';
    const userId     = opts?.userId;

    // Count query (lightweight — no joins)
    let countQb = this.repo
      .createQueryBuilder('l')
      .where('l.orgId = :orgId', { orgId })
      .andWhere('l.status = :status', { status: EntityStatus.ACTIVE });
    if (search) {
      countQb = countQb.andWhere(
        '(l.snapshotName ILIKE :search OR l.snapshotDescription ILIKE :search)',
        { search: `%${search}%` },
      );
    }
    if (categories.length > 0) {
      countQb = countQb.andWhere('l.snapshotCategories && :cats', { cats: categories });
    }
    const total = await countQb.getCount();

    // Data query — join to submissions + users for submitter info, subquery for download count
    let dataQb = this.repo
      .createQueryBuilder('l')
      .select('l."skillId"', 'skillId')
      .addSelect('l."submissionId"', 'submissionId')
      .addSelect('l."snapshotName"', 'name')
      .addSelect('l."snapshotDescription"', 'description')
      .addSelect('l."snapshotCategories"', 'categories')
      .addSelect('l."snapshotVersion"::text', 'version')
      .addSelect('l."firstApprovedAt"', 'createdAt')
      .addSelect('l."lastApprovedAt"', 'updatedAt')
      .addSelect('ms."submittedBy"', 'submittedBy')
      .addSelect('ms."submittedAt"', 'submittedAt')
      .addSelect(`u."firstName" || ' ' || u."lastName"`, 'submittedByName')
      .addSelect(
        `(SELECT COUNT(*)::int FROM skill_download_events sde WHERE sde."skillId" = l."skillId")`,
        'downloadCount',
      )
      .innerJoin('marketplace_submissions', 'ms', 'ms.id = l."submissionId"')
      .innerJoin('users', 'u', 'u.id = ms."submittedBy"')
      .where('l.orgId = :orgId', { orgId })
      .andWhere('l.status = :status', { status: EntityStatus.ACTIVE });

    if (search) {
      dataQb = dataQb.andWhere(
        '(l.snapshotName ILIKE :search OR l.snapshotDescription ILIKE :search)',
        { search: `%${search}%` },
      );
    }
    if (categories.length > 0) {
      dataQb = dataQb.andWhere('l.snapshotCategories && :cats', { cats: categories });
    }
    const skillIds_filter = opts?.skillIds;
    if (skillIds_filter && skillIds_filter.length > 0) {
      dataQb = dataQb.andWhere('l."skillId" IN (:...skillIds_filter)', { skillIds_filter });
    }

    // Sort
    switch (sort) {
      case 'newest':
        dataQb = dataQb.orderBy('l."lastApprovedAt"', 'DESC');
        break;
      case 'downloads':
        dataQb = dataQb.orderBy(
          `(SELECT COUNT(*) FROM skill_download_events sde WHERE sde."skillId" = l."skillId")`,
          'DESC',
        );
        break;
      case 'upvotes':
        dataQb = dataQb.orderBy(
          `(SELECT COUNT(*) FROM skill_upvotes su WHERE su."skillId" = l."skillId")`,
          'DESC',
        );
        break;
      case 'name':
        dataQb = dataQb.orderBy('l."snapshotName"', 'ASC');
        break;
      case 'popular':
      default:
        dataQb = dataQb.orderBy(
          `(SELECT COUNT(*) FROM skill_upvotes su WHERE su."skillId" = l."skillId") * 0.4 + (SELECT COUNT(*) FROM skill_download_events sde WHERE sde."skillId" = l."skillId") * 0.6`,
          'DESC',
        );
        break;
    }

    const rows: Array<{
      skillId: string;
      submissionId: string;
      name: string;
      description: string | null;
      categories: string[];
      version: string;
      createdAt: Date | string;
      updatedAt: Date | string;
      submittedBy: string;
      submittedAt: Date | string;
      submittedByName: string;
      downloadCount: number;
    }> = await dataQb.limit(limit).offset(offset).getRawMany();

    if (rows.length === 0) return { items: [], total };

    const skillIds = rows.map(r => r.skillId);

    // Batch fetch upvote counts
    const upvoteCountRows: { skillId: string; cnt: string }[] = await this.repo.query(
      `SELECT "skillId", COUNT(*)::text as cnt FROM skill_upvotes WHERE "skillId" = ANY($1) GROUP BY "skillId"`,
      [skillIds],
    );
    const upvoteCountMap = new Map(upvoteCountRows.map(r => [r.skillId, parseInt(r.cnt, 10)]));

    // Batch fetch user's upvotes
    let upvotedSet = new Set<string>();
    if (userId) {
      const upvotedRows: { skillId: string }[] = await this.repo.query(
        `SELECT "skillId" FROM skill_upvotes WHERE "userId" = $1 AND "skillId" = ANY($2)`,
        [userId, skillIds],
      );
      upvotedSet = new Set(upvotedRows.map(r => r.skillId));
    }

    // Batch fetch user's favorites
    let favoritedSet = new Set<string>();
    if (userId) {
      const favoritedRows: { skillId: string }[] = await this.repo.query(
        `SELECT "skillId" FROM skill_favorites WHERE "userId" = $1 AND "skillId" = ANY($2)`,
        [userId, skillIds],
      );
      favoritedSet = new Set(favoritedRows.map(r => r.skillId));
    }

    const items: MarketplaceListItem[] = rows.map((r) => ({
      skillId: r.skillId,
      submissionId: r.submissionId,
      name: r.name ?? '',
      description: r.description ?? '',
      categories: r.categories ?? [],
      version: r.version ?? '1',
      downloadCount: r.downloadCount ?? 0,
      submittedAt: r.submittedAt instanceof Date ? r.submittedAt.toISOString() : r.submittedAt,
      submittedBy: r.submittedBy,
      submittedByName: r.submittedByName,
      createdAt: r.createdAt instanceof Date ? r.createdAt.toISOString() : r.createdAt,
      updatedAt: r.updatedAt instanceof Date ? r.updatedAt.toISOString() : r.updatedAt,
      upvoteCount:  upvoteCountMap.get(r.skillId) ?? 0,
      isUpvoted:    upvotedSet.has(r.skillId),
      isFavorited:  favoritedSet.has(r.skillId),
    }));

    return { items, total };
  }

  async setStatus(
    skillId: string,
    status: MarketplaceListingStatus,
    meta: {
      removedBy?: string;
      removalReason?: string;
      removalType?: MarketplaceRemovalType;
    } = {},
  ): Promise<void> {
    await this.repo.update(
      { skillId },
      {
        status: status as EntityStatus,
        removedBy: meta.removedBy ?? null,
        removalReason: meta.removalReason ?? null,
        removalType: (meta.removalType ?? null) as any,
      },
    );
  }

  private toInterface(e: MarketplaceListingEntity): MarketplaceListing {
    return {
      id: e.id,
      skillId: e.skillId,
      orgId: e.orgId,
      submissionId: e.submissionId,
      snapshotName: e.snapshotName,
      snapshotDescription: e.snapshotDescription,
      snapshotCategories: e.snapshotCategories,
      snapshotVersion: e.snapshotVersion,
      status: e.status as MarketplaceListingStatus,
      removalReason: e.removalReason,
      removedBy: e.removedBy,
      removalType: e.removalType as MarketplaceRemovalType | null,
      firstApprovedAt: e.firstApprovedAt.toISOString(),
      lastApprovedAt: e.lastApprovedAt.toISOString(),
    };
  }
}
