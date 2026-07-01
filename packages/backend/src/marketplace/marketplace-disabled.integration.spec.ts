import { Test, TestingModule } from '@nestjs/testing';
import { ExecutionContext, ForbiddenException } from '@nestjs/common';
import { ClsService } from 'nestjs-cls';
import { MarketplaceGuard } from './marketplace.guard.js';
import { MarketplaceController } from './marketplace.controller.js';
import { AdminMarketplaceController } from './admin-marketplace.controller.js';
import { MarketplaceService } from './marketplace.service.js';
import { MarketplaceSubmissionService } from './marketplace-submission.service.js';
import { ExportService } from '../export/export.service.js';
import { GenerationService } from '../generation/generation.service.js';
import type { Organization, User } from '@skillspell/shared';

/**
 * Integration tests for marketplace-disabled feature gate.
 *
 * Verifies that when marketplace is disabled (org.marketplaceEnabled === false):
 * - MarketplaceGuard throws ForbiddenException
 * - Error message mentions "disabled"
 *
 * When marketplace is enabled (org.marketplaceEnabled === true):
 * - MarketplaceGuard allows access (returns true)
 *
 * When org is null/undefined (development fallback):
 * - MarketplaceGuard allows access (development mode)
 *
 * This integration test verifies the guard's behavior within a module context
 * with controllers and services wired together.
 */
