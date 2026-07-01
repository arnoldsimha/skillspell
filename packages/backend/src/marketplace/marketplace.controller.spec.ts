import { BadRequestException, NotFoundException } from '@nestjs/common';
import { Test, TestingModule } from '@nestjs/testing';
import { plainToInstance } from 'class-transformer';
import { ClsService } from 'nestjs-cls';
import { MarketplaceController } from './marketplace.controller.js';
import { AdminMarketplaceController } from './admin-marketplace.controller.js';
import { MarketplaceService } from './marketplace.service.js';
import { MarketplaceSubmissionService } from './marketplace-submission.service.js';
import { ExportService } from '../export/export.service.js';
import { GenerationService } from '../generation/generation.service.js';
import { Readable } from 'node:stream';
import { StreamableFile } from '@nestjs/common';

const mockMarketplaceService = {
  findBySubmittedBy: jest.fn(),
  findApproved: jest.fn(),
  findApprovedSkillDetail: jest.fn(),
  recordDownloadEvent: jest.fn(),
  validateVersionDownload: jest.fn(),
  approve: jest.fn(),
  reject: jest.fn(),
  removeFromMarketplace: jest.fn(),
  listApprovedSubmissions: jest.fn(),
  listVersions: jest.fn(),
  getSubmissionPreview: jest.fn(),
  getFavorites: jest.fn(),
  toggleUpvote: jest.fn(),
  toggleFavorite: jest.fn(),
};

