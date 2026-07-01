import { Injectable } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import type {
  ISkillDownloadEventRepository,
  SkillDownloadEvent,
  CreateSkillDownloadEventData,
} from '@skillspell/shared';
import { SkillDownloadEventEntity } from '../entities/skill-download-event.entity';

@Injectable()
export class PostgresSkillDownloadEventRepository
  implements ISkillDownloadEventRepository
{
  constructor(
    @InjectRepository(SkillDownloadEventEntity)
    private readonly repo: Repository<SkillDownloadEventEntity>,
  ) {}

  async create(data: CreateSkillDownloadEventData): Promise<SkillDownloadEvent> {
    const entity = this.repo.create({
      skillId: data.skillId,
      version: data.version,
    });
    const saved = await this.repo.save(entity);
    return this.toEvent(saved);
  }

  async findBySkillId(skillId: string): Promise<SkillDownloadEvent[]> {
    const entities = await this.repo.find({
      where: { skillId },
      order: { downloadedAt: 'DESC' },
    });
    return entities.map((e) => this.toEvent(e));
  }

  async findBySkillIdAndVersion(
    skillId: string,
    version: string,
  ): Promise<SkillDownloadEvent[]> {
    const entities = await this.repo.find({
      where: { skillId, version },
      order: { downloadedAt: 'DESC' },
    });
    return entities.map((e) => this.toEvent(e));
  }

  async countBySkillIdGroupedByVersion(
    skillId: string,
    versions: string[],
  ): Promise<Map<string, number>> {
    if (versions.length === 0) return new Map();
    const rows: Array<{ version: string; cnt: string }> = await this.repo.manager.query(
      `SELECT version, COUNT(*)::int AS cnt
       FROM skill_download_events
       WHERE "skillId" = $1 AND version = ANY($2)
       GROUP BY version`,
      [skillId, versions],
    );
    const result = new Map<string, number>();
    for (const row of rows) {
      result.set(row.version, Number(row.cnt));
    }
    return result;
  }

  // ─── Mapper ─────────────────────────────────────────────────────────

  private toEvent(entity: SkillDownloadEventEntity): SkillDownloadEvent {
    return {
      id: entity.id,
      skillId: entity.skillId,
      version: entity.version,
      downloadedAt: entity.downloadedAt.toISOString(),
    };
  }
}
