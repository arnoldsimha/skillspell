import { Injectable, NotFoundException } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { In, Repository } from 'typeorm';
import type { ICategoryRepository, Category, CreateCategoryData } from '@skillspell/shared';
import { CategoryEntity } from '../entities/category.entity';

@Injectable()
export class PostgresCategoryRepository implements ICategoryRepository {
  constructor(
    @InjectRepository(CategoryEntity)
    private readonly repo: Repository<CategoryEntity>,
  ) {}

  async create(data: CreateCategoryData): Promise<Category> {
    const entity = this.repo.create({
      orgId: data.orgId,
      name: data.name,
      slug: data.slug,
      description: data.description ?? null,
    });
    const saved = await this.repo.save(entity);
    return this.toCategory(saved);
  }

  async findById(id: string): Promise<Category | null> {
    const entity = await this.repo.findOneBy({ id });
    return entity ? this.toCategory(entity) : null;
  }

  async findByIds(ids: string[]): Promise<Category[]> {
    if (ids.length === 0) return [];
    const entities = await this.repo.find({ where: { id: In(ids) } });
    return entities.map((e) => this.toCategory(e));
  }

  async findByOrgId(orgId: string): Promise<Category[]> {
    const entities = await this.repo.find({
      where: { orgId },
      order: { name: 'ASC' },
    });
    return entities.map((e) => this.toCategory(e));
  }

  async findBySlug(orgId: string, slug: string): Promise<Category | null> {
    const entity = await this.repo.findOneBy({ orgId, slug });
    return entity ? this.toCategory(entity) : null;
  }

  async update(
    id: string,
    data: Partial<Pick<Category, 'name' | 'slug' | 'description'>>,
  ): Promise<Category> {
    const result = await this.repo.update(id, data);
    if (!result.affected || result.affected === 0) {
      throw new NotFoundException(`Category ${id} not found`);
    }
    const entity = await this.repo.findOneByOrFail({ id });
    return this.toCategory(entity);
  }

  async delete(id: string): Promise<void> {
    await this.repo.delete(id);
  }

  // ─── Mapper ─────────────────────────────────────────────────────────

  private toCategory(entity: CategoryEntity): Category {
    return {
      id: entity.id,
      orgId: entity.orgId,
      name: entity.name,
      slug: entity.slug,
      description: entity.description,
      createdAt: entity.createdAt.toISOString(),
      updatedAt: entity.updatedAt.toISOString(),
    };
  }
}
