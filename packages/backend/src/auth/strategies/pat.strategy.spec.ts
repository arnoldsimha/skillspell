import { Test, TestingModule } from '@nestjs/testing';
import { ForbiddenException, UnauthorizedException } from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import { ExecutionContext } from '@nestjs/common';
import { USER_REPOSITORY, type IUserRepository } from '@skillspell/shared';
import { PatStrategy } from './pat.strategy';
import { PersonalAccessTokensService } from '../personal-access-tokens.service';
import { JwtAuthGuard } from '../guards/jwt-auth.guard';

// ---------------------------------------------------------------------------
// Shared fixtures
// ---------------------------------------------------------------------------

const mockUser = {
  id: 'user-uuid',
  email: 'alice@example.com',
  isActive: true,
};

const mockPat = {
  id: 'pat-uuid',
  userId: 'user-uuid',
  name: 'CI token',
  prefix: 'abcd1234',
  tokenHash: 'hashed',
  expiresAt: new Date(Date.now() + 86_400_000).toISOString(), // 1 day from now
  revokedAt: null,
  lastUsedAt: null,
  createdAt: new Date().toISOString(),
};

const mockPatService: jest.Mocked<Pick<PersonalAccessTokensService, 'validatePat' | 'updateLastUsedAt'>> = {
  validatePat: jest.fn(),
  updateLastUsedAt: jest.fn(),
};

const mockUserRepo: jest.Mocked<Pick<IUserRepository, 'findById'>> = {
  findById: jest.fn(),
};

// ---------------------------------------------------------------------------
// Helper — build a minimal Express-like request object
// ---------------------------------------------------------------------------

function makeRequest(rawToken: string, overrides: Record<string, unknown> = {}): any {
  return {
    headers: { authorization: `Bearer ${rawToken}` },
    ...overrides,
  };
}

// ---------------------------------------------------------------------------
// PatStrategy — validate()
// ---------------------------------------------------------------------------

describe('PatStrategy', () => {
  let strategy: PatStrategy;

  beforeEach(async () => {
    jest.clearAllMocks();

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        PatStrategy,
        { provide: PersonalAccessTokensService, useValue: mockPatService },
        { provide: USER_REPOSITORY, useValue: mockUserRepo },
      ],
    }).compile();

    strategy = module.get<PatStrategy>(PatStrategy);
  });

  describe('validate', () => {
    it('returns null for non-sksp_ tokens so the JWT strategy can run — D-05', async () => {
      const req = makeRequest('eyJhbGciOiJIUzI1NiJ9.jwt.payload');
      const result = await strategy.validate(req);
      expect(result).toBeNull();
      expect(mockPatService.validatePat).not.toHaveBeenCalled();
    });

    it('returns null when Authorization header is absent', async () => {
      const req = { headers: {} };
      const result = await strategy.validate(req as any);
      expect(result).toBeNull();
    });

    it('returns the user for a valid non-expired non-revoked PAT — PAT-02, T-3-03', async () => {
      mockPatService.validatePat.mockResolvedValue(mockPat as any);
      mockUserRepo.findById.mockResolvedValue(mockUser as any);
      mockPatService.updateLastUsedAt.mockResolvedValue(undefined);

      const req = makeRequest('sksp_validtoken');
      const result = await strategy.validate(req);

      expect(result).toEqual(mockUser);
      expect(mockPatService.validatePat).toHaveBeenCalledWith('sksp_validtoken');
    });

    it('sets _patAuthenticated on the request after successful validation', async () => {
      mockPatService.validatePat.mockResolvedValue(mockPat as any);
      mockUserRepo.findById.mockResolvedValue(mockUser as any);
      mockPatService.updateLastUsedAt.mockResolvedValue(undefined);

      const req = makeRequest('sksp_validtoken');
      await strategy.validate(req);

      expect((req as any)._patAuthenticated).toBe(true);
    });

    it('does NOT set _patAuthenticated on the request for non-PAT tokens', async () => {
      const req = makeRequest('eyJhbGciOiJIUzI1NiJ9.jwt.payload');
      await strategy.validate(req);

      expect((req as any)._patAuthenticated).toBeUndefined();
    });

    it('fires lastUsedAt update non-blocking after successful validate — D-06', async () => {
      mockPatService.validatePat.mockResolvedValue(mockPat as any);
      mockUserRepo.findById.mockResolvedValue(mockUser as any);
      mockPatService.updateLastUsedAt.mockResolvedValue(undefined);

      const req = makeRequest('sksp_validtoken');
      await strategy.validate(req);

      expect(mockPatService.updateLastUsedAt).toHaveBeenCalledWith(mockPat.id);
    });

    it('throws UnauthorizedException if PAT not found in DB — PAT-02', async () => {
      mockPatService.validatePat.mockRejectedValue(
        new UnauthorizedException('Invalid personal access token'),
      );

      const req = makeRequest('sksp_unknowntoken');
      await expect(strategy.validate(req)).rejects.toThrow(UnauthorizedException);
    });

    it('throws UnauthorizedException for revoked PAT — PAT-02, D-07, T-3-03', async () => {
      mockPatService.validatePat.mockRejectedValue(
        new UnauthorizedException('Personal access token has been revoked'),
      );

      const req = makeRequest('sksp_revokedtoken');
      await expect(strategy.validate(req)).rejects.toThrow(UnauthorizedException);
    });

    it('throws UnauthorizedException for expired PAT — PAT-02, D-07, T-3-03', async () => {
      mockPatService.validatePat.mockRejectedValue(
        new UnauthorizedException('Personal access token has expired'),
      );

      const req = makeRequest('sksp_expiredtoken');
      await expect(strategy.validate(req)).rejects.toThrow(UnauthorizedException);
    });

    it('throws UnauthorizedException if the associated user is not found', async () => {
      mockPatService.validatePat.mockResolvedValue(mockPat as any);
      mockUserRepo.findById.mockResolvedValue(null);

      const req = makeRequest('sksp_validtoken');
      await expect(strategy.validate(req)).rejects.toThrow(
        new UnauthorizedException('User associated with token not found'),
      );
    });

    it('throws UnauthorizedException if the associated user is deactivated', async () => {
      mockPatService.validatePat.mockResolvedValue(mockPat as any);
      mockUserRepo.findById.mockResolvedValue({ ...mockUser, isActive: false } as any);

      const req = makeRequest('sksp_validtoken');
      await expect(strategy.validate(req)).rejects.toThrow(
        new UnauthorizedException('Account is deactivated'),
      );
    });
  });
});

