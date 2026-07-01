import { Module } from '@nestjs/common';
import { AdminCategoriesController } from './admin-categories.controller.js';
import { AdminCategoriesReadController } from './admin-categories-read.controller.js';
import { CategoryService } from './category.service.js';

/**
 * CategoryModule: wires split admin category controllers and CategoryService.
 *
 * Split controller approach:
 * - AdminCategoriesController handles POST/PATCH/DELETE (admin-only, @Roles('admin'))
 * - AdminCategoriesReadController handles GET (all authenticated users, no @Roles)
 *
 * Repository tokens (CATEGORY_REPOSITORY, SKILL_CATEGORY_REPOSITORY) are provided
 * globally by PostgresStorageModule — no import needed here.
 */
@Module({
  imports: [],
  controllers: [AdminCategoriesController, AdminCategoriesReadController],
  providers: [CategoryService],
  exports: [CategoryService],
})
export class CategoryModule {}
