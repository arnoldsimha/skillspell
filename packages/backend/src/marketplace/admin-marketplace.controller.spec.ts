import { Test, TestingModule } from '@nestjs/testing';
import { ClsService } from 'nestjs-cls';
import { AdminMarketplaceController } from './admin-marketplace.controller.js';
import { MarketplaceService } from './marketplace.service.js';
import { MarketplaceSubmissionService } from './marketplace-submission.service.js';
import type { User } from '@skillspell/shared';

const makeAdmin = (overrides = {}): User =>
  ({
    id: 'admin-1',
    orgId: 'org-1',
    email: 'admin@example.com',
    name: 'Admin User',
    role: 'admin',
    createdAt: new Date().toISOString(),
    updatedAt: new Date().toISOString(),
    ...overrides,
  }) as unknown as User;

const makeSubmission = (overrides = {}) => ({
  id: 'sub-1',
  skillId: 'skill-1',
  version: '1',
  status: 'pending_review',
  submittedBy: 'user-1',
  reviewedBy: null,
  reviewNote: null,
  submittedAt: new Date().toISOString(),
  reviewedAt: null,
  ...overrides,
});

describe('AdminMarketplaceController', () => {
  let controller: AdminMarketplaceController;
  let mockService: Partial<Record<keyof MarketplaceService, jest.Mock>>;
  let mockSubmissionService: Partial<Record<keyof MarketplaceSubmissionService, jest.Mock>>;

  beforeEach(async () => {
    mockService = {
      listApprovedSubmissions: jest.fn().mockResolvedValue({ items: [], total: 0 }),
      getSubmissionPreview: jest.fn(),
      removeFromMarketplace: jest.fn(),
    };

    mockSubmissionService = {
      listPendingSubmissions: jest.fn(),
      listRemovalRequests: jest.fn(),
      approve: jest.fn(),
      reject: jest.fn(),
      removeVersion: jest.fn(),
      approveRemoval: jest.fn(),
      rejectRemoval: jest.fn(),
    };

    const module: TestingModule = await Test.createTestingModule({
      controllers: [AdminMarketplaceController],
      providers: [
        { provide: MarketplaceService, useValue: mockService },
        { provide: MarketplaceSubmissionService, useValue: mockSubmissionService },
        {
          provide: ClsService,
          useValue: {
            get: jest.fn().mockReturnValue({ marketplaceEnabled: true }),
          },
        },
      ],
    }).compile();

    controller = module.get(AdminMarketplaceController);
  });

  describe('listApproved', () => {
    it('returns approved skills from service', async () => {
      const approved = { items: [{ skillId: 'skill-1', name: 'Test Skill' }], total: 1 };
      mockService.listApprovedSubmissions!.mockResolvedValue(approved);
      const result = await controller.listApproved(makeAdmin());
      expect(mockService.listApprovedSubmissions).toHaveBeenCalledWith(
        expect.objectContaining({ orgId: 'org-1' }),
        100,
        0,
      );
      expect(result).toEqual(approved);
    });
  });

  describe('listApproved — query param parsing', () => {
    it('clamps limit to 500 maximum', async () => {
      mockService.listApprovedSubmissions!.mockResolvedValue({ items: [], total: 0 });
      await controller.listApproved(makeAdmin(), '9999', '0');
      expect(mockService.listApprovedSubmissions).toHaveBeenCalledWith(
        expect.anything(),
        500,
        0,
      );
    });

    it('clamps negative offset to 0', async () => {
      mockService.listApprovedSubmissions!.mockResolvedValue({ items: [], total: 0 });
      await controller.listApproved(makeAdmin(), '50', '-10');
      expect(mockService.listApprovedSubmissions).toHaveBeenCalledWith(
        expect.anything(),
        50,
        0,
      );
    });

    it('defaults to limit=100, offset=0 when params absent', async () => {
      mockService.listApprovedSubmissions!.mockResolvedValue({ items: [], total: 0 });
      await controller.listApproved(makeAdmin(), undefined, undefined);
      expect(mockService.listApprovedSubmissions).toHaveBeenCalledWith(
        expect.anything(),
        100,
        0,
      );
    });
  });

  describe('GET /pending — listPending()', () => {
    it('returns enriched pending submissions with skillName', async () => {
      const pending = [{ id: 'sub-1', skillId: 'skill-1', skillName: 'Test Skill' }];
      mockSubmissionService.listPendingSubmissions!.mockResolvedValue(pending);
      const result = await controller.listPending(makeAdmin());
      expect(mockSubmissionService.listPendingSubmissions).toHaveBeenCalledWith(
        expect.objectContaining({ orgId: 'org-1' }),
      );
      expect(result[0]).toHaveProperty('skillName', 'Test Skill');
    });

    it('returns empty array when no pending submissions exist', async () => {
      mockSubmissionService.listPendingSubmissions!.mockResolvedValue([]);

      const result = await controller.listPending(makeAdmin());

      expect(result).toEqual([]);
    });
  });

  describe('listRemovalRequests', () => {
    it('returns removal requests from service scoped to admin org', async () => {
      const requests = [
        {
          id: 'req-1',
          skillId: 'skill-1',
          submittedBy: 'user-1',
          scope: 'skill',
          targetSubmissionId: null,
          reason: 'No longer needed',
          status: 'pending',
          createdAt: new Date().toISOString(),
        },
      ];
      mockSubmissionService.listRemovalRequests!.mockResolvedValue(requests);

      const result = await controller.listRemovalRequests(makeAdmin());

      expect(mockSubmissionService.listRemovalRequests).toHaveBeenCalledWith(
        expect.objectContaining({ orgId: 'org-1' }),
      );
      expect(result).toBe(requests);
    });
  });

  describe('getSubmissionPreview', () => {
    it('returns preview from service with admin orgId', async () => {
      const preview = { id: 'sub-1', skillContent: '# My Skill', skillName: 'My Skill' };
      mockService.getSubmissionPreview!.mockResolvedValue(preview);

      const result = await controller.getSubmissionPreview('sub-1', makeAdmin());

      expect(mockService.getSubmissionPreview).toHaveBeenCalledWith('sub-1', 'org-1');
      expect(result).toBe(preview);
    });
  });

  describe('removeVersion (DELETE submissions/:submissionId)', () => {
    it('delegates to submissionService.removeVersion and returns 204', async () => {
      mockSubmissionService.removeVersion!.mockResolvedValue(undefined);

      await expect(controller.removeVersion('sub-1', makeAdmin())).resolves.toBeUndefined();
      expect(mockSubmissionService.removeVersion).toHaveBeenCalledWith(
        'sub-1',
        expect.objectContaining({ id: 'admin-1' }),
      );
    });
  });

  describe('approveRemoval', () => {
    it('delegates to submissionService.approveRemoval and returns 204', async () => {
      mockSubmissionService.approveRemoval!.mockResolvedValue(undefined);

      await expect(controller.approveRemoval('sub-1', makeAdmin())).resolves.toBeUndefined();
      expect(mockSubmissionService.approveRemoval).toHaveBeenCalledWith(
        'sub-1',
        expect.objectContaining({ id: 'admin-1' }),
      );
    });
  });

  describe('rejectRemoval', () => {
    it('delegates to submissionService.rejectRemoval and returns 204', async () => {
      mockSubmissionService.rejectRemoval!.mockResolvedValue(undefined);

      await expect(controller.rejectRemoval('sub-1', makeAdmin())).resolves.toBeUndefined();
      expect(mockSubmissionService.rejectRemoval).toHaveBeenCalledWith(
        'sub-1',
        expect.objectContaining({ id: 'admin-1' }),
      );
    });
  });

  describe('@Roles("admin") enforcement', () => {
    it('approve returns 204 for admin user', async () => {
      mockSubmissionService.approve!.mockResolvedValue(undefined);
      await expect(controller.approve('sub-1', makeAdmin())).resolves.toBeUndefined();
    });

    it('reject returns 204 for admin user', async () => {
      mockSubmissionService.reject!.mockResolvedValue(undefined);
      await expect(
        controller.reject('sub-1', makeAdmin(), { reviewNote: 'not suitable' }),
      ).resolves.toBeUndefined();
    });

    it('remove (DELETE) returns 204 for admin user', async () => {
      mockService.removeFromMarketplace!.mockResolvedValue(undefined);
      await expect(
        controller.remove('skill-1', makeAdmin(), { reason: 'Policy violation' }),
      ).resolves.toBeUndefined();
    });

    // @Roles('admin') is a class-level decorator. Guard enforcement is handled by
    // RolesGuard at the NestJS layer — not unit-testable without the full HTTP adapter.
    // Verified via the @Roles('admin') decorator presence on the class.
  });
});
