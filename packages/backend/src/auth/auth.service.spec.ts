import {
  BadRequestException,
  ConflictException,
  ForbiddenException,
  InternalServerErrorException,
  UnauthorizedException,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { Test, TestingModule } from '@nestjs/testing';
import * as bcrypt from 'bcryptjs';

jest.mock('bcryptjs', () => ({
  compare: jest.fn(),
  hash: jest.fn().mockResolvedValue('$2a$10$hashed'),
  hashSync: jest.fn().mockReturnValue('$2a$10$dummyhash'),
}));

import {
  USER_REPOSITORY,
  CREDENTIAL_REPOSITORY,
  AUTH_TOKEN_REPOSITORY,
  PAT_REPOSITORY,
  ORGANIZATION_REPOSITORY,
  type IUserRepository,
  type ICredentialRepository,
  type IAuthTokenRepository,
  type IPersonalAccessTokenRepository,
  type IOrganizationRepository,
  type User,
  type Organization,
  type UserCredential,
} from '@skillspell/shared';
import { AuthService } from './auth.service';
import { TokenService } from './token.service';

/**
 * Unit tests for AuthService — core authentication logic.
 *
 * Tests cover:
 * - validateLocalUser: happy path, lockout, wrong password, lockout expiry
 * - login: returns tokens on success
 * - refreshTokens: delegation to TokenService
 * - logout: revokes refresh token
 * - setup: first-run flow, duplicate protection, compensating cleanup
 * - getSetupStatus: normal + error path
 * - changePassword: verification, hashing, token revocation
 * - validatePassword: min length enforcement
 */

const TEST_USER: User = {
  id: 'user-1',
  orgId: 'org-1',
  email: 'admin@test.com',
  firstName: 'Admin',
  lastName: 'User',
  role: 'owner',
  isActive: true,
  authProviders: ['local'],
  profileComplete: true,
  twoFactorEnabled: false,
  createdAt: '2024-01-01T00:00:00Z',
  updatedAt: '2024-01-01T00:00:00Z',
};

const TEST_CREDENTIAL: UserCredential = {
  userId: 'user-1',
  passwordHash: '$2a$10$hashedpassword',
  mustChangePassword: false,
  failedAttempts: 0,
  updatedAt: '2024-01-01T00:00:00Z',
};

const TEST_ORG: Organization = {
  id: 'org-1',
  name: 'Test Org',
  passwordLoginEnabled: true,
  ssoLoginEnabled: false,
  marketplaceAllowSelfApproval: false,
  marketplaceEnabled: true,
  createdAt: '2024-01-01T00:00:00Z',
  updatedAt: '2024-01-01T00:00:00Z',
};

describe('AuthService', () => {
  let service: AuthService;
  let userRepo: jest.Mocked<IUserRepository>;
  let credentialRepo: jest.Mocked<ICredentialRepository>;
  let authTokenRepo: jest.Mocked<IAuthTokenRepository>;
  let patRepo: jest.Mocked<IPersonalAccessTokenRepository>;
  let orgRepo: jest.Mocked<IOrganizationRepository>;
  let tokenService: jest.Mocked<TokenService>;

  beforeEach(async () => {
    userRepo = {
      findByEmail: jest.fn(),
      findById: jest.fn(),
      findAll: jest.fn(),
      create: jest.fn(),
      update: jest.fn(),
      deactivate: jest.fn(),
      findByOwner: jest.fn(),
    } as unknown as jest.Mocked<IUserRepository>;

    credentialRepo = {
      getCredential: jest.fn(),
      saveCredential: jest.fn(),
      updateCredential: jest.fn(),
    } as jest.Mocked<ICredentialRepository>;

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

    patRepo = {
      create: jest.fn(),
      findByTokenHash: jest.fn(),
      findByUserId: jest.fn(),
      findById: jest.fn(),
      revoke: jest.fn(),
      revokeAllByUserId: jest.fn(),
      updateLastUsedAt: jest.fn(),
    } as jest.Mocked<IPersonalAccessTokenRepository>;

    orgRepo = {
      findSingleton: jest.fn(),
      create: jest.fn(),
      update: jest.fn(),
      findById: jest.fn(),
    } as unknown as jest.Mocked<IOrganizationRepository>;

    tokenService = {
      generateTokenPair: jest.fn().mockResolvedValue({
        accessToken: 'access-token',
        refreshToken: 'refresh-token',
      }),
      generateAccessToken: jest.fn().mockReturnValue('new-access-token'),
      rotateRefreshTokenForUser: jest.fn(),
      decodeTokenIgnoringExpiry: jest.fn(),
      revokeRefreshToken: jest.fn(),
      revokeAllRefreshTokens: jest.fn(),
      hashToken: jest.fn().mockReturnValue('hashed'),
    } as unknown as jest.Mocked<TokenService>;

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        AuthService,
        {
          provide: ConfigService,
          useValue: {
            get: jest.fn().mockReturnValue({
              bcryptRounds: 10,
              passwordMinLength: 8,
              lockoutThreshold: 5,
              lockoutDurationMinutes: 15,
              jwtSecret: 'test-secret',
              refreshTokenExpiry: '7d',
            }),
          },
        },
        { provide: TokenService, useValue: tokenService },
        { provide: USER_REPOSITORY, useValue: userRepo },
        { provide: CREDENTIAL_REPOSITORY, useValue: credentialRepo },
        { provide: AUTH_TOKEN_REPOSITORY, useValue: authTokenRepo },
        { provide: PAT_REPOSITORY, useValue: patRepo },
        { provide: ORGANIZATION_REPOSITORY, useValue: orgRepo },
      ],
    })
      .compile();

    service = module.get<AuthService>(AuthService);

    // Silence the NestJS Logger on the service instance so expected error/warn
    // log calls don't pollute test output.
    const logger = (service as any).logger;
    jest.spyOn(logger, 'error').mockImplementation(() => {});
    jest.spyOn(logger, 'warn').mockImplementation(() => {});
    jest.spyOn(logger, 'log').mockImplementation(() => {});
  });

  // ── validateLocalUser ─────────────────────────────────────────────────

  describe('validateLocalUser', () => {
    it('should return user on valid credentials', async () => {
      orgRepo.findSingleton.mockResolvedValue(TEST_ORG);
      userRepo.findByEmail.mockResolvedValue(TEST_USER);
      credentialRepo.getCredential.mockResolvedValue(TEST_CREDENTIAL);
      (bcrypt.compare as jest.Mock).mockResolvedValue(true);

      const result = await service.validateLocalUser('admin@test.com', 'Valid1234!');

      expect(result).toEqual(TEST_USER);
      expect(userRepo.update).toHaveBeenCalledWith('user-1', expect.objectContaining({
        lastLoginAt: expect.any(String),
      }));
    });

    it('should throw UnauthorizedException when password login is disabled', async () => {
      orgRepo.findSingleton.mockResolvedValue({
        ...TEST_ORG,
        passwordLoginEnabled: false,
      });

      await expect(
        service.validateLocalUser('admin@test.com', 'password'),
      ).rejects.toThrow(UnauthorizedException);
    });

    it('should throw UnauthorizedException when user not found', async () => {
      orgRepo.findSingleton.mockResolvedValue(TEST_ORG);
      userRepo.findByEmail.mockResolvedValue(null);

      await expect(
        service.validateLocalUser('unknown@test.com', 'password'),
      ).rejects.toThrow(UnauthorizedException);
    });

    it('should run a dummy bcrypt compare when user not found (timing equalization)', async () => {
      orgRepo.findSingleton.mockResolvedValue(TEST_ORG);
      userRepo.findByEmail.mockResolvedValue(null);
      (bcrypt.compare as jest.Mock).mockClear();

      await expect(
        service.validateLocalUser('unknown@test.com', 'password'),
      ).rejects.toThrow(UnauthorizedException);

      // The no-user path must still call bcrypt.compare so it does not return
      // measurably faster than the wrong-password path (user enumeration).
      expect(bcrypt.compare).toHaveBeenCalledTimes(1);
    });

    it('should throw ForbiddenException when account is deactivated', async () => {
      orgRepo.findSingleton.mockResolvedValue(TEST_ORG);
      userRepo.findByEmail.mockResolvedValue({
        ...TEST_USER,
        isActive: false,
      });

      await expect(
        service.validateLocalUser('admin@test.com', 'password'),
      ).rejects.toThrow(ForbiddenException);
    });

    it('should throw UnauthorizedException when account uses SSO only', async () => {
      orgRepo.findSingleton.mockResolvedValue(TEST_ORG);
      userRepo.findByEmail.mockResolvedValue({
        ...TEST_USER,
        authProviders: ['saml'],
      });

      await expect(
        service.validateLocalUser('admin@test.com', 'password'),
      ).rejects.toThrow(UnauthorizedException);
    });

    it('should throw ForbiddenException when account is locked', async () => {
      orgRepo.findSingleton.mockResolvedValue(TEST_ORG);
      userRepo.findByEmail.mockResolvedValue(TEST_USER);
      credentialRepo.getCredential.mockResolvedValue({
        ...TEST_CREDENTIAL,
        lockedUntil: new Date(Date.now() + 60_000).toISOString(),
      });

      await expect(
        service.validateLocalUser('admin@test.com', 'password'),
      ).rejects.toThrow(ForbiddenException);
    });

    it('clears failedAttempts exactly once (success path) when expired lock + correct password', async () => {
      orgRepo.findSingleton.mockResolvedValue(TEST_ORG);
      userRepo.findByEmail.mockResolvedValue(TEST_USER);
      credentialRepo.getCredential.mockResolvedValue({
        ...TEST_CREDENTIAL,
        failedAttempts: 5,
        lockedUntil: new Date(Date.now() - 60_000).toISOString(),
      });
      (bcrypt.compare as jest.Mock).mockResolvedValue(true);

      await service.validateLocalUser('admin@test.com', 'Valid1234!');

      // Only one updateCredential call — the success-path reset.
      // If the old code ran, there would be TWO calls (pre-verify reset + success reset).
      expect(credentialRepo.updateCredential).toHaveBeenCalledTimes(1);
      expect(credentialRepo.updateCredential).toHaveBeenCalledWith('user-1', {
        failedAttempts: 0,
        lockedUntil: undefined,
      });
    });

    it('re-locks immediately when expired lock + wrong password (no free-attempt reset)', async () => {
      orgRepo.findSingleton.mockResolvedValue(TEST_ORG);
      userRepo.findByEmail.mockResolvedValue(TEST_USER);
      // failedAttempts is at threshold (5); lock has expired
      credentialRepo.getCredential.mockResolvedValue({
        ...TEST_CREDENTIAL,
        failedAttempts: 5,
        lockedUntil: new Date(Date.now() - 1_000).toISOString(),
      });
      (bcrypt.compare as jest.Mock).mockResolvedValue(false);

      await expect(
        service.validateLocalUser('admin@test.com', 'wrong'),
      ).rejects.toThrow(UnauthorizedException);

      // Exactly one call — the failure-path increment. NOT two calls (no pre-verify reset).
      expect(credentialRepo.updateCredential).toHaveBeenCalledTimes(1);
      // Increments from 5 → 6, re-locks immediately (still >= threshold)
      expect(credentialRepo.updateCredential).toHaveBeenCalledWith('user-1', {
        failedAttempts: 6,
        lockedUntil: expect.any(String),
      });
    });

    it('should increment failed attempts on wrong password', async () => {
      orgRepo.findSingleton.mockResolvedValue(TEST_ORG);
      userRepo.findByEmail.mockResolvedValue(TEST_USER);
      credentialRepo.getCredential.mockResolvedValue({
        ...TEST_CREDENTIAL,
        failedAttempts: 0,
      });
      (bcrypt.compare as jest.Mock).mockResolvedValue(false);

      await expect(
        service.validateLocalUser('admin@test.com', 'wrong'),
      ).rejects.toThrow(UnauthorizedException);

      expect(credentialRepo.updateCredential).toHaveBeenCalledWith('user-1', {
        failedAttempts: 1,
      });
    });

    it('should lock account after reaching lockout threshold', async () => {
      orgRepo.findSingleton.mockResolvedValue(TEST_ORG);
      userRepo.findByEmail.mockResolvedValue(TEST_USER);
      credentialRepo.getCredential.mockResolvedValue({
        ...TEST_CREDENTIAL,
        failedAttempts: 4, // threshold is 5, so next attempt = 5 → lock
      });
      (bcrypt.compare as jest.Mock).mockResolvedValue(false);

      await expect(
        service.validateLocalUser('admin@test.com', 'wrong'),
      ).rejects.toThrow(UnauthorizedException);

      expect(credentialRepo.updateCredential).toHaveBeenCalledWith('user-1', {
        failedAttempts: 5,
        lockedUntil: expect.any(String),
      });
    });

    it('should reset failed attempts on successful login', async () => {
      orgRepo.findSingleton.mockResolvedValue(TEST_ORG);
      userRepo.findByEmail.mockResolvedValue(TEST_USER);
      credentialRepo.getCredential.mockResolvedValue({
        ...TEST_CREDENTIAL,
        failedAttempts: 3,
      });
      (bcrypt.compare as jest.Mock).mockResolvedValue(true);

      await service.validateLocalUser('admin@test.com', 'Valid1234!');

      expect(credentialRepo.updateCredential).toHaveBeenCalledWith('user-1', {
        failedAttempts: 0,
        lockedUntil: undefined,
      });
    });
  });

  // ── login ─────────────────────────────────────────────────────────────

  describe('login', () => {
    it('should return access and refresh tokens', async () => {
      orgRepo.findSingleton.mockResolvedValue(TEST_ORG);
      userRepo.findByEmail.mockResolvedValue(TEST_USER);
      credentialRepo.getCredential.mockResolvedValue(TEST_CREDENTIAL);
      (bcrypt.compare as jest.Mock).mockResolvedValue(true);

      const result = await service.login('admin@test.com', 'Valid1234!');

      expect(result).toEqual({
        accessToken: 'access-token',
        refreshToken: 'refresh-token',
        user: TEST_USER,
      });
      expect(tokenService.generateTokenPair).toHaveBeenCalledWith(TEST_USER, undefined);
    });
  });

  // ── refreshTokens ─────────────────────────────────────────────────────

  describe('refreshTokens', () => {
    it('should return refreshed tokens on valid request', async () => {
      tokenService.decodeTokenIgnoringExpiry.mockReturnValue({
        sub: 'user-1',
        email: 'admin@test.com',
        role: 'owner',
        firstName: 'Admin',
        lastName: 'User',
        iat: 0,
        exp: 0,
      });
      tokenService.rotateRefreshTokenForUser.mockResolvedValue('new-refresh');
      userRepo.findById.mockResolvedValue(TEST_USER);

      const result = await service.refreshTokens('old-refresh', 'expired-access');

      expect(result).toEqual({
        accessToken: 'new-access-token',
        refreshToken: 'new-refresh',
      });
    });

    it('should throw UnauthorizedException when no userId can be decoded', async () => {
      tokenService.decodeTokenIgnoringExpiry.mockReturnValue(null);

      await expect(
        service.refreshTokens('old-refresh', 'invalid-access'),
      ).rejects.toThrow(UnauthorizedException);
    });

    it('should throw UnauthorizedException when rotation fails', async () => {
      tokenService.decodeTokenIgnoringExpiry.mockReturnValue({
        sub: 'user-1',
        email: 'admin@test.com',
        role: 'owner',
        firstName: 'Admin',
        lastName: 'User',
        iat: 0,
        exp: 0,
      });
      tokenService.rotateRefreshTokenForUser.mockResolvedValue(null);

      await expect(
        service.refreshTokens('old-refresh', 'expired-access'),
      ).rejects.toThrow(UnauthorizedException);
    });

    it('should throw UnauthorizedException when user not found', async () => {
      tokenService.decodeTokenIgnoringExpiry.mockReturnValue({
        sub: 'user-1',
        email: 'admin@test.com',
        role: 'owner',
        firstName: 'Admin',
        lastName: 'User',
        iat: 0,
        exp: 0,
      });
      tokenService.rotateRefreshTokenForUser.mockResolvedValue('new-refresh');
      userRepo.findById.mockResolvedValue(null);

      await expect(
        service.refreshTokens('old-refresh', 'expired-access'),
      ).rejects.toThrow(UnauthorizedException);
    });

    // ── cookie-only refresh + enumeration-oracle hardening ──────────

    it('resolves userId from the refresh token record when no access token is supplied', async () => {
      // Cold boot (memory-only access token): no Authorization header.
      authTokenRepo.findRefreshTokenByTokenId.mockResolvedValue({
        userId: 'user-1',
      } as never);
      tokenService.rotateRefreshTokenForUser.mockResolvedValue('new-refresh');
      userRepo.findById.mockResolvedValue(TEST_USER);

      const result = await service.refreshTokens('token-id.secret');

      expect(authTokenRepo.findRefreshTokenByTokenId).toHaveBeenCalledWith('token-id');
      expect(result).toEqual({
        accessToken: 'new-access-token',
        refreshToken: 'new-refresh',
      });
    });

    it('returns an identical generic error whether the tokenId is unknown or the secret is wrong (no enumeration oracle)', async () => {
      // Case A: tokenId does not exist in the DB.
      authTokenRepo.findRefreshTokenByTokenId.mockResolvedValue(null);
      const unknownTokenId = await service
        .refreshTokens('does-not-exist.secret')
        .catch((e) => e as Error);

      // Case B: tokenId exists, but the full token fails hash/rotation.
      authTokenRepo.findRefreshTokenByTokenId.mockResolvedValue({
        userId: 'user-1',
      } as never);
      tokenService.rotateRefreshTokenForUser.mockResolvedValue(null);
      const wrongSecret = await service
        .refreshTokens('real-id.wrong-secret')
        .catch((e) => e as Error);

      expect(unknownTokenId).toBeInstanceOf(UnauthorizedException);
      expect(wrongSecret).toBeInstanceOf(UnauthorizedException);
      // The two failure modes are indistinguishable to the caller.
      expect((unknownTokenId as Error).message).toBe(
        (wrongSecret as Error).message,
      );
    });

    it('mirrors hashing work on the no-record path to blunt the timing side-channel', async () => {
      authTokenRepo.findRefreshTokenByTokenId.mockResolvedValue(null);

      await service.refreshTokens('does-not-exist.secret').catch(() => undefined);

      expect(tokenService.hashToken).toHaveBeenCalledWith('does-not-exist.secret');
    });
  });

  // ── logout ────────────────────────────────────────────────────────────

  describe('logout', () => {
    it('should revoke specific refresh token when provided', async () => {
      await service.logout('user-1', 'token-id.random-data');

      expect(tokenService.revokeRefreshToken).toHaveBeenCalledWith('token-id', 'user-1');
      expect(tokenService.revokeAllRefreshTokens).not.toHaveBeenCalled();
    });

    it('should revoke all tokens when no refresh token provided', async () => {
      await service.logout('user-1');

      expect(tokenService.revokeAllRefreshTokens).toHaveBeenCalledWith('user-1');
      expect(tokenService.revokeRefreshToken).not.toHaveBeenCalled();
    });
  });

  // ── setup ─────────────────────────────────────────────────────────────

  describe('setup', () => {
    const setupData = {
      email: 'admin@example.com',
      password: 'Str0ng!Pass',
      firstName: 'Admin',
      lastName: 'User',
      orgName: 'My Org',
      timezone: 'America/New_York',
    };

    it('should create org, user, credential, and return tokens', async () => {
      authTokenRepo.getSetupState.mockResolvedValue(null);
      orgRepo.findSingleton.mockResolvedValue(null);
      orgRepo.create.mockResolvedValue(TEST_ORG);
      userRepo.findByEmail.mockResolvedValue(null);
      userRepo.create.mockResolvedValue(TEST_USER);
      credentialRepo.saveCredential.mockResolvedValue();
      authTokenRepo.saveSetupState.mockResolvedValue();

      const result = await service.setup(setupData);

      expect(result).toEqual({
        accessToken: 'access-token',
        refreshToken: 'refresh-token',
        user: { ...TEST_USER, timezone: setupData.timezone },
      });
      expect(orgRepo.create).toHaveBeenCalledWith({ name: 'My Org' });
      expect(userRepo.create).toHaveBeenCalled();
      expect(credentialRepo.saveCredential).toHaveBeenCalled();
      expect(authTokenRepo.saveSetupState).toHaveBeenCalled();
    });

    it('should resume from existing org and user on retry', async () => {
      authTokenRepo.getSetupState.mockResolvedValue(null);
      orgRepo.findSingleton.mockResolvedValue(TEST_ORG); // org already exists
      userRepo.findByEmail.mockResolvedValue(TEST_USER); // user already exists
      credentialRepo.saveCredential.mockResolvedValue();
      authTokenRepo.saveSetupState.mockResolvedValue();

      await service.setup(setupData);

      expect(orgRepo.create).not.toHaveBeenCalled();
      expect(userRepo.create).not.toHaveBeenCalled();
      expect(credentialRepo.saveCredential).toHaveBeenCalled();
      expect(authTokenRepo.saveSetupState).toHaveBeenCalled();
    });

    it('should throw ConflictException if setup is already complete', async () => {
      authTokenRepo.getSetupState.mockResolvedValue({
        setupComplete: true,
        adminUserId: 'user-1',
        orgId: 'org-1',
        completedAt: new Date().toISOString(),
      });

      await expect(service.setup(setupData)).rejects.toThrow(ConflictException);
    });

    it('should throw BadRequestException for short password', async () => {
      await expect(
        service.setup({ ...setupData, password: 'Ab1!' }),
      ).rejects.toThrow(BadRequestException);
    });

    it('should propagate errors without compensating cleanup', async () => {
      authTokenRepo.getSetupState.mockResolvedValue(null);
      orgRepo.findSingleton.mockResolvedValue(null);
      orgRepo.create.mockResolvedValue(TEST_ORG);
      userRepo.findByEmail.mockResolvedValue(null);
      userRepo.create.mockResolvedValue(TEST_USER);
      credentialRepo.saveCredential.mockRejectedValue(new Error('DB error'));

      await expect(service.setup(setupData)).rejects.toThrow('DB error');
      expect(userRepo.deactivate).not.toHaveBeenCalled();
    });
  });

  // ── getSetupStatus ────────────────────────────────────────────────────

  describe('getSetupStatus', () => {
    it('should return true when setup is complete', async () => {
      authTokenRepo.getSetupState.mockResolvedValue({
        setupComplete: true,
        adminUserId: 'user-1',
        orgId: 'org-1',
        completedAt: '2024-01-01T00:00:00Z',
      });

      const result = await service.getSetupStatus();
      expect(result).toEqual({ setupComplete: true });
    });

    it('should return false when setup state is null', async () => {
      authTokenRepo.getSetupState.mockResolvedValue(null);

      const result = await service.getSetupStatus();
      expect(result).toEqual({ setupComplete: false });
    });

    it('should return false when DB throws an error', async () => {
      authTokenRepo.getSetupState.mockRejectedValue(new Error('DB error'));

      const result = await service.getSetupStatus();
      expect(result).toEqual({ setupComplete: false });
    });
  });

  // ── changePassword ────────────────────────────────────────────────────

  describe('changePassword', () => {
    it('should change password and revoke all tokens', async () => {
      credentialRepo.getCredential.mockResolvedValue(TEST_CREDENTIAL);
      (bcrypt.compare as jest.Mock).mockResolvedValue(true);
      (bcrypt.hash as jest.Mock).mockResolvedValue('new-hash');

      await service.changePassword('user-1', 'OldPass1!', 'NewPass1!');

      expect(credentialRepo.updateCredential).toHaveBeenCalledWith('user-1', {
        passwordHash: 'new-hash',
      });
      expect(authTokenRepo.revokeAllRefreshTokens).toHaveBeenCalledWith('user-1');
    });

    it('should revoke all personal access tokens on password change', async () => {
      credentialRepo.getCredential.mockResolvedValue(TEST_CREDENTIAL);
      (bcrypt.compare as jest.Mock).mockResolvedValue(true);
      (bcrypt.hash as jest.Mock).mockResolvedValue('new-hash');

      await service.changePassword('user-1', 'OldPass1!', 'NewPass1!');

      expect(patRepo.revokeAllByUserId).toHaveBeenCalledWith('user-1');
    });

    it('should throw BadRequestException for SSO-only accounts', async () => {
      credentialRepo.getCredential.mockResolvedValue(null);

      await expect(
        service.changePassword('user-1', 'old', 'NewPass1!'),
      ).rejects.toThrow(BadRequestException);
    });

    it('should throw BadRequestException for incorrect current password', async () => {
      credentialRepo.getCredential.mockResolvedValue(TEST_CREDENTIAL);
      (bcrypt.compare as jest.Mock).mockResolvedValue(false);

      await expect(
        service.changePassword('user-1', 'wrong', 'NewPass1!'),
      ).rejects.toThrow(BadRequestException);
    });

    it('should throw BadRequestException when new password is too short', async () => {
      await expect(
        service.changePassword('user-1', 'OldPass1!', 'Ab1!'),
      ).rejects.toThrow(BadRequestException);
    });
  });

  // ── validatePassword ──────────────────────────────────────────────────

  describe('validatePassword', () => {
    it('should not throw for valid password', () => {
      expect(() => service.validatePassword('ValidPass1!')).not.toThrow();
    });

    it('should throw BadRequestException for short password', () => {
      expect(() => service.validatePassword('Ab1!')).toThrow(BadRequestException);
    });
  });
});
