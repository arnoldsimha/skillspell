import { Test, TestingModule } from '@nestjs/testing';
import { ForbiddenException, NotFoundException } from '@nestjs/common';
import {
  SKILL_REPOSITORY,
  Skill,
  SkillDiagram,
} from '@skillspell/shared';
import { GenerationService } from './generation.service';
import { SkillGenerationService } from './skill/skill-generation.service';
import { SkillValidatorService } from './skill/skill-validator.service';
import { DiagramService } from './skill/diagram.service';
import { SessionService } from './session/session.service';
import { RequestContext } from '../common/context/request-context.service';
import { OwnershipService } from '../ownership/ownership.service';

const SKILL_ID = 'skill-uuid-123';

const makeSkill = (overrides: Partial<Skill> = {}): Skill =>
  ({
    id: SKILL_ID,
    name: 'Test Skill',
    description: 'A test skill',
    skillContent: '# Test',
    scripts: [],
    references: [],
    assets: [],
    version: 1,
    status: 'ready',
    ownerId: 'user-uuid',
    createdAt: '2026-01-01T00:00:00.000Z',
    updatedAt: '2026-01-01T00:00:00.000Z',
    ...overrides,
  }) as Skill;

const makeDiagram = (overrides: Partial<SkillDiagram> = {}): SkillDiagram => ({
  skillId: SKILL_ID,
  version: 1,
  mermaid: 'flowchart LR\n  A --> B',
  summary: 'A test summary',
  createdAt: '2026-01-01T00:00:00.000Z',
  ...overrides,
});

describe('GenerationService — generateDiagram() caching logic', () => {
  let service: GenerationService;
  let skillRepoMock: {
    findById: jest.Mock;
    getDiagram: jest.Mock;
    saveDiagram: jest.Mock;
    getVersionSnapshot: jest.Mock;
  };
  let diagramServiceMock: { generateDiagram: jest.Mock };

  beforeEach(async () => {
    skillRepoMock = {
      findById: jest.fn().mockResolvedValue(makeSkill()),
      getDiagram: jest.fn().mockResolvedValue(null),
      saveDiagram: jest.fn().mockResolvedValue(undefined),
      getVersionSnapshot: jest.fn().mockResolvedValue(null),
    };
    diagramServiceMock = {
      generateDiagram: jest.fn().mockResolvedValue({
        mermaid: 'flowchart LR\n  A --> B',
        summary: 'A test summary',
      }),
    };

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        GenerationService,
        { provide: SkillGenerationService, useValue: {} },
        {
          provide: SkillValidatorService,
          useValue: { validate: jest.fn().mockReturnValue({ issues: [] }) },
        },
        { provide: DiagramService, useValue: diagramServiceMock },
        { provide: SessionService, useValue: {} },
        { provide: SKILL_REPOSITORY, useValue: skillRepoMock },
        { provide: RequestContext, useValue: { userId: 'user-uuid', skill: null } },
        { provide: OwnershipService, useValue: { assertOwnership: jest.fn().mockResolvedValue(makeSkill()) } },
      ],
    }).compile();

    service = module.get(GenerationService);
  });

  it('cache hit: returns cached diagram without calling DiagramService', async () => {
    const cached = makeDiagram();
    skillRepoMock.getDiagram.mockResolvedValue(cached);

    const result = await service.generateDiagram(SKILL_ID);

    expect(result).toEqual(cached);
    expect(diagramServiceMock.generateDiagram).not.toHaveBeenCalled();
    expect(skillRepoMock.getDiagram).toHaveBeenCalledWith(SKILL_ID, 1);
  });

  it('cache miss: calls DiagramService.generateDiagram and saves result', async () => {
    skillRepoMock.getDiagram.mockResolvedValue(null);

    const result = await service.generateDiagram(SKILL_ID);

    expect(diagramServiceMock.generateDiagram).toHaveBeenCalledTimes(1);
    expect(skillRepoMock.saveDiagram).toHaveBeenCalledTimes(1);
    expect(result.skillId).toBe(SKILL_ID);
    expect(result.mermaid).toBe('flowchart LR\n  A --> B');
  });

  it('force=true: skips cache lookup and regenerates', async () => {
    const result = await service.generateDiagram(SKILL_ID, true);

    expect(skillRepoMock.getDiagram).not.toHaveBeenCalled();
    expect(diagramServiceMock.generateDiagram).toHaveBeenCalledTimes(1);
    expect(result.skillId).toBe(SKILL_ID);
  });

  it('in-flight dedup: two concurrent cache-miss calls share one generation promise', async () => {
    skillRepoMock.getDiagram.mockResolvedValue(null);

    // Start two concurrent calls without awaiting
    const [result1, result2] = await Promise.all([
      service.generateDiagram(SKILL_ID),
      service.generateDiagram(SKILL_ID),
    ]);

    // DiagramService called exactly once despite two concurrent requests
    expect(diagramServiceMock.generateDiagram).toHaveBeenCalledTimes(1);
    expect(result1).toEqual(result2);
  });
});