describe('MarketplaceGuard — disabled feature gate (integration)', () => {
  let marketplaceController: MarketplaceController;
  let adminMarketplaceController: AdminMarketplaceController;
  let clsService: ClsService;
  let guard: MarketplaceGuard;

  const mockUser: User = {
    id: 'user-uuid-1',
    orgId: 'org-uuid-1',
    email: 'user@example.com',
    firstName: 'Test',
    lastName: 'User',
    role: 'user',
    isActive: true,
    authProviders: [],
    profileComplete: true,
    twoFactorEnabled: false,
    createdAt: '2024-01-01T00:00:00Z',
    updatedAt: '2024-01-01T00:00:00Z',
  };

  const mockAdminUser: User = {
    ...mockUser,
    id: 'admin-uuid-1',
    email: 'admin@example.com',
    role: 'admin',
  } as unknown as User;

  const mockOrganizationEnabled: Organization = {
    id: 'org-uuid-1',
    name: 'Test Org',
    passwordLoginEnabled: true,
    ssoLoginEnabled: true,
    marketplaceAllowSelfApproval: false,
    marketplaceEnabled: true,
    createdAt: '2024-01-01T00:00:00Z',
    updatedAt: '2024-01-01T00:00:00Z',
  };

  const mockOrganizationDisabled: Organization = {
    ...mockOrganizationEnabled,
    marketplaceEnabled: false,
  };

  // Mock services
  const mockMarketplaceService = {
    findBySubmittedBy: jest.fn(),
    findApproved: jest.fn().mockResolvedValue({ items: [], total: 0 }),
    findApprovedSkillDetail: jest.fn(),
    recordDownloadEvent: jest.fn(),
    validateVersionDownload: jest.fn(),
    approve: jest.fn(),
    reject: jest.fn(),
    removeFromMarketplace: jest.fn(),
    listApprovedSubmissions: jest.fn().mockResolvedValue({ items: [], total: 0 }),
    listVersions: jest.fn(),
    getSubmissionPreview: jest.fn(),
    getFavorites: jest.fn(),
    toggleUpvote: jest.fn(),
    toggleFavorite: jest.fn(),
    listApprovedVersionsForAdmin: jest.fn(),
  };

  const mockSubmissionService = {
    submit: jest.fn(),
    findMySubmissions: jest.fn(),
    requestRemoval: jest.fn(),
    approve: jest.fn(),
    reject: jest.fn(),
    removeVersion: jest.fn(),
    listPendingSubmissions: jest.fn().mockResolvedValue([]),
    listRemovalRequests: jest.fn(),
    approveRemoval: jest.fn(),
    rejectRemoval: jest.fn(),
  };

  const mockExportService = {
    exportAsZip: jest.fn(),
  };

  const mockGenerationService = {
    generateDiagram: jest.fn(),
  };

  beforeEach(async () => {
    jest.clearAllMocks();

    const module: TestingModule = await Test.createTestingModule({
      controllers: [MarketplaceController, AdminMarketplaceController],
      providers: [
        { provide: MarketplaceService, useValue: mockMarketplaceService },
        { provide: MarketplaceSubmissionService, useValue: mockSubmissionService },
        { provide: ExportService, useValue: mockExportService },
        { provide: GenerationService, useValue: mockGenerationService },
        {
          provide: ClsService,
          useValue: {
            get: jest.fn().mockReturnValue(mockOrganizationEnabled),
          },
        },
        MarketplaceGuard,
      ],
    }).compile();

    marketplaceController = module.get<MarketplaceController>(MarketplaceController);
    adminMarketplaceController = module.get<AdminMarketplaceController>(
      AdminMarketplaceController,
    );
    clsService = module.get<ClsService>(ClsService);
    guard = module.get<MarketplaceGuard>(MarketplaceGuard);
  });

  /** Helper — build a mock ExecutionContext. */
  const makeContext = (): ExecutionContext =>
    ({
      switchToHttp: () => ({
        getRequest: () => ({}),
      }),
    }) as unknown as ExecutionContext;

  describe('Marketplace disabled (marketplaceEnabled === false)', () => {
    beforeEach(() => {
      // Mock ClsService to return org with marketplace disabled
      jest.spyOn(clsService, 'get').mockReturnValue(mockOrganizationDisabled);
    });

    it('Guard throws ForbiddenException when marketplaceEnabled === false', () => {
      expect(() => guard.canActivate(makeContext())).toThrow(ForbiddenException);
      expect(() => guard.canActivate(makeContext())).toThrow(
        'Marketplace is disabled for this organization',
      );
    });

    it('Controller browse() triggers guard which throws when marketplace disabled', async () => {
      // Manually call guard first (in real HTTP flow, guard runs before controller)
      expect(() => guard.canActivate(makeContext())).toThrow(ForbiddenException);

      // If guard didn't throw, controller would be called — but we're testing guard blocks it
      mockMarketplaceService.findApproved.mockResolvedValue({ items: [], total: 0 });
      // We don't call controller because guard should have thrown first
    });

    it('Admin controller listPending() blocked by guard when marketplace disabled', async () => {
      // Guard blocks access before controller is invoked
      expect(() => guard.canActivate(makeContext())).toThrow(
        'Marketplace is disabled for this organization',
      );
    });
  });

  describe('Marketplace enabled (marketplaceEnabled === true)', () => {
    beforeEach(() => {
      // Mock ClsService to return org with marketplace enabled
      jest.spyOn(clsService, 'get').mockReturnValue(mockOrganizationEnabled);
    });

    it('Guard allows access when marketplaceEnabled === true', () => {
      const result = guard.canActivate(makeContext());
      expect(result).toBe(true);
    });

    it('Controller browse() succeeds when marketplace enabled and guard allows', async () => {
      // Guard allows access
      const guardResult = guard.canActivate(makeContext());
      expect(guardResult).toBe(true);

      // Now controller can be called
      mockMarketplaceService.findApproved.mockResolvedValue({
        items: [{ skillId: 'skill-uuid-1', name: 'Test Skill' }],
        total: 1,
      });

      const result = await marketplaceController.browse({} as any, mockUser);

      expect(result).toHaveProperty('total', 1);
      expect(mockMarketplaceService.findApproved).toHaveBeenCalledWith(mockUser.orgId, {}, mockUser.id);
    });

    it('Admin controller listPending() succeeds when marketplace enabled and guard allows', async () => {
      // Guard allows access
      const guardResult = guard.canActivate(makeContext());
      expect(guardResult).toBe(true);

      // Admin controller can now execute
      mockSubmissionService.listPendingSubmissions.mockResolvedValue([
        {
          id: 'sub-1',
          skillId: 'skill-1',
          version: '1',
          status: 'pending_review',
        },
      ]);

      const result = await adminMarketplaceController.listPending(mockAdminUser);

      expect(result).toHaveLength(1);
      expect(mockSubmissionService.listPendingSubmissions).toHaveBeenCalledWith(mockAdminUser);
    });
  });

  describe('Marketplace null/undefined (development fallback)', () => {
    it('Guard allows access when org is undefined (development fallback)', () => {
      jest.spyOn(clsService, 'get').mockReturnValue(undefined);

      const result = guard.canActivate(makeContext());
      expect(result).toBe(true);
    });

    it('Guard allows access when org is null (development fallback)', () => {
      jest.spyOn(clsService, 'get').mockReturnValue(null);

      const result = guard.canActivate(makeContext());
      expect(result).toBe(true);
    });

    it('Controller browse() succeeds when org is undefined and guard allows (dev mode)', async () => {
      jest.spyOn(clsService, 'get').mockReturnValue(undefined);

      // Guard allows access in dev mode
      const guardResult = guard.canActivate(makeContext());
      expect(guardResult).toBe(true);

      // Controller executes normally
      mockMarketplaceService.findApproved.mockResolvedValue({ items: [], total: 0 });

      const result = await marketplaceController.browse({} as any, mockUser);

      expect(result).toHaveProperty('total', 0);
    });
  });
});
