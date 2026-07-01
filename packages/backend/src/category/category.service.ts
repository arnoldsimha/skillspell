import { ConflictException, Inject, Injectable, NotFoundException } from '@nestjs/common';
import {
  CATEGORY_REPOSITORY,
  type ICategoryRepository,
  type Category,
} from '@skillspell/shared';
import type { CreateCategoryDto } from './dto/create-category.dto.js';
import type { UpdateCategoryDto } from './dto/update-category.dto.js';

@Injectable()
export class CategoryService {
  constructor(
    @Inject(CATEGORY_REPOSITORY)
    private readonly categoryRepo: ICategoryRepository,
  ) {}

  async create(dto: CreateCategoryDto, orgId: string): Promise<Category> {
    const slug = dto.slug ?? dto.name.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/(^-|-$)/g, '');
    try {
      return await this.categoryRepo.create({
        orgId,
        name: dto.name,
        slug,
        description: dto.description ?? null,
      });
    } catch (err: unknown) {
      if (err instanceof Error && err.message.includes('uq_categories_org_slug')) {
        throw new ConflictException(`A category named "${dto.name}" already exists.`);
      }
      throw err;
    }
  }

  async findAll(orgId: string): Promise<Category[]> {
    return this.categoryRepo.findByOrgId(orgId);
  }

  async update(id: string, dto: UpdateCategoryDto, orgId: string): Promise<Category> {
    const existing = await this.categoryRepo.findById(id);
    if (!existing || existing.orgId !== orgId) {
      throw new NotFoundException(`Category ${id} not found`);
    }
    const patch: Record<string, unknown> = {};
    if (dto.name !== undefined) patch.name = dto.name;
    if (dto.slug !== undefined) patch.slug = dto.slug;
    if (dto.description !== undefined) patch.description = dto.description;
    return this.categoryRepo.update(id, patch);
  }

  async delete(id: string, orgId: string): Promise<void> {
    const existing = await this.categoryRepo.findById(id);
    if (!existing || existing.orgId !== orgId) {
      throw new NotFoundException(`Category ${id} not found`);
    }
    // The FK on skill_categories has onDelete: 'CASCADE' (confirmed in
    // SkillCategoryEntity), so the DB removes all skill_category rows
    // automatically when the category is deleted — no manual loop needed.
    return this.categoryRepo.delete(id);
  }
}
