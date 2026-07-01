import { Test, TestingModule } from '@nestjs/testing';
import { NotFoundException } from '@nestjs/common';
import { SKILL_REPOSITORY, type ISkillRepository } from '@skillspell/shared';
import { PublicSkillsService } from './public-skills.service';

const mockSkillRepo: jest.Mocked<Pick<ISkillRepository, 'findById'>> = {
  findById: jest.fn(),
};

// Extended mock for public listing (findPublished not on ISkillRepository yet — added in plan 03)
const mockSkillRepoFull = {
  ...mockSkillRepo,
  findPublished: jest.fn(),
};

describe('PublicSkillsService', () => {
  let service: PublicSkillsService;

  beforeEach(async () => {
    jest.clearAllMocks();
    const module: TestingModule = await Test.createTestingModule({
      providers: [
        PublicSkillsService,
        { provide: SKILL_REPOSITORY, useValue: mockSkillRepoFull },
      ],
    }).compile();
    service = module.get<PublicSkillsService>(PublicSkillsService);
  });

  describe('listPublished', () => {
    it.todo('returns only skills where isPublished = true — PUB-02');
    it.todo('supports offset/limit pagination — PUB-02');
    it.todo('filters by name with case-insensitive search when search param provided — PUB-02');
    it.todo('returns empty array when no published skills exist — PUB-02');
  });

  describe('downloadSkill', () => {
    it.todo('returns JSON envelope with name, slug, content — PUB-04, D-08');
    it.todo('slug is derived from name via kebab-case transform — D-08, D-09');
    it.todo('throws NotFoundException for unknown skill id — PUB-04');
    it.todo('throws NotFoundException for skill where isPublished = false — PUB-04');
    it.todo('envelope contains no author/user PII fields — D-09, T-3-05');
  });
});
