import { ForbiddenException, NotFoundException } from '@nestjs/common';
import { Test, TestingModule } from '@nestjs/testing';
import { ConfigService } from '@nestjs/config';
import {
  USER_REPOSITORY,
  CREDENTIAL_REPOSITORY,
  AUTH_TOKEN_REPOSITORY,
  ORGANIZATION_REPOSITORY,
} from '@skillspell/shared';
import type { User } from '@skillspell/shared';
import { UsersService } from './users.service';
import { AuthService } from '../auth/auth.service';

/**
 * Unit tests for UsersService — owner role protection.
 *
 * Tests cover:
 * - Owner can modify any user role (owner, admin, user)
 * - Admin can only modify 'user' role accounts
 * - Admin cannot modify admin or owner accounts
 * - Only owner can promote to owner (with confirmOwnerTransfer)
 * - Only owner can promote to admin
 * - Owner cannot deactivate themselves
 * - Admin cannot deactivate admin or owner accounts
 */
describe('UsersService — Owner Protection', () => {
  let service: UsersService;

  // ─── Mock Users ────────────────────────────────────────────────────
  const ownerUser: User = {
    id: 'owner-id',
    orgId: 'org-1',
    email: 'owner@test.com',
    firstName: 'Owner',
    lastName: 'User',
    role: 'owner',
    isActive: true,
    authProviders: ['local'],
    profileComplete: true,
    twoFactorEnabled: false,
    createdAt: '2024-01-01T00:00:00Z',
    updatedAt: '2024-01-01T00:00:00Z',
  };

  const adminUser: User = {
    id: 'admin-id',
    orgId: 'org-1',
    email: 'admin@test.com',
    firstName: 'Admin',
    lastName: 'User',
    role: 'admin',
    isActive: true,
    authProviders: ['local'],
    profileComplete: true,
    twoFactorEnabled: false,
    createdAt: '2024-01-01T00:00:00Z',
    updatedAt: '2024-01-01T00:00:00Z',
  };

  const regularUser: User = {
    id: 'user-id',
    orgId: 'org-1',
    email: 'user@test.com',
    firstName: 'Regular',
    lastName: 'User',
    role: 'user',
    isActive: true,
    authProviders: ['local'],
    profileComplete: true,
    twoFactorEnabled: false,
    createdAt: '2024-01-01T00:00:00Z',
    updatedAt: '2024-01-01T00:00:00Z',
  };

  // ─── Mock Repositories ─────────────────────────────────────────────

  const mockUserRepo = {
    findById: jest.fn(),
    findByEmail: jest.fn(),
    findAll: jest.fn(),
    create: jest.fn(),
    update: jest.fn(),
    deactivate: jest.fn(),
  };

  const mockCredentialRepo = {
    saveCredential: jest.fn(),
    getCredential: jest.fn(),
    updateCredential: jest.fn(),
  };

  const mockAuthTokenRepo = {
    revokeAllRefreshTokens: jest.fn(),
  };

  const mockOrgRepo = {
    findSingleton: jest.fn(),
    create: jest.fn(),
    update: jest.fn(),
  };

  const mockConfigService = {
    get: jest.fn().mockReturnValue({
      bcryptRounds: 10,
      passwordMinLength: 8,
    }),
  };

  beforeEach(async () => {
    jest.clearAllMocks();

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        UsersService,
        { provide: USER_REPOSITORY, useValue: mockUserRepo },
        { provide: CREDENTIAL_REPOSITORY, useValue: mockCredentialRepo },
        { provide: AUTH_TOKEN_REPOSITORY, useValue: mockAuthTokenRepo },
        { provide: ORGANIZATION_REPOSITORY, useValue: mockOrgRepo },
        { provide: ConfigService, useValue: mockConfigService },
        { provide: AuthService, useValue: { hashPassword: jest.fn().mockResolvedValue('$2a$10$hashed'), validatePassword: jest.fn() } },
      ],
    }).compile();

    service = module.get<UsersService>(UsersService);

    // Default: findById returns undefined (must be overridden per test)
    mockUserRepo.findById.mockResolvedValue(null);
    mockUserRepo.update.mockImplementation(async (id: string, data: any) => {
      // Return the user with updated fields
      const baseUser = [ownerUser, adminUser, regularUser].find(u => u.id === id);
      return { ...baseUser, ...data };
    });
  });

  // ─── update() — Owner Protection ────────────────────────────────────

  describe('update() — Role modification permissions', () => {
    it('should allow owner to change a regular user\'s role to admin', async () => {
      mockUserRepo.findById.mockResolvedValue(regularUser);

      const result = await service.update(
        'user-id',
        { role: 'admin' },
        ownerUser,
      );

      expect(result.role).toBe('admin');
      expect(mockUserRepo.update).toHaveBeenCalledWith('user-id', { role: 'admin' });
    });

    it('should allow owner to change an admin\'s role to user (demotion)', async () => {
      mockUserRepo.findById.mockResolvedValue(adminUser);

      const result = await service.update(
        'admin-id',
        { role: 'user' },
        ownerUser,
      );

      expect(result.role).toBe('user');
    });

    it('should allow owner to promote user to owner with confirmOwnerTransfer', async () => {
      mockUserRepo.findById.mockResolvedValue(regularUser);

      const result = await service.update(
        'user-id',
        { role: 'owner', confirmOwnerTransfer: true },
        ownerUser,
      );

      expect(result.role).toBe('owner');
    });

    it('should reject owner transfer without confirmOwnerTransfer flag', async () => {
      mockUserRepo.findById.mockResolvedValue(regularUser);

      await expect(
        service.update('user-id', { role: 'owner' }, ownerUser),
      ).rejects.toThrow(ForbiddenException);
    });

    it('should reject admin trying to modify an owner', async () => {
      mockUserRepo.findById.mockResolvedValue(ownerUser);

      await expect(
        service.update('owner-id', { firstName: 'Changed' }, adminUser),
      ).rejects.toThrow(ForbiddenException);
    });

    it('should reject admin trying to modify another admin', async () => {
      const anotherAdmin: User = { ...adminUser, id: 'admin-2', email: 'admin2@test.com' };
      mockUserRepo.findById.mockResolvedValue(anotherAdmin);

      await expect(
        service.update('admin-2', { role: 'user' }, adminUser),
      ).rejects.toThrow(ForbiddenException);
    });

    it('should allow admin to change a regular user\'s firstName', async () => {
      mockUserRepo.findById.mockResolvedValue(regularUser);

      const result = await service.update(
        'user-id',
        { firstName: 'NewName' },
        adminUser,
      );

      expect(mockUserRepo.update).toHaveBeenCalledWith('user-id', { firstName: 'NewName' });
    });

    it('should reject admin trying to promote user to admin', async () => {
      mockUserRepo.findById.mockResolvedValue(regularUser);

      await expect(
        service.update('user-id', { role: 'admin' }, adminUser),
      ).rejects.toThrow(ForbiddenException);
    });

    it('should reject admin trying to promote user to owner', async () => {
      mockUserRepo.findById.mockResolvedValue(regularUser);

      await expect(
        service.update('user-id', { role: 'owner', confirmOwnerTransfer: true }, adminUser),
      ).rejects.toThrow(ForbiddenException);
    });

    it('should throw NotFoundException for non-existent user', async () => {
      mockUserRepo.findById.mockResolvedValue(null);

      await expect(
        service.update('nonexistent', { firstName: 'X' }, ownerUser),
      ).rejects.toThrow(NotFoundException);
    });
  });

  // ─── deactivate() — Owner Protection ───────────────────────────────

  describe('deactivate() — Role-based deactivation permissions', () => {
    it('should allow owner to deactivate a regular user', async () => {
      mockUserRepo.findById.mockResolvedValue(regularUser);

      await service.deactivate('user-id', ownerUser);

      expect(mockUserRepo.deactivate).toHaveBeenCalledWith('user-id');
      expect(mockAuthTokenRepo.revokeAllRefreshTokens).toHaveBeenCalledWith('user-id');
    });

    it('should allow owner to deactivate an admin', async () => {
      mockUserRepo.findById.mockResolvedValue(adminUser);

      await service.deactivate('admin-id', ownerUser);

      expect(mockUserRepo.deactivate).toHaveBeenCalledWith('admin-id');
    });

    it('should prevent owner from deactivating themselves', async () => {
      mockUserRepo.findById.mockResolvedValue(ownerUser);

      await expect(
        service.deactivate('owner-id', ownerUser),
      ).rejects.toThrow(ForbiddenException);
      expect(mockUserRepo.deactivate).not.toHaveBeenCalled();
    });

    it('should allow owner to deactivate another owner', async () => {
      const anotherOwner: User = { ...ownerUser, id: 'owner-2', email: 'owner2@test.com' };
      mockUserRepo.findById.mockResolvedValue(anotherOwner);

      await service.deactivate('owner-2', ownerUser);

      expect(mockUserRepo.deactivate).toHaveBeenCalledWith('owner-2');
    });

    it('should reject admin trying to deactivate an owner', async () => {
      mockUserRepo.findById.mockResolvedValue(ownerUser);

      await expect(
        service.deactivate('owner-id', adminUser),
      ).rejects.toThrow(ForbiddenException);
      expect(mockUserRepo.deactivate).not.toHaveBeenCalled();
    });

    it('should reject admin trying to deactivate another admin', async () => {
      const anotherAdmin: User = { ...adminUser, id: 'admin-2', email: 'admin2@test.com' };
      mockUserRepo.findById.mockResolvedValue(anotherAdmin);

      await expect(
        service.deactivate('admin-2', adminUser),
      ).rejects.toThrow(ForbiddenException);
      expect(mockUserRepo.deactivate).not.toHaveBeenCalled();
    });

    it('should allow admin to deactivate a regular user', async () => {
      mockUserRepo.findById.mockResolvedValue(regularUser);

      await service.deactivate('user-id', adminUser);

      expect(mockUserRepo.deactivate).toHaveBeenCalledWith('user-id');
    });

    it('should throw NotFoundException for non-existent user', async () => {
      mockUserRepo.findById.mockResolvedValue(null);

      await expect(
        service.deactivate('nonexistent', ownerUser),
      ).rejects.toThrow(NotFoundException);
    });
  });
});
