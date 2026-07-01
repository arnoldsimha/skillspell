import { ExecutionContext } from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import { Test, TestingModule } from '@nestjs/testing';
import { JwtAuthGuard } from './jwt-auth.guard';
import { IS_PUBLIC_KEY } from '../decorators/public.decorator';

/**
 * Unit tests for JwtAuthGuard — JWT route authentication.
 *
 * Because Passport's AuthGuard('jwt') requires the actual jwt strategy
 * to be registered at runtime, we mock `super.canActivate` to isolate
 * the guard's own logic (public-route bypass and delegation).
 *
 * Tests cover:
 * - @Public() routes bypass JWT validation entirely
 * - Non-public routes delegate to Passport's AuthGuard
 * - Reflector reads metadata from both handler and class level
 * - Different user scenarios (user present, absent)
 */
describe('JwtAuthGuard', () => {
  let guard: JwtAuthGuard;
  let reflector: Reflector;
  let superCanActivateSpy: jest.SpyInstance;

  /**
   * Helper — build a mock ExecutionContext with stable handler/class references.
   */
  const makeContext = (
    requestOverrides: Record<string, unknown> = {},
  ): ExecutionContext => {
    const handler = jest.fn();
    const cls = jest.fn();
    const request = { headers: {}, user: undefined, ...requestOverrides };
    const response = { status: jest.fn().mockReturnThis(), json: jest.fn() };
    return {
      switchToHttp: () => ({
        getRequest: () => request,
        getResponse: () => response,
        getNext: () => jest.fn(),
      }),
      getHandler: () => handler,
      getClass: () => cls,
      getType: () => 'http',
    } as unknown as ExecutionContext;
  };

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      providers: [JwtAuthGuard, Reflector],
    }).compile();

    guard = module.get<JwtAuthGuard>(JwtAuthGuard);
    reflector = module.get<Reflector>(Reflector);

    // Mock super.canActivate to avoid needing the actual Passport jwt strategy.
    // The parent prototype is AuthGuard('jwt').prototype.
    superCanActivateSpy = jest.spyOn(
      Object.getPrototypeOf(Object.getPrototypeOf(guard)),
      'canActivate',
    );
  });

  afterEach(() => {
    superCanActivateSpy.mockRestore();
  });

  it('should allow access for @Public() routes without JWT', () => {
    jest.spyOn(reflector, 'getAllAndOverride').mockReturnValue(true);

    const result = guard.canActivate(makeContext());

    expect(result).toBe(true);
    expect(superCanActivateSpy).not.toHaveBeenCalled();
  });

  it('should not call super.canActivate when route is public', () => {
    jest.spyOn(reflector, 'getAllAndOverride').mockReturnValue(true);

    guard.canActivate(makeContext());

    expect(superCanActivateSpy).not.toHaveBeenCalled();
  });

  it('should delegate to Passport AuthGuard for non-public routes', () => {
    jest.spyOn(reflector, 'getAllAndOverride').mockReturnValue(false);
    superCanActivateSpy.mockReturnValue(true);

    const result = guard.canActivate(makeContext());

    expect(superCanActivateSpy).toHaveBeenCalled();
    expect(result).toBe(true);
  });

  it('should check metadata from both handler and class level', () => {
    const spy = jest
      .spyOn(reflector, 'getAllAndOverride')
      .mockReturnValue(false);
    superCanActivateSpy.mockReturnValue(true);

    const context = makeContext();
    guard.canActivate(context);

    expect(spy).toHaveBeenCalledWith(IS_PUBLIC_KEY, [
      context.getHandler(),
      context.getClass(),
    ]);
  });

  it('should reject when super.canActivate returns false (no valid JWT)', () => {
    jest.spyOn(reflector, 'getAllAndOverride').mockReturnValue(false);
    superCanActivateSpy.mockReturnValue(false);

    const result = guard.canActivate(makeContext());

    expect(result).toBe(false);
  });

  it('should reject when super.canActivate returns a rejected promise', async () => {
    jest.spyOn(reflector, 'getAllAndOverride').mockReturnValue(false);
    superCanActivateSpy.mockReturnValue(
      Promise.reject(new Error('Unauthorized')),
    );

    const result = guard.canActivate(makeContext());
    await expect(result).rejects.toThrow('Unauthorized');
  });

  it('should allow any user through @Public() regardless of missing headers', () => {
    jest.spyOn(reflector, 'getAllAndOverride').mockReturnValue(true);

    const result = guard.canActivate(makeContext({ headers: {} }));

    expect(result).toBe(true);
    expect(superCanActivateSpy).not.toHaveBeenCalled();
  });

  it('should pass context to super.canActivate when not public', () => {
    jest.spyOn(reflector, 'getAllAndOverride').mockReturnValue(false);
    superCanActivateSpy.mockReturnValue(true);

    const context = makeContext();
    guard.canActivate(context);

    expect(superCanActivateSpy).toHaveBeenCalledWith(context);
  });
});
