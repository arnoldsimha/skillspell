import { Test, TestingModule } from '@nestjs/testing';
import { NotFoundException, ConflictException, ForbiddenException, BadRequestException } from '@nestjs/common';
import { SkillsService } from './skills.service';
import {
  SKILL_REPOSITORY,
  SESSION_REPOSITORY,
  EVAL_REPOSITORY,
  MARKETPLACE_SUBMISSION_REPOSITORY,
  MARKETPLACE_LISTING_REPOSITORY,
  MARKETPLACE_REMOVAL_REQUEST_REPOSITORY,
  type IMarketplaceRemovalRequestRepository,
  SKILL_CATEGORY_REPOSITORY,
  CATEGORY_REPOSITORY,
  type Skill,
  type SkillSummary,
} from '@skillspell/shared';
import { RequestContext } from '../common/context/request-context.service';
import { GenerationService } from '../generation/generation.service';

/**
 * Unit tests for SkillsService.
 *
 * After the metadata/version split:
 * - The service never reads ctx.skill; it only uses ctx.userId for auth identity.
 * - findById always fetches from the database
 * - getMetadata(id) fetches metadata via findMetadataById
 * - getVersionHistory fetches metadata via findMetadataById for version check
 * - approveOptimization fetches metadata via findMetadataById for version check
 * - update fetches full skill from DB when name changes (front-matter sync)
 * - create stamps ownerId from ctx.userId
 * - findAll queries by ctx.userId
 */
