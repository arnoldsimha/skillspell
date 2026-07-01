import { Controller, Get } from '@nestjs/common';
import { CurrentUser } from '../auth/decorators/current-user.decorator.js';
import { CategoryService } from './category.service.js';
import type { User } from '@skillspell/shared';

/**
 * Read-only controller for GET /admin/categories.
 *
 * No @Roles decorator — accessible to ALL authenticated users.
 * Write operations (POST /admin/categories, PATCH/DELETE /admin/categories/:id) are in
 * AdminCategoriesController with @Roles('admin').
 *
 * Rationale: The skill edit form needs to list available categories and tags
 * for non-admin users to select when publishing. Restricting GET to admins would break the
 * skill submission UI for regular users.
 *
 * Both AdminCategoriesController and AdminCategoriesReadController share the 'admin/categories'
 * prefix. NestJS registers routes from all controllers in the module — GET list is handled here,
 * write ops by the admin controller.
 */
@Controller('admin/categories')
export class AdminCategoriesReadController {
  constructor(private readonly categoryService: CategoryService) {}

  /**
   * GET /api/admin/categories
   * List all categories for the authenticated user's org.
   * Accessible to all authenticated users (no @Roles).
   */
  @Get()
  async findAll(@CurrentUser() user: User) {
    return this.categoryService.findAll(user.orgId);
  }
}
