import { ConflictException, Injectable, NotFoundException } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository, DataSource } from 'typeorm';
import { v4 as uuidv4 } from 'uuid';
import type {
  Skill, SkillSummary, CreateSkillData, UpdateSkillData,
  SkillVersionSnapshot, SkillVersionSummary, SkillDiagram,
  SkillFileItem,
  SkillWithOwnerOrgId,
} from '@skillspell/shared';
import type { ISkillRepository } from '@skillspell/shared';
import { SkillEntity } from '../entities/skill.entity';
import { SkillVersionEntity } from '../entities/skill-version.entity';
import { SkillDiagramEntity } from '../entities/skill-diagram.entity';
import { stripUndefined } from '../utils/strip-undefined';

@Injectable()
export class PostgresSkillRepository implements ISkillRepository {
  constructor(
    @InjectRepository(SkillEntity)
    private readonly skillRepo: Repository<SkillEntity>,
    @InjectRepository(SkillVersionEntity)
    private readonly versionRepo: Repository<SkillVersionEntity>,
    @InjectRepository(SkillDiagramEntity)
    private readonly diagramRepo: Repository<SkillDiagramEntity>,
    private readonly dataSource: DataSource,
  ) {}

  async create(data: CreateSkillData): Promise<Skill> {
    return this.dataSource.transaction(async manager => {
      const entity = manager.create(SkillEntity, {
        id: uuidv4(),
        ownerId: data.ownerId,
        name: data.name,
        description: data.description ?? '',
        status: (data.status as SkillEntity['status']) ?? 'draft',
        skillContent: data.skillContent ?? '',
        scripts: (data.scripts ?? []) as unknown[],
        references: (data.references ?? []) as unknown[],
        assets: (data.assets ?? []) as unknown[],
        version: 1,
      });
      const saved = await manager.save(SkillEntity, entity);

      // Create initial version snapshot
      const snapshot = manager.create(SkillVersionEntity, {
        skillId: saved.id,
        version: 1,
        description: saved.description,
        skillContent: saved.skillContent,
        scripts: saved.scripts,
        references: saved.references,
        assets: saved.assets,
        explanation: null,
      });
      await manager.save(SkillVersionEntity, snapshot);

      return this.toSkill(saved);
    });
  }

  async findById(id: string): Promise<Skill | null> {
    const entity = await this.skillRepo.findOneBy({ id });
    return entity ? this.toSkill(entity) : null;
  }

  async findSkillWithOwnerOrgId(skillId: string): Promise<SkillWithOwnerOrgId | null> {
    // Load the skill entity via TypeORM (handles all column mappings) and fetch
    // ownerOrgId in a single JOIN query to avoid a second round-trip to users.
    const result = await this.skillRepo
      .createQueryBuilder('s')
      .innerJoin('users', 'u', 'u.id = s."ownerId"')
      .addSelect('u."orgId"', 'ownerOrgId')
      .where('s.id = :skillId', { skillId })
      .getRawAndEntities();

    if (result.entities.length === 0) return null;
    const skill = this.toSkill(result.entities[0]);
    const ownerOrgId = result.raw[0]?.ownerOrgId as string;
    return { skill, ownerOrgId };
  }

  async findMetadataById(id: string): Promise<SkillSummary | null> {
    const entity = await this.skillRepo.findOne({
      where: { id },
      select: ['id', 'ownerId', 'name', 'description', 'status', 'version', 'isPublished', 'createdAt', 'updatedAt'],
    });
    return entity ? this.toSkillSummary(entity) : null;
  }

  async findByName(name: string, ownerId: string): Promise<Skill | null> {
    const entity = await this.skillRepo.findOneBy({ name, ownerId });
    return entity ? this.toSkill(entity) : null;
  }

