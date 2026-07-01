import { Test, type TestingModule } from '@nestjs/testing';
import { CACHE_MANAGER } from '@nestjs/cache-manager';
import { USER_REPOSITORY, type IUserRepository } from '@skillspell/shared';
import { CliAuthService } from './cli-auth.service.js';
import { TokenService } from './token.service.js';

// In-memory store backing the CACHE_MANAGER mock
const cacheStore = new Map<string, unknown>();

const mockCacheManager = {
  get: jest.fn((key: string) => Promise.resolve(cacheStore.get(key) ?? null)),
  set: jest.fn((key: string, value: unknown) => { cacheStore.set(key, value); return Promise.resolve(); }),
  del: jest.fn((key: string) => { cacheStore.delete(key); return Promise.resolve(); }),
};

describe('CliAuthService', () => {
  let service: CliAuthService;
  let tokenService: jest.Mocked<Partial<TokenService>>;
  let userRepo: jest.Mocked<Pick<IUserRepository, 'findById'>>;

  beforeEach(async () => {
    cacheStore.clear();
    jest.clearAllMocks();

    tokenService = {
      rotateRefreshTokenForUser: jest.fn(),
      generateAccessToken: jest.fn().mockReturnValue('new.access.token'),
    };
    userRepo = {
      findById: jest.fn().mockResolvedValue({
        id: 'u1',
        email: 'user@example.com',
        role: 'user',
        isActive: true,
      }),
    };

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        CliAuthService,
        { provide: TokenService, useValue: tokenService },
        { provide: USER_REPOSITORY, useValue: userRepo },
        { provide: CACHE_MANAGER, useValue: mockCacheManager },
      ],
    }).compile();

    service = module.get<CliAuthService>(CliAuthService);
  });

  describe('consumeCliCode — single-use + TTL (D-09)', () => {
    const entry = {
      userId: 'u1',
      email: 'user@example.com',
      accessToken: 'a.t',
      refreshToken: 'r.t',
      expiresAt: Date.now() + 60_000,
    };

    it('7-03-01: returns entry and deletes code on first use', async () => {
      await service.storeCliCode('code1', entry);
      const result = await service.consumeCliCode('code1');
      expect(result).toEqual(entry);
      // Second call should return null (single-use: deleted on first consume)
      expect(await service.consumeCliCode('code1')).toBeNull();
    });

    it('7-03-02: returns null on code replay', async () => {
      await service.storeCliCode('code2', entry);
      await service.consumeCliCode('code2'); // first use
      expect(await service.consumeCliCode('code2')).toBeNull();
    });

    it('7-03-03: returns null after 60-second TTL', async () => {
      const expiredEntry = { ...entry, expiresAt: Date.now() - 1 };
      await service.storeCliCode('code3', expiredEntry);
      expect(await service.consumeCliCode('code3')).toBeNull();
    });
  });

  describe('refreshCliToken (D-11)', () => {
    it('7-03-04: rotates refresh token and returns new accessToken + refreshToken', async () => {
      (tokenService.rotateRefreshTokenForUser as jest.Mock).mockResolvedValue('new.refresh.token');
      const result = await service.refreshCliToken('old.refresh.token', 'u1');
      expect(result).toEqual({ accessToken: 'new.access.token', refreshToken: 'new.refresh.token' });
      expect(tokenService.rotateRefreshTokenForUser).toHaveBeenCalledWith('old.refresh.token', 'u1', 'SkillSpell CLI');
    });

    it('returns null when refresh token not found or revoked', async () => {
      (tokenService.rotateRefreshTokenForUser as jest.Mock).mockResolvedValue(null);
      const result = await service.refreshCliToken('bad.refresh.token', 'u1');
      expect(result).toBeNull();
    });
  });
});
