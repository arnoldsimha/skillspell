import { ExecutionContext, ForbiddenException, Injectable } from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import { AuthGuard } from '@nestjs/passport';
import { IS_PUBLIC_KEY } from '../decorators/public.decorator.js';

/**
 * Routes a Personal Access Token is allowed to reach (all GET).
 *
 * PATs are CLI credentials, so the allowlist covers exactly what the CLI needs:
 *   - /api/public/*          marketplace browse + skill download (install/update/outdated)
 *   - /api/skills/discover   authenticated `skillspell list`
 *   - /api/auth/me           `skillspell whoami`
 *
 * This bounds the blast radius of a stolen PAT to marketplace data + the owner's
 * own profile, rather than every GET endpoint in the API. Paths include the
 * global `/api` prefix and are compared with any trailing slash stripped.
 */
export function isPatAllowedPath(path: string | undefined): boolean {
  // Fail closed: a missing/blank path is never on the allowlist.
  const normalized = (path ?? '').replace(/\/+$/, '') || '/';
  return (
    normalized === '/api/auth/me' ||
    normalized === '/api/skills/discover' ||
    normalized === '/api/public' ||
    normalized.startsWith('/api/public/')
  );
}

/**
 * Global JWT authentication guard.
 *
 * Applied globally via APP_GUARD — all routes require a valid JWT
 * by default. Routes decorated with @Public() are exempted.
 *
 * PAT scope enforcement: Personal Access Tokens are read-only AND limited to the
 * CLI route allowlist (isPatAllowedPath). Non-GET methods and off-allowlist
 * routes are rejected with 403 Forbidden.
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
   * Enforces PAT scope: read-only (GET) AND limited to the CLI route allowlist.
   */
  handleRequest<TUser = any>(
    err: any,
    user: any,
    info: any,
    context: ExecutionContext,
  ): TUser {
    const authenticatedUser = super.handleRequest(err, user, info, context);

    const request = context
      .switchToHttp()
      .getRequest<{ method: string; path: string; _patAuthenticated?: boolean }>();

    if (request._patAuthenticated) {
      if (request.method !== 'GET') {
        throw new ForbiddenException('PAT tokens are read-only and cannot perform write operations');
      }
      if (!isPatAllowedPath(request.path)) {
        throw new ForbiddenException('PAT tokens are not permitted on this route');
      }
    }

    return authenticatedUser;
  }
}