describe('GenerationService — suggestPrompts() ownership enforcement', () => {
  let service: GenerationService;
  let ownershipMock: { assertOwnership: jest.Mock };
  let skillGenMock: { suggestPrompts: jest.Mock };
  let skillRepoMock: { findById: jest.Mock };
  const ctx: { userId: string; userRole?: string; skill: unknown } = {
    userId: 'user-uuid',
    userRole: 'user',
    skill: null,
  };

  beforeEach(async () => {
    ctx.userRole = 'user';
    ownershipMock = { assertOwnership: jest.fn().mockResolvedValue(makeSkill()) };
    skillGenMock = { suggestPrompts: jest.fn().mockResolvedValue([]) };
    skillRepoMock = { findById: jest.fn().mockResolvedValue(makeSkill()) };

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        GenerationService,
        { provide: SkillGenerationService, useValue: skillGenMock },
        { provide: SkillValidatorService, useValue: {} },
        { provide: DiagramService, useValue: {} },
        { provide: SessionService, useValue: {} },
        { provide: SKILL_REPOSITORY, useValue: skillRepoMock },
        { provide: RequestContext, useValue: ctx },
        { provide: OwnershipService, useValue: ownershipMock },
      ],
    }).compile();

    service = module.get(GenerationService);
  });

  it('optimize mode: asserts ownership before loading the skill', async () => {
    await service.suggestPrompts('optimize', undefined, SKILL_ID);

    expect(ownershipMock.assertOwnership).toHaveBeenCalledWith(SKILL_ID);
    expect(skillRepoMock.findById).toHaveBeenCalledWith(SKILL_ID);
  });

  it('optimize mode: propagates Forbidden and never loads a non-owned skill', async () => {
    ownershipMock.assertOwnership.mockRejectedValue(new ForbiddenException());

    await expect(
      service.suggestPrompts('optimize', undefined, SKILL_ID),
    ).rejects.toBeInstanceOf(ForbiddenException);

    expect(skillRepoMock.findById).not.toHaveBeenCalled();
  });

  it('admin: bypasses the ownership assertion', async () => {
    ctx.userRole = 'admin';

    await service.suggestPrompts('optimize', undefined, SKILL_ID);

    expect(ownershipMock.assertOwnership).not.toHaveBeenCalled();
    expect(skillRepoMock.findById).toHaveBeenCalledWith(SKILL_ID);
  });

  it('owner (higher than admin): also bypasses the ownership assertion', async () => {
    ctx.userRole = 'owner';

    await service.suggestPrompts('optimize', undefined, SKILL_ID);

    expect(ownershipMock.assertOwnership).not.toHaveBeenCalled();
    expect(skillRepoMock.findById).toHaveBeenCalledWith(SKILL_ID);
  });

  it('create mode: does not touch ownership or load any skill', async () => {
    await service.suggestPrompts('create', 'some input');

    expect(ownershipMock.assertOwnership).not.toHaveBeenCalled();
    expect(skillRepoMock.findById).not.toHaveBeenCalled();
  });
});
