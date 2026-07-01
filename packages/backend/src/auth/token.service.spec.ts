import { JwtService } from '@nestjs/jwt';
import { ConfigService } from '@nestjs/config';
import { Test, TestingModule } from '@nestjs/testing';
import {
  AUTH_TOKEN_REPOSITORY,
  type IAuthTokenRepository,
  type RefreshToken,
} from '@skillspell/shared';
import { TokenService } from './token.service';

/**
 * Unit tests for TokenService — JWT and refresh token management.
 *
 * Tests cover:
 * - generateAccessToken: JWT payload construction
 * - generateRefreshToken: hash storage, ID format
 * - generateTokenPair: combined access + refresh
 * - rotateRefreshTokenForUser: happy path, hash mismatch (theft detection),
 *   revoked token reuse, expired token
 * - decodeTokenIgnoringExpiry: valid/invalid tokens
 * - hashToken: deterministic SHA-256
 * - onModuleInit / onModuleDestroy: timer lifecycle
 */

const TEST_USER = {
  id: 'user-1',
  orgId: 'org-1',
  email: 'admin@test.com',
  firstName: 'Admin',
  lastName: 'User',
  role: 'owner' as const,
  isActive: true,
  authProviders: ['local' as const],
  profileComplete: true,
  twoFactorEnabled: false,
  createdAt: '2024-01-01T00:00:00Z',
  updatedAt: '2024-01-01T00:00:00Z',
};