  async findAll(): Promise<SkillSummary[]> {
    const entities = await this.skillRepo.find({
      select: ['id', 'ownerId', 'name', 'description', 'status', 'version', 'isPublished', 'createdAt', 'updatedAt'],
      order: { updatedAt: 'DESC' },
    });
    return entities.map(e => this.toSkillSummary(e));
  }

  async findByOwner(userId: string): Promise<SkillSummary[]> {
    const entities = await this.skillRepo.find({
      where: { ownerId: userId },
      select: ['id', 'ownerId', 'name', 'description', 'status', 'version', 'isPublished', 'createdAt', 'updatedAt'],
      order: { updatedAt: 'DESC' },
    });
    return entities.map(e => this.toSkillSummary(e));
  }

  async update(id: string, data: UpdateSkillData): Promise<Skill> {
    return this.dataSource.transaction(async manager => {
      const skill = await manager.findOneBy(SkillEntity, { id });
      if (!skill) throw new NotFoundException(`Skill ${id} not found`);

      const expectedVersion = skill.version;
      const stripped = stripUndefined<SkillEntity>(data as Record<string, unknown>);

      const result = await manager.update(SkillEntity,
        { id, version: expectedVersion },
        stripped as any,
      );
      if (result.affected === 0) {
        throw new ConflictException(
          `Skill ${id} was modified by another request (expected version ${expectedVersion})`,
        );
      }

      const updated = await manager.findOneBy(SkillEntity, { id });
      if (!updated) throw new NotFoundException(`Skill ${id} not found after update`);
      return this.toSkill(updated);
    });
  }

  async delete(id: string): Promise<void> {
    await this.skillRepo.delete(id);
  }

  async incrementVersion(id: string): Promise<Skill> {
    await this.skillRepo.increment({ id }, 'version', 1);
    const updated = await this.skillRepo.findOneBy({ id });
    if (!updated) throw new NotFoundException(`Skill ${id} not found`);
    return this.toSkill(updated);
  }

  async updateAndIncrementVersion(id: string, data: UpdateSkillData): Promise<Skill> {
    return this.dataSource.transaction(async manager => {
      const skill = await manager.findOneBy(SkillEntity, { id });
      if (!skill) throw new NotFoundException(`Skill ${id} not found`);

      const expectedVersion = skill.version;
      const stripped = stripUndefined<SkillEntity>(data as Record<string, unknown>);

      const result = await manager
        .createQueryBuilder()
        .update(SkillEntity)
        .set({ ...stripped, version: () => 'version + 1' } as any)
        .where('id = :id AND version = :expectedVersion', { id, expectedVersion })
        .execute();

      if (result.affected === 0) {
        throw new ConflictException(
          `Skill ${id} was modified by another request (expected version ${expectedVersion})`,
        );
      }

      const updated = await manager.findOneBy(SkillEntity, { id });
      if (!updated) throw new NotFoundException(`Skill ${id} not found after update`);
      return this.toSkill(updated);
    });
  }

  // ─── Version Snapshots ──────────────────────────────────────────────

  async saveVersionSnapshot(skill: Skill, explanation?: string): Promise<void> {
    const snapshot = this.versionRepo.create({
      skillId: skill.id,
      version: skill.version,
      description: skill.description,
      skillContent: skill.skillContent,
      scripts: skill.scripts as unknown[],
      references: skill.references as unknown[],
      assets: skill.assets as unknown[],
      explanation: explanation ?? null,
    });
    await this.versionRepo.save(snapshot);
  }

  async getVersionHistory(skillId: string): Promise<SkillVersionSummary[]> {
    const entities = await this.versionRepo.find({
      where: { skillId },
      select: ['skillId', 'version', 'description', 'explanation', 'createdAt'],
      order: { version: 'ASC' },
    });
    return entities.map(e => ({
      skillId: e.skillId,
      version: e.version,
      description: e.description,
      explanation: e.explanation ?? undefined,
      createdAt: e.createdAt.toISOString(),
    }));
  }