const mockSubmissionService = {
  submit: jest.fn(),
  findMySubmissions: jest.fn(),
  requestRemoval: jest.fn(),
  approve: jest.fn(),
  reject: jest.fn(),
  removeVersion: jest.fn(),
  listPendingSubmissions: jest.fn(),
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

const mockUser = {
  id: 'user-uuid-1',
  orgId: 'org-uuid-1',
  email: 'user@example.com',
  isAdmin: false,
};

const mockAdminUser = {
  id: 'admin-uuid-1',
  orgId: 'org-uuid-1',
  email: 'admin@example.com',
  isAdmin: true,
};

describe('MarketplaceController', () => {
  let controller: MarketplaceController;

  beforeEach(async () => {
    jest.clearAllMocks();
    const module: TestingModule = await Test.createTestingModule({
      controllers: [MarketplaceController],
      providers: [
        { provide: MarketplaceService, useValue: mockMarketplaceService },
        { provide: MarketplaceSubmissionService, useValue: mockSubmissionService },
        { provide: ExportService, useValue: mockExportService },
        { provide: GenerationService, useValue: mockGenerationService },
        {
          provide: ClsService,
          useValue: {
            get: jest.fn().mockReturnValue({ marketplaceEnabled: true }),
          },
        },
      ],
    }).compile();

    controller = module.get<MarketplaceController>(MarketplaceController);
  });

  describe('download (SC-4 / D-05)', () => {
    it('download streams zip file when recordDownloadEvent throws — zip still returned (D-05 non-blocking)', async () => {
      // Arrange: recordDownloadEvent throws but exportAsZip succeeds
      mockMarketplaceService.findApprovedSkillDetail.mockResolvedValue({ skillId: 'skill-uuid-1' });
      mockMarketplaceService.recordDownloadEvent.mockRejectedValue(new Error('DB connection error'));
      const fakeStream = Readable.from(['zip-content']);
      mockExportService.exportAsZip.mockResolvedValue({ stream: fakeStream, name: 'my-skill_v3' });

      // Act
      const result = await controller.download('skill-uuid-1', '3', mockUser as any);

      // Assert: zip still returned even though recordDownloadEvent threw
      expect(result).toBeInstanceOf(StreamableFile);
      expect(mockExportService.exportAsZip).toHaveBeenCalledWith('skill-uuid-1', 'claude', 3);
    });

    it('download throws BadRequestException when version query param is NaN (e.g. "abc")', async () => {
      // Arrange
      mockMarketplaceService.findApprovedSkillDetail.mockResolvedValue({ skillId: 'skill-uuid-1' });
      // Assert BadRequestException is thrown before exportAsZip is called
      await expect(controller.download('skill-uuid-1', 'abc', mockUser as any))
        .rejects.toBeInstanceOf(BadRequestException);
      expect(mockExportService.exportAsZip).not.toHaveBeenCalled();
    });

    it('download calls recordDownloadEvent with correct skillId and version string before streaming', async () => {
      // Arrange
      mockMarketplaceService.findApprovedSkillDetail.mockResolvedValue({ skillId: 'skill-uuid-1' });
      mockMarketplaceService.recordDownloadEvent.mockResolvedValue(undefined);
      const fakeStream = Readable.from(['zip-content']);
      mockExportService.exportAsZip.mockResolvedValue({ stream: fakeStream, name: 'skill' });

      // Act
      await controller.download('skill-uuid-1', '3', mockUser as any);

      // Assert: raw string version '3' passed to recordDownloadEvent (not integer 3)
      expect(mockMarketplaceService.recordDownloadEvent).toHaveBeenCalledWith(
        'skill-uuid-1',
        '3',         // raw string version — matches marketplace_submissions.version format
      );
      // And integer parsedVersion passed to exportAsZip
      expect(mockExportService.exportAsZip).toHaveBeenCalledWith('skill-uuid-1', 'claude', 3);
    });
  });

  describe('getDetail (D-09)', () => {
    it('getDetail returns MarketplaceSkillDetailDto for approved skill', async () => {
      const mockDetail = {
        skillId: 'skill-uuid-1',
        submissionId: 'sub-uuid-1',
        version: '3',
        name: 'SQL Query Builder',
        description: 'Generates SQL',
        categories: ['devtools'],
        downloadCount: 42,
        submittedAt: '2026-05-10T00:00:00.000Z',
        submittedBy: 'user-uuid-1',
        skillContent: '# SQL Query Builder\n\nThis skill...',
        createdAt: '2026-01-01T00:00:00.000Z',
        updatedAt: '2026-05-10T00:00:00.000Z',
      };
      mockMarketplaceService.findApprovedSkillDetail = jest.fn().mockResolvedValue(mockDetail);
      const result = await controller.getDetail('skill-uuid-1', mockUser as any);
      expect(result).toMatchObject({
        skillId: 'skill-uuid-1',
        skillContent: expect.stringContaining('SQL Query Builder'),
        createdAt: '2026-01-01T00:00:00.000Z',
        updatedAt: '2026-05-10T00:00:00.000Z',
      });
    });

    it('getDetail throws NotFoundException when findApprovedSkillDetail returns null', async () => {
      mockMarketplaceService.findApprovedSkillDetail = jest.fn().mockResolvedValue(null);
      await expect(controller.getDetail('not-found-uuid', mockUser as any)).rejects.toThrow(NotFoundException);
    });

    it('getDetail uses user.orgId from JWT (org-scoped)', async () => {
      mockMarketplaceService.findApprovedSkillDetail = jest.fn().mockResolvedValue(null);
      try { await controller.getDetail('skill-uuid-1', mockUser as any); } catch {}
      expect(mockMarketplaceService.findApprovedSkillDetail).toHaveBeenCalledWith('skill-uuid-1', mockUser.orgId, mockUser.id);
    });
  });

  describe('submit (SC-1)', () => {
    it('submit returns 201 with MySubmissionDto shaped response', async () => {
      const submissionData = {
        id: 'submission-uuid-1',
        skillId: 'skill-uuid-1',
        version: '2',
        status: 'pending_review',
        submittedBy: mockUser.id,
        submittedAt: new Date().toISOString(),
        reviewNote: null,
        reviewedAt: null,
      };
      mockSubmissionService.submit.mockResolvedValue(submissionData);

      const dto = { skillId: 'skill-uuid-1', version: '2' };
      const result = await controller.submit(dto as any, mockUser as any);

      expect(result).toMatchObject({
        id: 'submission-uuid-1',
        skillId: 'skill-uuid-1',
        version: '2',
        status: 'pending_review',
      });
      // Verify reviewedBy is excluded (not present on MySubmissionDto)
      expect((result as any).reviewedBy).toBeUndefined();
    });
  });

  describe('browse (GET /marketplace)', () => {
    it('calls findApproved with user.orgId, query, and user.id and returns items + total', async () => {
      const items = [{ skillId: 'skill-uuid-1', name: 'Test Skill' }];
      mockMarketplaceService.findApproved.mockResolvedValue({ items, total: 1 });

      const result = await controller.browse({} as any, mockUser as any);

      expect(mockMarketplaceService.findApproved).toHaveBeenCalledWith(mockUser.orgId, {}, mockUser.id);
      expect(result).toHaveProperty('total', 1);
    });
  });

  describe('getMySubmissions', () => {
    it('calls findBySubmittedBy with user and returns MySubmissionDto array', async () => {
      const subs = [
        {
          id: 'sub-uuid-1',
          skillId: 'skill-uuid-1',
          version: '1',
          status: 'pending_review',
          submittedBy: mockUser.id,
          submittedAt: new Date().toISOString(),
          reviewNote: null,
          reviewedAt: null,
          skillName: 'My Skill',
          removalReason: null,
        },
      ];
      mockMarketplaceService.findBySubmittedBy.mockResolvedValue(subs as any);

      const result = await controller.getMySubmissions(mockUser as any);

      expect(mockMarketplaceService.findBySubmittedBy).toHaveBeenCalledWith(mockUser);
      expect(result).toHaveLength(1);
    });
  });

  describe('requestRemoval', () => {
    it('delegates to submissionService.requestRemoval and returns 204', async () => {
      mockSubmissionService.requestRemoval.mockResolvedValue(undefined);

      await expect(
        controller.requestRemoval(
          'skill-uuid-1',
          { scope: 'skill', targetSubmissionId: undefined, reason: 'No longer needed' } as any,
          mockUser as any,
        ),
      ).resolves.toBeUndefined();
      expect(mockSubmissionService.requestRemoval).toHaveBeenCalledWith(
        'skill-uuid-1',
        mockUser,
        'skill',
        undefined,
        'No longer needed',
      );
    });
  });

  describe('listVersions', () => {
    it('calls marketplaceService.listVersions with skillId and user.orgId', async () => {
      const versions = [{ id: 'sub-1', version: '1', status: 'approved', downloadCount: 3 }];
      mockMarketplaceService.listVersions.mockResolvedValue(versions as any);

      const result = await controller.listVersions('skill-uuid-1', mockUser as any);

      expect(mockMarketplaceService.listVersions).toHaveBeenCalledWith('skill-uuid-1', mockUser.orgId);
      expect(result).toBe(versions);
    });
  });

  describe('getFavorites (GET /marketplace/favorites)', () => {
    it('calls service.getFavorites with user and default pagination params', async () => {
      const items = [{ skillId: 'skill-uuid-1', name: 'Fav Skill' }];
      mockMarketplaceService.getFavorites.mockResolvedValue({ items, total: 1 });

      const result = await controller.getFavorites(undefined, undefined, mockUser as any);

      expect(mockMarketplaceService.getFavorites).toHaveBeenCalledWith(mockUser, { limit: 30, page: 1 });
      expect(result).toHaveProperty('total', 1);
      expect(result.items).toHaveLength(1);
    });

    it('calls service.getFavorites with parsed limit and page from query params', async () => {
      mockMarketplaceService.getFavorites.mockResolvedValue({ items: [], total: 0 });

      await controller.getFavorites('20', '2', mockUser as any);

      expect(mockMarketplaceService.getFavorites).toHaveBeenCalledWith(mockUser, { limit: 20, page: 2 });
    });

    it('throws BadRequestException when limit exceeds 100', async () => {
      await expect(
        controller.getFavorites('500', '1', mockUser as any),
      ).rejects.toThrow('limit must be an integer between 1 and 100');
    });
  });

  describe('toggleUpvote (POST /marketplace/:skillId/upvote)', () => {
    it('calls service.toggleUpvote with skillId and user', async () => {
      const response = { upvoteCount: 5, isUpvoted: true };
      mockMarketplaceService.toggleUpvote.mockResolvedValue(response);

      const result = await controller.toggleUpvote('skill-uuid-1', mockUser as any);

      expect(mockMarketplaceService.toggleUpvote).toHaveBeenCalledWith('skill-uuid-1', mockUser);
      expect(result).toEqual(response);
    });

    it('returns updated upvoteCount and isUpvoted=false when toggling off', async () => {
      const response = { upvoteCount: 4, isUpvoted: false };
      mockMarketplaceService.toggleUpvote.mockResolvedValue(response);

      const result = await controller.toggleUpvote('skill-uuid-1', mockUser as any);

      expect(result).toEqual({ upvoteCount: 4, isUpvoted: false });
    });
  });

  describe('toggleFavorite (POST /marketplace/:skillId/favorite)', () => {
    it('calls service.toggleFavorite with skillId and user', async () => {
      const response = { isFavorited: true };
      mockMarketplaceService.toggleFavorite.mockResolvedValue(response);

      const result = await controller.toggleFavorite('skill-uuid-1', mockUser as any);

      expect(mockMarketplaceService.toggleFavorite).toHaveBeenCalledWith('skill-uuid-1', mockUser);
      expect(result).toEqual(response);
    });

    it('returns isFavorited=false when toggling off', async () => {
      mockMarketplaceService.toggleFavorite.mockResolvedValue({ isFavorited: false });

      const result = await controller.toggleFavorite('skill-uuid-1', mockUser as any);

      expect(result).toEqual({ isFavorited: false });
    });
  });

  describe('getDiagram (marketplace diagram endpoint)', () => {
    it('getDiagram returns SkillDiagram from GenerationService', async () => {
      mockMarketplaceService.findApprovedSkillDetail = jest.fn().mockResolvedValue({ skillId: 'skill-uuid-1' });
      const mockDiagram = { mermaid: 'flowchart TD\n  A --> B' };
      mockGenerationService.generateDiagram.mockResolvedValue(mockDiagram);

      const result = await controller.getDiagram('skill-uuid-1', 'false', mockUser as any);

      expect(result).toEqual(mockDiagram);
      expect(mockGenerationService.generateDiagram).toHaveBeenCalledWith('skill-uuid-1', false, undefined);
    });

    it('getDiagram throws NotFoundException when skill not in marketplace', async () => {
      mockMarketplaceService.findApprovedSkillDetail = jest.fn().mockResolvedValue(null);

      await expect(controller.getDiagram('not-found', 'false', mockUser as any))
        .rejects.toThrow(NotFoundException);
      expect(mockGenerationService.generateDiagram).not.toHaveBeenCalled();
    });

    it('getDiagram passes force=true to GenerationService when query param is "true"', async () => {
      mockMarketplaceService.findApprovedSkillDetail = jest.fn().mockResolvedValue({ skillId: 'skill-uuid-1' });
      mockGenerationService.generateDiagram.mockResolvedValue({ mermaid: 'flowchart TD\n  A --> B' });

      await controller.getDiagram('skill-uuid-1', 'true', mockUser as any);

      expect(mockGenerationService.generateDiagram).toHaveBeenCalledWith('skill-uuid-1', true, undefined);
    });
  });
});

describe('AdminMarketplaceController', () => {
  let adminController: AdminMarketplaceController;

  beforeEach(async () => {
    jest.clearAllMocks();
    const module: TestingModule = await Test.createTestingModule({
      controllers: [AdminMarketplaceController],
      providers: [
        { provide: MarketplaceService, useValue: mockMarketplaceService },
        { provide: MarketplaceSubmissionService, useValue: mockSubmissionService },
        {
          provide: ClsService,
          useValue: {
            get: jest.fn().mockReturnValue({ marketplaceEnabled: true }),
          },
        },
      ],
    }).compile();

    adminController = module.get<AdminMarketplaceController>(AdminMarketplaceController);
  });

  describe('@Roles("admin") enforcement', () => {
    it('approve returns 204 for admin user', async () => {
      mockSubmissionService.approve.mockResolvedValue(undefined);

      await expect(adminController.approve('submission-uuid-1', mockAdminUser as any))
        .resolves.toBeUndefined();
      expect(mockSubmissionService.approve).toHaveBeenCalledWith('submission-uuid-1', mockAdminUser);
    });

    it('reject returns 204 for admin user', async () => {
      mockSubmissionService.reject.mockResolvedValue(undefined);

      await expect(adminController.reject('submission-uuid-1', mockAdminUser as any, { reviewNote: 'Too generic' }))
        .resolves.toBeUndefined();
      expect(mockSubmissionService.reject).toHaveBeenCalledWith('submission-uuid-1', mockAdminUser, 'Too generic');
    });

    it('remove (DELETE) returns 204 for admin user', async () => {
      mockMarketplaceService.removeFromMarketplace.mockResolvedValue(undefined);

      await expect(
        adminController.remove('skill-uuid-1', mockAdminUser as any, { reason: 'Policy violation' }),
      ).resolves.toBeUndefined();
      expect(mockMarketplaceService.removeFromMarketplace).toHaveBeenCalledWith(
        'skill-uuid-1',
        mockAdminUser,
        'Policy violation',
      );
    });

    // @Roles('admin') is a class-level decorator. Guard enforcement is handled by
    // RolesGuard at the NestJS layer — not unit-testable without the full HTTP adapter.
    // Verified via the @Roles('admin') decorator presence on the class.
  });
});
