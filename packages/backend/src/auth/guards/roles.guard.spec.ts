import { ExecutionContext, ForbiddenException } from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import { Test, TestingModule } from '@nestjs/testing';
import { RolesGuard } from './roles.guard';

/**
 * Unit tests for RolesGuard — hierarchical role-based access control.
 *
 * Role hierarchy: owner > admin > user
 *
 * Tests cover:
 * - @Public() routes bypass role checks
 * - Routes without @Roles() allow any authenticated user
 * - Routes with @Roles('admin') block non-admin users
 * - Routes with @Roles('admin') allow admin users
 * - Routes with @Roles('admin') allow owner users (hierarchical)
 * - Unauthenticated requests (no user) are rejected
 * - Owner role satisfies admin-required routes
 */
describe('RolesGuard', () => {
  let guard: RolesGuard;
  let reflector: Reflector;

  /** Helper — build a mock ExecutionContext with optional user. */
  const makeContext = (
    user?: { id: string; role: string } | null,
  ): ExecutionContext =>
    ({
      switchToHttp: () => ({
        getRequest: () => ({ user: user ?? undefined }),
      }),
      getHandler: () => jest.fn(),
      getClass: () => jest.fn(),
    }) as unknown as ExecutionContext;

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      providers: [RolesGuard, Reflector],
    }).compile();

    guard = module.get<RolesGuard>(RolesGuard);
    reflector = module.get<Reflector>(Reflector);
  });

  it('should allow access for @Public() routes regardless of role', () => {
    jest
      .spyOn(reflector, 'getAllAndOverride')
      // First call checks IS_PUBLIC_KEY -> true
      .mockReturnValueOnce(true);

    const result = guard.canActivate(makeContext(null));
    expect(result).toBe(true);
  });

  it('should allow any authenticated user when no @Roles() decorator is present', () => {
    jest
      .spyOn(reflector, 'getAllAndOverride')
      // First call checks IS_PUBLIC_KEY -> false
      .mockReturnValueOnce(false)
      // Second call checks ROLES_KEY -> undefined (no @Roles)
      .mockReturnValueOnce(undefined);

    const result = guard.canActivate(
      makeContext({ id: 'user-1', role: 'viewer' }),
    );
    expect(result).toBe(true);
  });

  it('should allow admin user when @Roles("admin") is present', () => {
    jest
      .spyOn(reflector, 'getAllAndOverride')
      .mockReturnValueOnce(false) // not public
      .mockReturnValueOnce(['admin']); // requires admin

    const result = guard.canActivate(
      makeContext({ id: 'user-1', role: 'admin' }),
    );
    expect(result).toBe(true);
  });

  it('should throw ForbiddenException when non-admin tries to access @Roles("admin") route', () => {
    jest
      .spyOn(reflector, 'getAllAndOverride')
      .mockReturnValueOnce(false) // not public
      .mockReturnValueOnce(['admin']); // requires admin

    expect(() =>
      guard.canActivate(makeContext({ id: 'user-1', role: 'viewer' })),
    ).toThrow(ForbiddenException);
  });

  it('should throw ForbiddenException when no user is present and roles are required', () => {
    jest
      .spyOn(reflector, 'getAllAndOverride')
      .mockReturnValueOnce(false) // not public
      .mockReturnValueOnce(['admin']); // requires admin

    expect(() => guard.canActivate(makeContext(null))).toThrow(
      ForbiddenException,
    );
  });

  it('should include required roles in the ForbiddenException message', () => {
    jest
      .spyOn(reflector, 'getAllAndOverride')
      .mockReturnValueOnce(false)
      .mockReturnValueOnce(['admin']);

    expect(() =>
      guard.canActivate(makeContext({ id: 'user-1', role: 'viewer' })),
    ).toThrow('Requires one of the following roles: admin');
  });

  it('should allow when user has one of multiple required roles', () => {
    jest
      .spyOn(reflector, 'getAllAndOverride')
      .mockReturnValueOnce(false)
      .mockReturnValueOnce(['admin', 'user']);

    const result = guard.canActivate(
      makeContext({ id: 'user-1', role: 'user' }),
    );
    expect(result).toBe(true);
  });

  it('should allow when @Roles() is empty array (no roles required)', () => {
    jest
      .spyOn(reflector, 'getAllAndOverride')
      .mockReturnValueOnce(false)
      .mockReturnValueOnce([]);

    const result = guard.canActivate(
      makeContext({ id: 'user-1', role: 'viewer' }),
    );
    expect(result).toBe(true);
  });

  // ─── Owner Hierarchy Tests ───────────────────────────────────────────

  it('should allow owner user when @Roles("admin") is present (hierarchical)', () => {
    jest
      .spyOn(reflector, 'getAllAndOverride')
      .mockReturnValueOnce(false) // not public
      .mockReturnValueOnce(['admin']); // requires admin

    const result = guard.canActivate(
      makeContext({ id: 'user-1', role: 'owner' }),
    );
    expect(result).toBe(true);
  });

  it('should block user role when @Roles("admin") is present', () => {
    jest
      .spyOn(reflector, 'getAllAndOverride')
      .mockReturnValueOnce(false) // not public
      .mockReturnValueOnce(['admin']); // requires admin

    expect(() =>
      guard.canActivate(makeContext({ id: 'user-1', role: 'user' })),
    ).toThrow(ForbiddenException);
  });

  it('should allow owner when @Roles("owner") is present', () => {
    jest
      .spyOn(reflector, 'getAllAndOverride')
      .mockReturnValueOnce(false)
      .mockReturnValueOnce(['owner']);

    const result = guard.canActivate(
      makeContext({ id: 'user-1', role: 'owner' }),
    );
    expect(result).toBe(true);
  });

  it('should block admin when @Roles("owner") is present', () => {
    jest
      .spyOn(reflector, 'getAllAndOverride')
      .mockReturnValueOnce(false)
      .mockReturnValueOnce(['owner']);

    expect(() =>
      guard.canActivate(makeContext({ id: 'user-1', role: 'admin' })),
    ).toThrow(ForbiddenException);
  });

  it('should block user when @Roles("owner") is present', () => {
    jest
      .spyOn(reflector, 'getAllAndOverride')
      .mockReturnValueOnce(false)
      .mockReturnValueOnce(['owner']);

    expect(() =>
      guard.canActivate(makeContext({ id: 'user-1', role: 'user' })),
    ).toThrow(ForbiddenException);
  });
});
