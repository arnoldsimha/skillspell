import { Injectable } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { In, Repository } from 'typeorm';
import type { ISkillFavoriteRepository, SkillFavoriteItem } from '@skillspell/shared';
import { SkillFavoriteEntity } from '../entities/skill-favorite.entity.js';

function isUniqueViolation(err: unknown): boolean {
  return (
    typeof err === 'object' &&
    err !== null &&
    'code' in err &&
    (err as { code: string }).code === '23505'
  );
}

@Injectable()
export class PostgresSkillFavoriteRepository implements ISkillFavoriteRepository {
  constructor(
    @InjectRepository(SkillFavoriteEntity)
    private readonly repo: Repository<SkillFavoriteEntity>,
  ) {}

  async toggle(skillId: string, userId: string): Promise<boolean> {
    const deleteResult = await this.repo.delete({ skillId, userId });
    if ((deleteResult.affected ?? 0) > 0) {
      return false; // was favorited, now removed
    }
    // Was not favorited — try to insert
    try {
      await this.repo.save(this.repo.create({ skillId, userId }));
      return true;
    } catch (err: unknown) {
      // Concurrent insert won the race — the row now exists, treat as favorited
      if (isUniqueViolation(err)) {
        return true;
      }
      throw err;
    }
  }

  async findByUser(userId: string, opts: { limit?: number; offset?: number }): Promise<SkillFavoriteItem[]> {
    const rows = await this.repo.find({
      where: { userId },
      order: { createdAt: 'DESC' },
      take: opts.limit ?? 30,
      skip: opts.offset ?? 0,
    });
    return rows.map(r => ({ skillId: r.skillId, createdAt: r.createdAt.toISOString() }));
  }

  async countByUser(userId: string): Promise<number> {
    return this.repo.count({ where: { userId } });
  }

  /**
   * CR-005: count only favorites that have an active marketplace listing so that
   * the favorites pagination total reflects the number of renderable items, not
   * the raw favorites count (which includes delisted skills).
   */
  async countActiveByUser(userId: string, orgId: string): Promise<number> {
    const result: { count: string }[] = await this.repo.query(
      `SELECT COUNT(*)::text AS count
         FROM skill_favorites sf
         JOIN marketplace_listings ml ON ml."skillId" = sf."skillId"
        WHERE sf."userId" = $1
          AND ml."orgId" = $2
          AND ml.status = 'active'`,
      [userId, orgId],
    );
    return parseInt(result[0]?.count ?? '0', 10);
  }

  async findSkillIdsByUser(userId: string, skillIds: string[]): Promise<string[]> {
    if (skillIds.length === 0) return [];
    const rows = await this.repo.find({ where: { userId, skillId: In(skillIds) } });
    return rows.map(r => r.skillId);
  }
}
