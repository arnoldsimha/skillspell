import { Injectable } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { In, Repository } from 'typeorm';
import type { ISkillUpvoteRepository } from '@skillspell/shared';
import { SkillUpvoteEntity } from '../entities/skill-upvote.entity.js';

function isUniqueViolation(err: unknown): boolean {
  return (
    typeof err === 'object' &&
    err !== null &&
    'code' in err &&
    (err as { code: string }).code === '23505'
  );
}

@Injectable()
export class PostgresSkillUpvoteRepository implements ISkillUpvoteRepository {
  constructor(
    @InjectRepository(SkillUpvoteEntity)
    private readonly repo: Repository<SkillUpvoteEntity>,
  ) {}

  async toggle(skillId: string, userId: string): Promise<boolean> {
    const deleteResult = await this.repo.delete({ skillId, userId });
    if ((deleteResult.affected ?? 0) > 0) {
      return false; // was upvoted, now removed
    }
    // Was not upvoted — try to insert
    try {
      await this.repo.save(this.repo.create({ skillId, userId }));
      return true;
    } catch (err: unknown) {
      // Concurrent insert won the race — the row now exists, treat as upvoted
      if (isUniqueViolation(err)) {
        return true;
      }
      throw err;
    }
  }

  async countBySkillId(skillId: string): Promise<number> {
    return this.repo.count({ where: { skillId } });
  }

  async findSkillIdsByUser(userId: string, skillIds: string[]): Promise<string[]> {
    if (skillIds.length === 0) return [];
    const rows = await this.repo.find({ where: { userId, skillId: In(skillIds) } });
    return rows.map(r => r.skillId);
  }
}
