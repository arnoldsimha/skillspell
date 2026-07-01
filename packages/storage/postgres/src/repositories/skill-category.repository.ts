import { Injectable } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import type { ISkillCategoryRepository, SkillCategory } from '@skillspell/shared';
import { SkillCategoryEntity } from '../entities/skill-category.entity';

@Injectable()
export class PostgresSkillCategoryRepository implements ISkillCategoryRepository {
  constructor(
    @InjectRepository(SkillCategoryEntity)
    private readonly repo: Repository<SkillCategoryEntity>,
  ) {}

  async add(skillId: string, categoryId: string): Promise<void> {
    await this.repo
      .createQueryBuilder()
      .insert()
      .into(SkillCategoryEntity)
      .values({ skillId, categoryId })
      .orIgnore()
      .execute();
  }

  async remove(skillId: string, categoryId: string): Promise<void> {
    await this.repo.delete({ skillId, categoryId });
  }

  async findBySkillId(skillId: string): Promise<SkillCategory[]> {
    const entities = await this.repo.findBy({ skillId });
    return entities.map((e) => ({ skillId: e.skillId, categoryId: e.categoryId }));
  }

  async findByCategoryId(categoryId: string): Promise<SkillCategory[]> {
    const entities = await this.repo.findBy({ categoryId });
    return entities.map((e) => ({ skillId: e.skillId, categoryId: e.categoryId }));
  }

  async setForSkill(skillId: string, categoryIds: string[]): Promise<void> {
    await this.repo.manager.transaction(async (em) => {
      await em.delete(SkillCategoryEntity, { skillId });
      if (categoryIds.length > 0) {
        const entities = categoryIds.map((categoryId) =>
          em.create(SkillCategoryEntity, { skillId, categoryId }),
        );
        await em.save(entities);
      }
    });
  }
}
