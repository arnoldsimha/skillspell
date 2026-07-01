import { SetMetadata } from '@nestjs/common';
import type { UserRole } from '@skillspell/shared';

/**
 * Metadata key for the @Roles() decorator.
 */
export const ROLES_KEY = 'roles';

/**
 * Restrict a route to specific user roles.
 *
 * Usage:
 * ```typescript
 * @Roles('admin')
 * @Get('users')
 * async listUsers() { ... }
 * ```
 */
export const Roles = (...roles: UserRole[]) => SetMetadata(ROLES_KEY, roles);
