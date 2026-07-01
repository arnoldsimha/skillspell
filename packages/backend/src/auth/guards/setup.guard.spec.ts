import { HttpException, HttpStatus } from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import { Test } from '@nestjs/testing';
import { CACHE_MANAGER } from '@nestjs/cache-manager';
import { AUTH_TOKEN_REPOSITORY, type IAuthTokenRepository } from '@skillspell/shared';
import { SetupGuard } from './setup.guard';

const makeContext = (isSetupRoute = false) => ({
  getHandler: () => ({}),
  getClass: () => ({}),
  switchToHttp: () => ({ getRequest: () => ({}) }),
  _isSetupRoute: isSetupRoute,
});

describe('SetupGuard', () => {
  let guard: SetupGuard;
  let reflector: jest.Mocked<Reflector>;
  let authTokenRepo: jest.Mocked<IAuthTokenRepository>;
  let cacheStore: Map<string, unknown>;

  beforeEach(async () => {
    reflector = { getAllAndOverride: jest.fn().mockReturnValue(false) } as any;
    cacheStore = new Map();

    authTokenRepo = {
      getSetupState: jest.fn(),
      saveSetupState: jest.fn(),
      saveRefreshToken: jest.fn(),
      findRefreshToken: jest.fn(),
      findRefreshTokenByTokenId: jest.fn(),
      revokeRefreshToken: jest.fn(),
      revokeAllRefreshTokens: jest.fn(),
      cleanupExpiredTokens: jest.fn(),
      deleteAllExpiredTokens: jest.fn(),
      saveSsoLink: jest.fn(),
      findBySsoProvider: jest.fn(),
      getSsoLinks: jest.fn(),
      removeSsoLink: jest.fn(),
    } as jest.Mocked<IAuthTokenRepository>;

    const module = await Test.createTestingModule({
      providers: [
        SetupGuard,
        { provide: Reflector, useValue: reflector },
        { provide: AUTH_TOKEN_REPOSITORY, useValue: authTokenRepo },
        { provide: CACHE_MANAGER, useValue: { get: jest.fn((k: string) => Promise.resolve(cacheStore.get(k) ?? null)), set: jest.fn((k: string, v: unknown) => { cacheStore.set(k, v); return Promise.resolve(); }), del: jest.fn((k: string) => { cacheStore.delete(k); return Promise.resolve(); }) } },
      ],
    }).compile();

    guard = module.get(SetupGuard);
  });

  const ctx = makeContext() as any;

  // ── @SetupRoute bypass ────────────────────────────────────────────────

  it('allows setup routes through regardless of setup state', async () => {
    reflector.getAllAndOverride.mockReturnValue(true); // IS_SETUP_ROUTE_KEY
    const result = await guard.canActivate(ctx);
    expect(result).toBe(true);
    expect(authTokenRepo.getSetupState).not.toHaveBeenCalled();
  });

  // ── Setup not complete ────────────────────────────────────────────────

  it('throws 503 when setup is not complete', async () => {
    authTokenRepo.getSetupState.mockResolvedValue({
      setupComplete: false,
      adminUserId: '',
      orgId: '',
      completedAt: '',
    });
    await expect(guard.canActivate(ctx)).rejects.toThrow(HttpException);
  });

  it('returns 503 with SETUP_REQUIRED error code', async () => {
    authTokenRepo.getSetupState.mockResolvedValue({
      setupComplete: false,
      adminUserId: '',
      orgId: '',
      completedAt: '',
    });
    try {
      await guard.canActivate(ctx);
    } catch (e) {
      expect(e).toBeInstanceOf(HttpException);
      const res = (e as HttpException).getResponse() as Record<string, unknown>;
      expect(res.errorCode).toBe('SETUP_REQUIRED');
      expect((e as HttpException).getStatus()).toBe(HttpStatus.SERVICE_UNAVAILABLE);
    }
  });

  // ── Setup complete (DB path) ──────────────────────────────────────────

  it('allows through and caches when DB reports setup complete', async () => {
    authTokenRepo.getSetupState.mockResolvedValue({
      setupComplete: true,
      adminUserId: 'user-123',
      orgId: 'org-123',
      completedAt: '2024-01-01T00:00:00Z',
    });

    const result = await guard.canActivate(ctx);
    expect(result).toBe(true);

    // Second call should use the in-process cache, not hit DB again
    const result2 = await guard.canActivate(ctx);
    expect(result2).toBe(true);
    expect(authTokenRepo.getSetupState).toHaveBeenCalledTimes(1);
  });

  // ── signalSetupComplete() ─────────────────────────────────────────────

  it('allows through immediately after signalSetupComplete() without a DB call', async () => {
    // Guard starts with no cached state
    guard.signalSetupComplete();

    const result = await guard.canActivate(ctx);
    expect(result).toBe(true);
    expect(authTokenRepo.getSetupState).not.toHaveBeenCalled();
  });

  it('signalSetupComplete() closes the 5s TTL window — no 503 after setup', async () => {
    // Simulate: guard has seen setup=false and cached it within the TTL window
    authTokenRepo.getSetupState.mockResolvedValue({
      setupComplete: false,
      adminUserId: '',
      orgId: '',
      completedAt: '',
    });
    await expect(guard.canActivate(ctx)).rejects.toThrow();

    // Setup completes — signal the guard
    guard.signalSetupComplete();

    // Next request must succeed, not throw 503 from stale cache
    const result = await guard.canActivate(ctx);
    expect(result).toBe(true);
  });

  // ── DB error fallback ─────────────────────────────────────────────────

  it('throws 503 (not 500) when DB throws during setup check', async () => {
    authTokenRepo.getSetupState.mockRejectedValue(new Error('DB connection refused'));
    const error = await guard.canActivate(ctx).catch((e: unknown) => e);
    expect(error).toBeInstanceOf(HttpException);
    expect((error as HttpException).getStatus()).toBe(HttpStatus.SERVICE_UNAVAILABLE);
  });
});