  async getVersionSnapshot(skillId: string, version: number): Promise<SkillVersionSnapshot | null> {
    const entity = await this.versionRepo.findOneBy({ skillId, version });
    if (!entity) return null;
    return {
      skillId: entity.skillId,
      version: entity.version,
      description: entity.description,
      skillContent: entity.skillContent,
      scripts: entity.scripts as SkillFileItem[],
      references: entity.references as SkillFileItem[],
      assets: entity.assets as SkillFileItem[],
      explanation: entity.explanation ?? undefined,
      createdAt: entity.createdAt.toISOString(),
    };
  }

  async deleteVersionSnapshots(skillId: string): Promise<void> {
    await this.versionRepo.delete({ skillId });
  }

  // ─── Diagrams ───────────────────────────────────────────────────────

  async getDiagram(skillId: string, version: number): Promise<SkillDiagram | null> {
    const entity = await this.diagramRepo.findOneBy({ skillId, version });
    if (!entity) return null;
    return {
      skillId: entity.skillId,
      version: entity.version,
      mermaid: entity.mermaid,
      summary: entity.summary,
      createdAt: entity.createdAt.toISOString(),
    };
  }

  async saveDiagram(diagram: SkillDiagram): Promise<void> {
    await this.diagramRepo.upsert(
      {
        skillId: diagram.skillId,
        version: diagram.version,
        mermaid: diagram.mermaid,
        summary: diagram.summary,
      },
      ['skillId', 'version'],
    );
  }

  async deleteDiagrams(skillId: string): Promise<void> {
    await this.diagramRepo.delete({ skillId });
  }

  // ─── Mappers ────────────────────────────────────────────────────────

  private toSkill(entity: SkillEntity): Skill {
    return {
      id: entity.id,
      ownerId: entity.ownerId,
      name: entity.name,
      description: entity.description,
      status: entity.status,
      skillContent: entity.skillContent,
      scripts: entity.scripts as SkillFileItem[],
      references: entity.references as SkillFileItem[],
      assets: entity.assets as SkillFileItem[],
      version: entity.version,
      isPublished: entity.isPublished,
      createdAt: entity.createdAt.toISOString(),
      updatedAt: entity.updatedAt.toISOString(),
    };
  }

  async findPublished(limit: number, offset: number, search?: string): Promise<SkillSummary[]> {
    const qb = this.skillRepo
      .createQueryBuilder('skill')
      .where('skill."isPublished" = true')
      .select([
        'skill.id', 'skill.ownerId', 'skill.name', 'skill.description',
        'skill.status', 'skill.version', 'skill.isPublished',
        'skill.createdAt', 'skill.updatedAt',
      ])
      .orderBy('skill.createdAt', 'DESC')
      .take(limit)
      .skip(offset);

    if (search) {
      qb.andWhere('skill.name ILIKE :search', { search: `%${search}%` });
    }

    const entities = await qb.getMany();
    return entities.map(e => this.toSkillSummary(e));
  }

  async findCategorySlugsBySkillId(skillId: string): Promise<string[]> {
    const result = await this.skillRepo.query(
      `SELECT c.slug
       FROM skill_categories sc
       JOIN categories c ON c.id = sc."categoryId"
       WHERE sc."skillId" = $1`,
      [skillId],
    );
    return result.map((r: { slug: string }) => r.slug);
  }

  private toSkillSummary(entity: Pick<SkillEntity, 'id' | 'ownerId' | 'name' | 'description' | 'status' | 'version' | 'isPublished' | 'createdAt' | 'updatedAt'>): SkillSummary {
    return {
      id: entity.id,
      ownerId: entity.ownerId,
      name: entity.name,
      description: entity.description,
      status: entity.status,
      version: entity.version,
      isPublished: entity.isPublished,
      createdAt: entity.createdAt.toISOString(),
      updatedAt: entity.updatedAt.toISOString(),
    };
  }
}
