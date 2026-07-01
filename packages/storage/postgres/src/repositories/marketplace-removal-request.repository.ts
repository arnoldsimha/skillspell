// packages/storage/postgres/src/repositories/marketplace-removal-request.repository.ts
import { Injectable } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import type {
  IMarketplaceRemovalRequestRepository,
  MarketplaceRemovalRequest,
  CreateRemovalRequestData,
} from '@skillspell/shared';
import { MarketplaceRemovalRequestEntity } from '../entities/marketplace-removal-request.entity';

@Injectable()
export class PostgresMarketplaceRemovalRequestRepository
  implements IMarketplaceRemovalRequestRepository
{
  constructor(
    @InjectRepository(MarketplaceRemovalRequestEntity)
    private readonly repo: Repository<MarketplaceRemovalRequestEntity>,
  ) {}

  async create(data: CreateRemovalRequestData): Promise<MarketplaceRemovalRequest> {
    const entity = this.repo.create({
      skillId: data.skillId,
      scope: data.scope,
      targetSubmissionId: data.targetSubmissionId,
      reason: data.reason ?? null,
      submittedBy: data.submittedBy,
      status: 'pending',
    });
    const saved = await this.repo.save(entity);
    return this.toDto(saved);
  }

  async findById(id: string): Promise<MarketplaceRemovalRequest | null> {
    const row = await this.repo.findOne({ where: { id } });
    return row ? this.toDto(row) : null;
  }

  async findPendingByOrg(orgId: string): Promise<MarketplaceRemovalRequest[]> {
    const rows = await this.repo.manager.query<Array<Record<string, unknown>>>(
      `SELECT
         mrr.id,
         mrr."skillId",
         mrr.scope,
         mrr."targetSubmissionId",
         mrr.reason,
         mrr."submittedBy",
         mrr.status,
         mrr."reviewedBy",
         mrr."reviewedAt",
         mrr."createdAt",
         s.name        AS "skillName",
         u."firstName" || ' ' || u."lastName" AS "submitterName",
         ms.version    AS "targetVersion"
       FROM marketplace_removal_requests mrr
       JOIN skills      s  ON s.id  = mrr."skillId"
       LEFT JOIN users  u  ON u.id  = mrr."submittedBy"
       JOIN users       su ON su.id = s."ownerId"
       LEFT JOIN marketplace_submissions ms ON ms.id = mrr."targetSubmissionId"
       WHERE mrr.status  = 'pending'
         AND su."orgId"  = $1
       ORDER BY mrr."createdAt" ASC`,
      [orgId],
    );
    return rows.map(this.rowToDto);
  }

  async hasPendingForSkill(skillId: string): Promise<boolean> {
    const count = await this.repo.count({ where: { skillId, status: 'pending' } });
    return count > 0;
  }

  async updateStatus(
    id: string,
    status: 'approved' | 'rejected',
    reviewedBy: string,
  ): Promise<void> {
    await this.repo.update(id, {
      status,
      reviewedBy,
      reviewedAt: new Date(),
    });
  }

  private toDto(e: MarketplaceRemovalRequestEntity): MarketplaceRemovalRequest {
    return {
      id: e.id,
      skillId: e.skillId,
      scope: e.scope,
      targetSubmissionId: e.targetSubmissionId,
      reason: e.reason,
      submittedBy: e.submittedBy,
      status: e.status,
      reviewedBy: e.reviewedBy,
      reviewedAt: e.reviewedAt?.toISOString() ?? null,
      createdAt: e.createdAt.toISOString(),
    };
  }

  private rowToDto = (r: Record<string, unknown>): MarketplaceRemovalRequest => ({
    id: r['id'] as string,
    skillId: r['skillId'] as string,
    scope: r['scope'] as 'skill' | 'version',
    targetSubmissionId: (r['targetSubmissionId'] as string | null) ?? null,
    reason: (r['reason'] as string | null) ?? null,
    submittedBy: r['submittedBy'] as string,
    status: r['status'] as 'pending' | 'approved' | 'rejected',
    reviewedBy: (r['reviewedBy'] as string | null) ?? null,
    reviewedAt: r['reviewedAt'] ? (r['reviewedAt'] as Date).toISOString() : null,
    createdAt: (r['createdAt'] as Date).toISOString(),
    skillName: r['skillName'] as string | undefined,
    submitterName: r['submitterName'] as string | undefined,
    targetVersion: (r['targetVersion'] as string | null) ?? null,
  });
}