describe('SkillsService', () => {
  let service: SkillsService;
  let skillRepoMock: Record<string, jest.Mock>;
  let sessionRepoMock: Record<string, jest.Mock>;
  let evalRepoMock: Record<string, jest.Mock>;
  let marketplaceSubmissionRepoMock: Record<string, jest.Mock>;
  let mockRemovalRequestRepo: jest.Mocked<IMarketplaceRemovalRequestRepository>;
  let ctxMock: { userId: string };

  const USER_ID = 'user-owner-123';
  const SKILL_ID = 'skill-abc-789';

  /** Build a full Skill (used for repo mock returns). */
  const makeSkill = (overrides: Partial<Skill> = {}): Skill =>
    ({
      id: SKILL_ID,
      name: 'Test Skill',
      description: 'A test skill',
      skillContent: '---\nname: Test Skill\n---\n# Test',
      scripts: [],
      references: [],
      assets: [],
      version: 1,
      status: 'ready',
      ownerId: USER_ID,
      createdAt: '2024-01-01T00:00:00.000Z',
      updatedAt: '2024-01-01T00:00:00.000Z',
      ...overrides,
    }) as Skill;

  /** Build a SkillSummary (metadata-only, used for ctx.skill). */
  const makeSkillSummary = (overrides: Partial<SkillSummary> = {}): SkillSummary =>
    ({
      id: SKILL_ID,
      name: 'Test Skill',
      description: 'A test skill',
      version: 1,
      status: 'ready',
      ownerId: USER_ID,
      createdAt: '2024-01-01T00:00:00.000Z',
      updatedAt: '2024-01-01T00:00:00.000Z',
      ...overrides,
    }) as SkillSummary;

  beforeEach(async () => {
    skillRepoMock = {
      findById: jest.fn(),
      findMetadataById: jest.fn(),
      findByName: jest.fn().mockResolvedValue(null),
      findByOwner: jest.fn().mockResolvedValue([]),
      create: jest.fn(),
      update: jest.fn(),
      delete: jest.fn().mockResolvedValue(undefined),
      getVersionHistory: jest.fn().mockResolvedValue([]),
      getVersionSnapshot: jest.fn(),
      saveVersionSnapshot: jest.fn().mockResolvedValue(undefined),
      updateAndIncrementVersion: jest.fn(),
    };
    sessionRepoMock = {
      deleteSession: jest.fn().mockResolvedValue(undefined),
    };
    evalRepoMock = {
      deleteEvalRunsBySkill: jest.fn().mockResolvedValue(undefined),
      deleteFeedbackBySkill: jest.fn().mockResolvedValue(undefined),
      deleteEvalCasesBySkill: jest.fn().mockResolvedValue(undefined),
      deleteBenchmarkSnapshots: jest.fn().mockResolvedValue(undefined),
    };
    marketplaceSubmissionRepoMock = {
      findActiveBySkillId: jest.fn().mockResolvedValue([]),
      findApprovedVersionsBySkillId: jest.fn().mockResolvedValue([]),
    };
    mockRemovalRequestRepo = {
      create: jest.fn(),
      findById: jest.fn(),
      findPendingByOrg: jest.fn(),
      hasPendingForSkill: jest.fn().mockResolvedValue(false),
      updateStatus: jest.fn(),
    } as jest.Mocked<IMarketplaceRemovalRequestRepository>;
    ctxMock = { userId: USER_ID };

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        SkillsService,
        { provide: SKILL_REPOSITORY, useValue: skillRepoMock },
        { provide: SESSION_REPOSITORY, useValue: sessionRepoMock },
        { provide: EVAL_REPOSITORY, useValue: evalRepoMock },
        { provide: MARKETPLACE_SUBMISSION_REPOSITORY, useValue: marketplaceSubmissionRepoMock },
        { provide: MARKETPLACE_LISTING_REPOSITORY, useValue: { findBySkillId: jest.fn().mockResolvedValue(null), findActiveByOrgId: jest.fn().mockResolvedValue({ items: [], total: 0 }) } },
        { provide: MARKETPLACE_REMOVAL_REQUEST_REPOSITORY, useValue: mockRemovalRequestRepo },
        { provide: SKILL_CATEGORY_REPOSITORY, useValue: { setForSkill: jest.fn().mockResolvedValue(undefined), findBySkillId: jest.fn().mockResolvedValue([]) } },
        { provide: CATEGORY_REPOSITORY, useValue: { findById: jest.fn().mockResolvedValue(null) } },
        { provide: RequestContext, useValue: ctxMock },
        { provide: GenerationService, useValue: { generateDiagram: jest.fn().mockResolvedValue(undefined) } },
      ],
    }).compile();

    service = module.get<SkillsService>(SkillsService);
  });

  describe('findById', () => {
    it('should always fetch from the database', async () => {
      const skill = makeSkill();
      skillRepoMock.findById.mockResolvedValue(skill);

      const result = await service.findById(SKILL_ID);

      expect(result).toBe(skill);
      expect(skillRepoMock.findById).toHaveBeenCalledWith(SKILL_ID);
    });

    it('should throw NotFoundException when repo returns null', async () => {
      skillRepoMock.findById.mockResolvedValue(null);

      await expect(service.findById(SKILL_ID)).rejects.toThrow(
        NotFoundException,
      );
    });
  });

  describe('getMetadata', () => {
    it('should fetch metadata via findMetadataById', async () => {
      const summary = makeSkillSummary();
      skillRepoMock.findMetadataById.mockResolvedValue(summary);

      const result = await service.getMetadata(SKILL_ID);

      expect(result).toEqual(summary);
      expect(skillRepoMock.findMetadataById).toHaveBeenCalledWith(SKILL_ID);
    });

    it('should throw NotFoundException when skill does not exist', async () => {
      skillRepoMock.findMetadataById.mockResolvedValue(null);

      await expect(service.getMetadata(SKILL_ID)).rejects.toThrow(
        NotFoundException,
      );
    });

    it('returns skill status directly without querying submissions', async () => {
      const mockSkill: SkillSummary = {
        id: 'skill-1',
        ownerId: 'user-1',
        name: 'test-skill',
        description: '',
        status: 'published',
        version: 1,
        createdAt: new Date().toISOString(),
        updatedAt: new Date().toISOString(),
        isPublished: true,
      };
      skillRepoMock.findMetadataById.mockResolvedValue(mockSkill);

      const result = await service.getMetadata('skill-1');

      expect(result).toEqual(mockSkill);
      expect(result).not.toHaveProperty('submissionStatus');
      // submissions repo should NOT be called
      expect(marketplaceSubmissionRepoMock.findActiveBySkillId).not.toHaveBeenCalled();
    });
  });

  describe('findAll', () => {
    it('should query by the current user ID', async () => {
      skillRepoMock.findByOwner.mockResolvedValue([]);

      await service.findAll();

      expect(skillRepoMock.findByOwner).toHaveBeenCalledWith(USER_ID);
    });
  });

  describe('nameExists', () => {
    it('should return false when no skill with that name exists', async () => {
      skillRepoMock.findByName.mockResolvedValue(null);

      const result = await service.nameExists('new-skill');

      expect(result).toBe(false);
      expect(skillRepoMock.findByName).toHaveBeenCalledWith('new-skill', USER_ID);
    });

    it('should return true when a skill with that name exists', async () => {
      skillRepoMock.findByName.mockResolvedValue(makeSkill());

      const result = await service.nameExists('Test Skill');

      expect(result).toBe(true);
    });

    it('should return false when the matching skill is the excluded one', async () => {
      skillRepoMock.findByName.mockResolvedValue(makeSkill({ id: SKILL_ID }));

      const result = await service.nameExists('Test Skill', SKILL_ID);

      expect(result).toBe(false);
    });

    it('should return true when the matching skill is different from the excluded one', async () => {
      skillRepoMock.findByName.mockResolvedValue(makeSkill({ id: 'other-id' }));

      const result = await service.nameExists('Test Skill', SKILL_ID);

      expect(result).toBe(true);
    });
  });

  describe('create', () => {
    it('should stamp ownerId from ctx.userId', async () => {
      const created = makeSkill();
      skillRepoMock.findByName.mockResolvedValue(null);
      skillRepoMock.create.mockResolvedValue(created);

      await service.create({
        name: 'New Skill',
        description: 'A new skill',
        skillContent: '# New',
        scripts: [],
        references: [],
        assets: [],
        status: 'ready',
      });

      expect(skillRepoMock.create).toHaveBeenCalledWith(
        expect.objectContaining({ ownerId: USER_ID }),
      );
    });

    it('should throw ConflictException when name already exists', async () => {
      skillRepoMock.findByName.mockResolvedValue(makeSkill({ name: 'existing-skill' }));

      await expect(
        service.create({
          name: 'existing-skill',
          description: 'A duplicate',
          skillContent: '# Dup',
          scripts: [],
          references: [],
          assets: [],
          status: 'ready',
        }),
      ).rejects.toThrow(ConflictException);

      expect(skillRepoMock.create).not.toHaveBeenCalled();
    });
  });

  describe('update', () => {
    it('should fetch full skill from DB when name changes (front-matter sync)', async () => {
      const existing = makeSkill();
      skillRepoMock.findByName.mockResolvedValue(null);
      skillRepoMock.findById.mockResolvedValue(existing);
      const updated = makeSkill({ name: 'Updated' });
      skillRepoMock.update.mockResolvedValue(updated);

      const result = await service.update(SKILL_ID, { name: 'Updated' });

      expect(result).toBe(updated);
      // Should call findById to load content for front-matter sync
      expect(skillRepoMock.findById).toHaveBeenCalledWith(SKILL_ID);
    });

    it('should sync name in SKILL.md front-matter when name changes', async () => {
      const existing = makeSkill({
        skillContent: '---\nname: Old Name\n---\n# Content',
      });
      skillRepoMock.findByName.mockResolvedValue(null);
      skillRepoMock.findById.mockResolvedValue(existing);
      skillRepoMock.update.mockImplementation((_id: string, data: Record<string, unknown>) => data);

      await service.update(SKILL_ID, { name: 'New Name' });

      expect(skillRepoMock.update).toHaveBeenCalledWith(
        SKILL_ID,
        expect.objectContaining({
          name: 'New Name',
          // Name is emitted as a single-quoted YAML scalar (injection hardening).
          skillContent: expect.stringContaining("name: 'New Name'"),
        }),
      );
    });

    it('should throw ConflictException when renaming to an existing name', async () => {
      skillRepoMock.findByName.mockResolvedValue(makeSkill({ id: 'other-skill-id', name: 'taken-name' }));

      await expect(
        service.update(SKILL_ID, { name: 'taken-name' }),
      ).rejects.toThrow(ConflictException);

      expect(skillRepoMock.update).not.toHaveBeenCalled();
    });

    it('should allow renaming to its own current name (same skill)', async () => {
      skillRepoMock.findByName.mockResolvedValue(makeSkill({ id: SKILL_ID, name: 'same-name' }));
      skillRepoMock.findById.mockResolvedValue(makeSkill({ name: 'same-name' }));
      skillRepoMock.update.mockResolvedValue(makeSkill({ name: 'same-name' }));

      const result = await service.update(SKILL_ID, { name: 'same-name' });

      expect(result).toBeDefined();
      expect(skillRepoMock.update).toHaveBeenCalled();
    });
  });

  describe('delete', () => {
    it('should delete skill, session, and benchmark data', async () => {
      await service.delete(SKILL_ID);

      expect(skillRepoMock.delete).toHaveBeenCalledWith(SKILL_ID);
      expect(sessionRepoMock.deleteSession).toHaveBeenCalledWith(SKILL_ID);
      expect(evalRepoMock.deleteEvalRunsBySkill).toHaveBeenCalledWith(SKILL_ID);
      expect(evalRepoMock.deleteFeedbackBySkill).toHaveBeenCalledWith(SKILL_ID);
      expect(evalRepoMock.deleteEvalCasesBySkill).toHaveBeenCalledWith(SKILL_ID);
      expect(evalRepoMock.deleteBenchmarkSnapshots).toHaveBeenCalledWith(SKILL_ID);
    });

    it('blocks deletion when skill has an approved marketplace listing', async () => {
      marketplaceSubmissionRepoMock.findActiveBySkillId.mockResolvedValue([
        { status: 'approved' },
      ] as never);

      await expect(service.delete('skill-1')).rejects.toThrow(
        'This skill is published on the marketplace. Request removal before deleting.',
      );
    });

    it('blocks deletion when marketplace removal is pending admin review', async () => {
      marketplaceSubmissionRepoMock.findActiveBySkillId.mockResolvedValue([]);
      mockRemovalRequestRepo.hasPendingForSkill.mockResolvedValue(true);

      await expect(service.delete('skill-1')).rejects.toThrow(
        'A marketplace removal request is pending admin review. You cannot delete this skill until it is resolved.',
      );
    });

    it('should throw ForbiddenException when skill has a pending_review marketplace submission', async () => {
      marketplaceSubmissionRepoMock.findActiveBySkillId.mockResolvedValue([
        { id: 'sub-1', status: 'pending_review' },
      ]);

      await expect(service.delete(SKILL_ID)).rejects.toThrow(ForbiddenException);
      expect(skillRepoMock.delete).not.toHaveBeenCalled();
    });

    it('should proceed with deletion when no active marketplace submissions exist', async () => {
      marketplaceSubmissionRepoMock.findActiveBySkillId.mockResolvedValue([]);

      await service.delete(SKILL_ID);

      expect(skillRepoMock.delete).toHaveBeenCalledWith(SKILL_ID);
    });
  });

  describe('getVersionHistory', () => {
    it('should fetch metadata via findMetadataById to check current version', async () => {
      skillRepoMock.findMetadataById.mockResolvedValue(makeSkillSummary({ version: 3 }));
      skillRepoMock.getVersionHistory.mockResolvedValue([
        { version: 3, createdAt: '2024-01-01T00:00:00.000Z' },
      ]);

      await service.getVersionHistory(SKILL_ID);

      expect(skillRepoMock.findMetadataById).toHaveBeenCalledWith(SKILL_ID);
      // Should not call findById when snapshot exists for current version
      expect(skillRepoMock.findById).not.toHaveBeenCalled();
      expect(skillRepoMock.getVersionHistory).toHaveBeenCalledWith(SKILL_ID);
    });

    it('should auto-save snapshot when current version is missing', async () => {
      const fullSkill = makeSkill({ version: 3 });
      skillRepoMock.findMetadataById.mockResolvedValue(makeSkillSummary({ version: 3 }));
      // First call returns no snapshot for current version
      skillRepoMock.getVersionHistory
        .mockResolvedValueOnce([{ version: 1, createdAt: '2024-01-01T00:00:00.000Z' }])
        .mockResolvedValueOnce([
          { version: 1, createdAt: '2024-01-01T00:00:00.000Z' },
          { version: 3, createdAt: '2024-01-01T00:00:00.000Z' },
        ]);
      // Needs to fetch full skill to save snapshot
      skillRepoMock.findById.mockResolvedValue(fullSkill);

      await service.getVersionHistory(SKILL_ID);

      expect(skillRepoMock.findMetadataById).toHaveBeenCalledWith(SKILL_ID);
      expect(skillRepoMock.findById).toHaveBeenCalledWith(SKILL_ID);
      expect(skillRepoMock.saveVersionSnapshot).toHaveBeenCalledWith(fullSkill);
    });

    it('should throw NotFoundException when skill does not exist', async () => {
      skillRepoMock.findMetadataById.mockResolvedValue(null);

      await expect(service.getVersionHistory(SKILL_ID)).rejects.toThrow(
        NotFoundException,
      );
    });
  });
});