// ---------------------------------------------------------------------------
// JwtAuthGuard — PAT read-only scope enforcement
//
// PATs are read-only: GET requests are allowed on any route,
// POST/PUT/PATCH/DELETE are blocked with 403 Forbidden.
// ---------------------------------------------------------------------------

describe('JwtAuthGuard — PAT read-only scope enforcement', () => {
  let guard: JwtAuthGuard;
  let superHandleRequestSpy: jest.SpyInstance;

  function makeContext(method: string, patAuthenticated = false): ExecutionContext {
    const request = { method, _patAuthenticated: patAuthenticated, headers: {} };
    return {
      switchToHttp: () => ({ getRequest: () => request }),
      getHandler: () => jest.fn(),
      getClass: () => jest.fn(),
    } as unknown as ExecutionContext;
  }

  beforeEach(async () => {
    jest.clearAllMocks();
    const module: TestingModule = await Test.createTestingModule({
      providers: [JwtAuthGuard, Reflector],
    }).compile();
    guard = module.get<JwtAuthGuard>(JwtAuthGuard);
    superHandleRequestSpy = jest
      .spyOn(Object.getPrototypeOf(Object.getPrototypeOf(guard)), 'handleRequest')
      .mockReturnValue(mockUser);
  });

  afterEach(() => superHandleRequestSpy.mockRestore());

  it('allows PAT GET requests', () => {
    expect(() => guard.handleRequest(null, mockUser, null, makeContext('GET', true))).not.toThrow();
  });

  it('blocks PAT POST requests', () => {
    expect(() => guard.handleRequest(null, mockUser, null, makeContext('POST', true))).toThrow(
      new ForbiddenException('PAT tokens are read-only and cannot perform write operations'),
    );
  });

  it('blocks PAT PATCH requests', () => {
    expect(() => guard.handleRequest(null, mockUser, null, makeContext('PATCH', true))).toThrow(ForbiddenException);
  });

  it('blocks PAT DELETE requests', () => {
    expect(() => guard.handleRequest(null, mockUser, null, makeContext('DELETE', true))).toThrow(ForbiddenException);
  });

  it('allows JWT POST requests (no _patAuthenticated flag)', () => {
    expect(() => guard.handleRequest(null, mockUser, null, makeContext('POST', false))).not.toThrow();
  });

  it('allows JWT DELETE requests', () => {
    expect(() => guard.handleRequest(null, mockUser, null, makeContext('DELETE', false))).not.toThrow();
  });

  it('UnauthorizedException from super propagates before scope check', () => {
    superHandleRequestSpy.mockImplementation(() => { throw new UnauthorizedException(); });
    expect(() => guard.handleRequest(new Error(), null, null, makeContext('GET', true))).toThrow(UnauthorizedException);
  });
});