describe('TokenService', () => {
  let service: TokenService;
  let jwtService: jest.Mocked<JwtService>;
  let authTokenRepo: jest.Mocked<IAuthTokenRepository>;

  beforeEach(async () => {
    jwtService = {
      sign: jest.fn().mockReturnValue('signed-jwt-token'),
      verify: jest.fn(),
    } as unknown as jest.Mocked<JwtService>;

    authTokenRepo = {
      saveRefreshToken: jest.fn(),
      findRefreshToken: jest.fn(),
      findRefreshTokenByTokenId: jest.fn(),
      revokeRefreshToken: jest.fn(),
      revokeAllRefreshTokens: jest.fn(),
      cleanupExpiredTokens: jest.fn(),
      deleteAllExpiredTokens: jest.fn().mockResolvedValue(0),
      getSetupState: jest.fn(),
      saveSetupState: jest.fn(),
      saveSsoLink: jest.fn(),
      findBySsoProvider: jest.fn(),
      getSsoLinks: jest.fn(),
      removeSsoLink: jest.fn(),
    } as jest.Mocked<IAuthTokenRepository>;

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        TokenService,
        { provide: JwtService, useValue: jwtService },
        {
          provide: ConfigService,
          useValue: {
            get: jest.fn().mockReturnValue('7d'),
          },
        },
        { provide: AUTH_TOKEN_REPOSITORY, useValue: authTokenRepo },
      ],
    }).compile();

    service = module.get<TokenService>(TokenService);
  });

  afterEach(() => {
    // Clean up timers set by onModuleInit (if called)
    service.onModuleDestroy();
  });

  // ── generateAccessToken ───────────────────────────────────────────────

  describe('generateAccessToken', () => {
    it('should sign a JWT with user payload', () => {
      const result = service.generateAccessToken(TEST_USER);

      expect(result).toBe('signed-jwt-token');
      expect(jwtService.sign).toHaveBeenCalledWith({
        sub: 'user-1',
        email: 'admin@test.com',
        role: 'owner',
        firstName: 'Admin',
        lastName: 'User',
      });
    });
  });

  // ── generateRefreshToken ──────────────────────────────────────────────

  describe('generateRefreshToken', () => {
    it('should generate a token with tokenId.randomData format', async () => {
      const result = await service.generateRefreshToken('user-1', 'Chrome');

      // Token format: uuid.uuid
      expect(result).toMatch(
        /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}\./,
      );
      expect(authTokenRepo.saveRefreshToken).toHaveBeenCalledWith(
        expect.objectContaining({
          userId: 'user-1',
          deviceInfo: 'Chrome',
          revoked: false,
        }),
      );
    });

    it('should store token hash, not the raw token', async () => {
      const rawToken = await service.generateRefreshToken('user-1');

      const savedRecord =
        authTokenRepo.saveRefreshToken.mock.calls[0][0];
      // The stored hash should NOT equal the raw token
      expect(savedRecord.tokenHash).not.toBe(rawToken);
      // The hash should be a valid SHA-256 hex string (64 chars)
      expect(savedRecord.tokenHash).toMatch(/^[0-9a-f]{64}$/);
    });
  });

  // ── generateTokenPair ─────────────────────────────────────────────────

  describe('generateTokenPair', () => {
    it('should return both access and refresh tokens', async () => {
      const { accessToken, refreshToken } =
        await service.generateTokenPair(TEST_USER, 'device');

      expect(accessToken).toBe('signed-jwt-token');
      expect(refreshToken).toBeTruthy();
      expect(authTokenRepo.saveRefreshToken).toHaveBeenCalled();
    });
  });

  // ── rotateRefreshTokenForUser ─────────────────────────────────────────

  describe('rotateRefreshTokenForUser', () => {
    it('should return null for empty token', async () => {
      const result = await service.rotateRefreshTokenForUser('', 'user-1');
      expect(result).toBeNull();
    });

    it('should return null when token not found in DB', async () => {
      authTokenRepo.findRefreshToken.mockResolvedValue(null);

      const result = await service.rotateRefreshTokenForUser(
        'token-id.secret',
        'user-1',
      );
      expect(result).toBeNull();
    });

    it('should revoke ALL tokens on hash mismatch (theft detection)', async () => {
      const record: RefreshToken = {
        id: 'token-id',
        userId: 'user-1',
        tokenHash: 'different-hash',
        expiresAt: new Date(Date.now() + 86400000).toISOString(),
        createdAt: '2024-01-01T00:00:00Z',
        revoked: false,
      };
      authTokenRepo.findRefreshToken.mockResolvedValue(record);

      const result = await service.rotateRefreshTokenForUser(
        'token-id.secret',
        'user-1',
      );

      expect(result).toBeNull();
      expect(authTokenRepo.revokeAllRefreshTokens).toHaveBeenCalledWith(
        'user-1',
      );
    });

    it('should revoke ALL tokens when a revoked token is reused', async () => {
      // Compute the actual hash to bypass the hash check
      const rawToken = 'token-id.secret';
      const tokenHash = service.hashToken(rawToken);

      const record: RefreshToken = {
        id: 'token-id',
        userId: 'user-1',
        tokenHash,
        expiresAt: new Date(Date.now() + 86400000).toISOString(),
        createdAt: '2024-01-01T00:00:00Z',
        revoked: true,
      };
      authTokenRepo.findRefreshToken.mockResolvedValue(record);

      const result = await service.rotateRefreshTokenForUser(rawToken, 'user-1');

      expect(result).toBeNull();
      expect(authTokenRepo.revokeAllRefreshTokens).toHaveBeenCalledWith(
        'user-1',
      );
    });

    it('should return null for expired token', async () => {
      const rawToken = 'token-id.secret';
      const tokenHash = service.hashToken(rawToken);

      const record: RefreshToken = {
        id: 'token-id',
        userId: 'user-1',
        tokenHash,
        expiresAt: new Date(Date.now() - 1000).toISOString(), // expired
        createdAt: '2024-01-01T00:00:00Z',
        revoked: false,
      };
      authTokenRepo.findRefreshToken.mockResolvedValue(record);

      const result = await service.rotateRefreshTokenForUser(rawToken, 'user-1');
      expect(result).toBeNull();
    });

    it('should successfully rotate a valid token', async () => {
      const rawToken = 'token-id.secret';
      const tokenHash = service.hashToken(rawToken);

      const record: RefreshToken = {
        id: 'token-id',
        userId: 'user-1',
        tokenHash,
        expiresAt: new Date(Date.now() + 86400000).toISOString(),
        createdAt: '2024-01-01T00:00:00Z',
        revoked: false,
      };
      authTokenRepo.findRefreshToken.mockResolvedValue(record);

      const result = await service.rotateRefreshTokenForUser(rawToken, 'user-1');

      expect(result).toBeTruthy();
      // Old token should be revoked
      expect(authTokenRepo.revokeRefreshToken).toHaveBeenCalledWith(
        'token-id',
        'user-1',
      );
      // New token should be saved
      expect(authTokenRepo.saveRefreshToken).toHaveBeenCalled();
    });
  });

  // ── decodeTokenIgnoringExpiry ─────────────────────────────────────────

  describe('decodeTokenIgnoringExpiry', () => {
    it('should return decoded payload for valid token', () => {
      const payload = { sub: 'user-1', email: 'test@test.com' };
      jwtService.verify.mockReturnValue(payload as any);

      const result = service.decodeTokenIgnoringExpiry('some-token');
      expect(result).toEqual(payload);
      expect(jwtService.verify).toHaveBeenCalledWith('some-token', {
        ignoreExpiration: true,
      });
    });

    it('should return null for invalid token', () => {
      jwtService.verify.mockImplementation(() => {
        throw new Error('Invalid token');
      });

      const result = service.decodeTokenIgnoringExpiry('invalid-token');
      expect(result).toBeNull();
    });
  });

  // ── hashToken ─────────────────────────────────────────────────────────

  describe('hashToken', () => {
    it('should produce deterministic SHA-256 hex hash', () => {
      const hash1 = service.hashToken('test-token');
      const hash2 = service.hashToken('test-token');

      expect(hash1).toBe(hash2);
      expect(hash1).toMatch(/^[0-9a-f]{64}$/);
    });

    it('should produce different hashes for different tokens', () => {
      const hash1 = service.hashToken('token-a');
      const hash2 = service.hashToken('token-b');
      expect(hash1).not.toBe(hash2);
    });
  });

  // ── Timer lifecycle ───────────────────────────────────────────────────

  describe('onModuleInit / onModuleDestroy', () => {
    it('should set up cleanup timers on init and clear on destroy', () => {
      jest.useFakeTimers();

      service.onModuleInit();

      // Advance 30s for startup timer
      jest.advanceTimersByTime(30_000);
      expect(authTokenRepo.deleteAllExpiredTokens).toHaveBeenCalledTimes(1);

      service.onModuleDestroy();

      jest.useRealTimers();
    });
  });
});
