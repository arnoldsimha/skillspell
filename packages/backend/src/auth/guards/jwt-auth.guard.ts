import { ExecutionContext, ForbiddenException, Injectable } from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import { AuthGuard } from '@nestjs/passport';
import { IS_PUBLIC_KEY } from '../decorators/public.decorator.js';

/**
 * Global JWT authentication guard.
 *
 * Applied globally via APP_GUARD — all routes require a valid JWT
 * by default. Routes decorated with @Public() are exempted.
 *
 * PAT scope enforcement: Personal Access Tokens are read-only.
 * PAT-authenticated requests are allowed on any route but only for GET requests.
 * POST, PUT, PATCH, and DELETE are blocked with 403 Forbidden.
 */
@Injectable()
export class JwtAuthGuard extends AuthGuard(['jwt', 'pat']) {
  constructor(private readonly reflector: Reflector) {
    super();
  }

  canActivate(context: ExecutionContext) {
    // Check if the route is marked as public
    const isPublic = this.reflector.getAllAndOverride<boolean>(IS_PUBLIC_KEY, [
      context.getHandler(),
      context.getClass(),
    ]);

    if (isPublic) {
      return true;
    }

    return super.canActivate(context);
  }

  /**
   * Called by Passport after authentication resolves.
   * Enforces PAT read-only scope: only GET requests are allowed.
   */
  handleRequest<TUser = any>(
    err: any,
    user: any,
    info: any,
    context: ExecutionContext,
  ): TUser {
    const authenticatedUser = super.handleRequest(err, user, info, context);

    const request = context.switchToHttp().getRequest<{ method: string; _patAuthenticated?: boolean }>();

    if (request._patAuthenticated && request.method !== 'GET') {
      throw new ForbiddenException('PAT tokens are read-only and cannot perform write operations');
    }

    return authenticatedUser;
  }
}
