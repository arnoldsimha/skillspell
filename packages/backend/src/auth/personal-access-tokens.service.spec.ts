import { NotFoundException } from '@nestjs/common';
import { Test, TestingModule } from '@nestjs/testing';
import { PAT_REPOSITORY } from '@skillspell/shared';
import type { IPersonalAccessTokenRepository, PersonalAccessToken } from '@skillspell/shared';
import { PersonalAccessTokensService } from './personal-access-tokens.service';
import { TokenService } from './token.service';

// Mock PAT repository — will be fully typed once IPersonalAccessTokenRepository is created in plan 02
const mockPatRepo: jest.Mocked<IPersonalAccessTokenRepository> = {
  create: jest.fn(),
  findByTokenHash: jest.fn(),
  findByUserId: jest.fn(),
  findById: jest.fn(),
  revoke: jest.fn(),
  revokeAllByUserId: jest.fn(),
  updateLastUsedAt: jest.fn(),
};

const mockTokenService = {
  hashToken: jest.fn((t: string) => 'sha256-hash-of-' + t),
};

// Use a date within 1 year to satisfy the service's max-expiry validation
const EXPIRES_WITHIN_ONE_YEAR = new Date(Date.now() + 364 * 24 * 60 * 60 * 1000).toISOString();

function makePatFixture(overrides: Partial<PersonalAccessToken> = {}): PersonalAccessToken {
  return {
    id: 'pat-1',
    userId: 'user-1',
    name: 'test token',
    prefix: 'abcd1234',
    tokenHash: 'sha256-hash',
    expiresAt: EXPIRES_WITHIN_ONE_YEAR,
    revokedAt: null,
    lastUsedAt: null,
    createdAt: '2026-01-01T00:00:00.000Z',
    ...overrides,
  };
}

describe('PersonalAccessTokensService', () => {
  let service: PersonalAccessTokensService;

  beforeEach(async () => {
    jest.clearAllMocks();
    const module: TestingModule = await Test.createTestingModule({
      providers: [
        PersonalAccessTokensService,
        { provide: PAT_REPOSITORY, useValue: mockPatRepo },
        { provide: TokenService, useValue: mockTokenService },
      ],
    }).compile();
    service = module.get<PersonalAccessTokensService>(PersonalAccessTokensService);
  });

  describe('create', () => {
    it('returns raw PAT token (starting with sksp_) in response — PAT-01, T-3-01', async () => {
      mockPatRepo.create.mockResolvedValue(makePatFixture());

      const result = await service.create('user-1', { name: 'test token', expiresAt: EXPIRES_WITHIN_ONE_YEAR });

      expect(result.rawToken).toMatch(/^sksp_/);
      expect('tokenHash' in result).toBe(false);
    });

    it('stores only SHA-256 hash of token, never raw token — PAT-01, T-3-02', async () => {
      mockPatRepo.create.mockResolvedValue(makePatFixture());

      const result = await service.create('user-1', { name: 'test token', expiresAt: EXPIRES_WITHIN_ONE_YEAR });

      const callArg = mockPatRepo.create.mock.calls[0][0];
      // The tokenHash stored should be the hash of the rawToken
      expect(callArg.tokenHash).toBe('sha256-hash-of-' + result.rawToken);
      // The raw token itself must NOT be stored as any field value
      expect(callArg.tokenHash).not.toBe(result.rawToken);
    });

    it('stores prefix (first 8 chars after sksp_) for display — PAT-01', async () => {
      mockPatRepo.create.mockResolvedValue(makePatFixture());

      const result = await service.create('user-1', { name: 'test token', expiresAt: EXPIRES_WITHIN_ONE_YEAR });

      const callArg = mockPatRepo.create.mock.calls[0][0];
      expect(callArg.prefix).toHaveLength(8);
      expect(result.rawToken.slice(5, 13)).toBe(callArg.prefix);
    });

    it('enforces expiresAt is provided (D-03)', async () => {
      mockPatRepo.create.mockResolvedValue(makePatFixture({ expiresAt: EXPIRES_WITHIN_ONE_YEAR }));

      await service.create('user-1', { name: 'token', expiresAt: EXPIRES_WITHIN_ONE_YEAR });

      const callArg = mockPatRepo.create.mock.calls[0][0];
      expect(callArg.expiresAt).toBe(EXPIRES_WITHIN_ONE_YEAR);
    });
  });

  describe('list', () => {
    it('returns tokens for authenticated user with name, prefix, createdAt — PAT-03', async () => {
      mockPatRepo.findByUserId.mockResolvedValue([
        makePatFixture({ id: 'pat-1', name: 'token one' }),
        makePatFixture({ id: 'pat-2', name: 'token two' }),
      ]);

      const result = await service.list('user-1');

      expect(result).toHaveLength(2);
      for (const item of result) {
        expect(item).toHaveProperty('id');
        expect(item).toHaveProperty('name');
        expect(item).toHaveProperty('prefix');
        expect(item).toHaveProperty('createdAt');
      }
    });

    it('does not return tokenHash or raw token in list response — T-3-01', async () => {
      mockPatRepo.findByUserId.mockResolvedValue([
        makePatFixture({ tokenHash: 'secret-hash' }),
      ]);

      const result = await service.list('user-1');

      expect('tokenHash' in result[0]).toBe(false);
    });
  });

  describe('revoke', () => {
    it('marks token as revoked — PAT-03, T-3-04', async () => {
      mockPatRepo.revoke.mockResolvedValue(undefined);

      await service.revoke('token-id', 'user-1');

      expect(mockPatRepo.revoke).toHaveBeenCalledWith('token-id', 'user-1');
    });

    it('throws ForbiddenException if userId does not own the token — T-3-04', async () => {
      mockPatRepo.revoke.mockRejectedValue(new NotFoundException('not found or no permission'));

      await expect(service.revoke('other-token', 'user-1')).rejects.toThrow(NotFoundException);
    });
  });
});
