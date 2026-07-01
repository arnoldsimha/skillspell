import {
  Body,
  Controller,
  Delete,
  HttpCode,
  HttpStatus,
  Param,
  ParseUUIDPipe,
  Patch,
  Post,
} from '@nestjs/common';
import { Roles } from '../auth/decorators/roles.decorator.js';
import { CurrentUser } from '../auth/decorators/current-user.decorator.js';
import { CategoryService } from './category.service.js';
import { CreateCategoryDto } from './dto/create-category.dto.js';
import { UpdateCategoryDto } from './dto/update-category.dto.js';
import type { User } from '@skillspell/shared';

/**
 * Admin-only category write endpoints.
 *
 * @Roles('admin') at class level — RolesGuard blocks non-admin users for POST, PATCH, DELETE.
 * Elevation of Privilege mitigation for write ops.
 *
 * READ endpoint (GET list) is in AdminCategoriesReadController — no @Roles, accessible
 * to all authenticated users. Both controllers share the /admin/categories prefix.
 * NestJS merges routes from all controllers in the module's controllers array.
 */
@Controller('admin/categories')
@Roles('admin')
export class AdminCategoriesController {
  constructor(private readonly categoryService: CategoryService) {}

  /**
   * POST /api/admin/categories
   * Create a new category for the admin's org.
   */
  @Post()
  @HttpCode(HttpStatus.CREATED)
  async create(
    @Body() dto: CreateCategoryDto,
    @CurrentUser() admin: User,
  ) {
    return this.categoryService.create(dto, admin.orgId);
  }

  /**
   * PATCH /api/admin/categories/:id
   * Update an existing category.
   */
  @Patch(':id')
  async update(
    @Param('id', ParseUUIDPipe) id: string,
    @Body() dto: UpdateCategoryDto,
    @CurrentUser() admin: User,
  ) {
    return this.categoryService.update(id, dto, admin.orgId);
  }

  /**
   * DELETE /api/admin/categories/:id
   * Delete a category.
   */
  @Delete(':id')
  @HttpCode(HttpStatus.NO_CONTENT)
  async delete(
    @Param('id', ParseUUIDPipe) id: string,
    @CurrentUser() admin: User,
  ): Promise<void> {
    return this.categoryService.delete(id, admin.orgId);
  }
}
