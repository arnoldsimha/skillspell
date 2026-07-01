import { Test, type TestingModule } from '@nestjs/testing';
import { NotFoundException } from '@nestjs/common';
import { USER_REPOSITORY } from '@skillspell/shared';
import { ShareController } from './share.controller.js';
import { SkillsService } from '../skills/skills.service.js';
import { ExportService } from '../export/export.service.js';
import { GenerationService } from '../generation/generation.service.js';

const makeSkill = (overrides = {}) => ({
  id: 'skill-uuid',
  ownerId: 'owner-uuid',
  name: 'Test Skill',
  description: 'desc',
  status: 'ready' as const,
  version: 1,
  isPublished: true,
  skillContent: '',
  scripts: [],
  references: [],
  assets: [],
  createdAt: '2026-01-01',
  updatedAt: '2026-01-01',
  ...overrides,
});

const makeSnapshot = () => ({
  skillId: 'skill-uuid',
  version: 1,
  description: 'desc',
  skillContent: '# Test',
  scripts: [],
  references: [],
  assets: [],
  createdAt: '2026-01-01',
});

describe('ShareController — URL-based skill sharing (SHARE-03..06)', () => {
  let controller: ShareController;
  let skillsService: jest.Mocked<Pick<SkillsService, 'findById' | 'getVersionSnapshot'>>;
  let userRepo: { findById: jest.Mock };

  const requester = { id: 'user-uuid', orgId: 'org-a' } as any;

  beforeEach(async () => {
    skillsService = {
      findById: jest.fn().mockResolvedValue(makeSkill()),
      getVersionSnapshot: jest.fn().mockResolvedValue(makeSnapshot()),
    };
    userRepo = {
      findById: jest.fn().mockResolvedValue({ id: 'owner-uuid', orgId: 'org-a' }),
    };

    const module: TestingModule = await Test.createTestingModule({
      controllers: [ShareController],
      providers: [
        { provide: SkillsService, useValue: skillsService },
        { provide: ExportService, useValue: { exportAsZip: jest.fn() } },
        { provide: GenerationService, useValue: { generateDiagram: jest.fn() } },
        { provide: USER_REPOSITORY, useValue: userRepo },
      ],
    }).compile();

    controller = module.get(ShareController);
  });

  it('SHARE-03: returns snapshot for authenticated same-org user', async () => {
    const result = await controller.getSharedSkill('skill-uuid', 1, requester);
    expect(result.name).toBe('Test Skill');
    expect(result.snapshot.skillContent).toBe('# Test');
  });

  it('SHARE-04: returns 404 for cross-org requester', async () => {
    userRepo.findById.mockResolvedValue({ id: 'owner-uuid', orgId: 'org-b' });
    const crossOrgUser = { ...requester, orgId: 'org-a' };
    await expect(controller.getSharedSkill('skill-uuid', 1, crossOrgUser)).rejects.toThrow(NotFoundException);
  });

  it('SHARE-05: returns 404 for unknown skillId', async () => {
    skillsService.findById.mockRejectedValue(new NotFoundException());
    await expect(controller.getSharedSkill('bad-uuid', 1, requester)).rejects.toThrow(NotFoundException);
  });

  it('SHARE-06: returns 404 for private skill (isPublished=false)', async () => {
    skillsService.findById.mockResolvedValue(makeSkill({ isPublished: false }) as any);
    await expect(controller.getSharedSkill('skill-uuid', 1, requester)).rejects.toThrow(NotFoundException);
  });

  it('returns 404 when skill owner cannot be found', async () => {
    userRepo.findById.mockResolvedValue(null);
    await expect(controller.getSharedSkill('skill-uuid', 1, requester)).rejects.toThrow(NotFoundException);
  });
});
