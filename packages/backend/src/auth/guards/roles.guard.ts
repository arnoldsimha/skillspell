import {
  CanActivate,
  ExecutionContext,
  ForbiddenException,
  Injectable,
} from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import { type UserRole, isAtLeast } from '@skillspell/shared';
import { ROLES_KEY } from '../decorators/roles.decorator.js';
import { IS_PUBLIC_KEY } from '../decorators/public.decorator.js';

/**
 * Global role-based access control guard.
 *
 * Applied globally via APP_GUARD. Uses a **hierarchical** role model:
 *   owner > admin > user
 *
 * If a route is decorated with @Roles('admin'), users with role `admin`
 * **or higher** (`owner`) can access it.
 * Routes without @Roles() are accessible to any authenticated user.
 * Routes decorated with @Public() skip this guard entirely.
 */
@Injectable()
export class RolesGuard implements CanActivate {
  constructor(private readonly reflector: Reflector) {}

  canActivate(context: ExecutionContext): boolean {
    // Public routes skip role checks
    const isPublic = this.reflector.getAllAndOverride<boolean>(IS_PUBLIC_KEY, [
      context.getHandler(),
      context.getClass(),
    ]);
    if (isPublic) return true;

    // Get required roles from the @Roles() decorator
    const requiredRoles = this.reflector.getAllAndOverride<UserRole[]>(
      ROLES_KEY,
      [context.getHandler(), context.getClass()],
    );

    // No @Roles() decorator = any authenticated user can access
    if (!requiredRoles || requiredRoles.length === 0) {
      return true;
    }

    const request = context.switchToHttp().getRequest();
    const user = request.user;

    if (!user) {
      throw new ForbiddenException('Authentication required');
    }

    // Hierarchical check: user satisfies a required role if their level >= required level
    const hasRole = requiredRoles.some((r) => isAtLeast(user.role, r));
    if (!hasRole) {
      throw new ForbiddenException(
        `Requires one of the following roles: ${requiredRoles.join(', ')}`,
      );
    }

    return true;
  }
}
