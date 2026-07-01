import { Test, TestingModule } from '@nestjs/testing';
import { PublicController } from './public.controller';
import { PublicSkillsService } from './public-skills.service';

const mockPublicSkillsService = {
  listPublished: jest.fn(),
  downloadSkill: jest.fn(),
};

describe('PublicController', () => {
  let controller: PublicController;

  beforeEach(async () => {
    jest.clearAllMocks();
    const module: TestingModule = await Test.createTestingModule({
      controllers: [PublicController],
      providers: [
        { provide: PublicSkillsService, useValue: mockPublicSkillsService },
      ],
    }).compile();
    controller = module.get<PublicController>(PublicController);
  });

  describe('GET /api/public/skills', () => {
    it.todo('delegates to PublicSkillsService.listPublished with query params — PUB-02');
  });

  describe('GET /api/public/skills/:id/download', () => {
    it.todo('delegates to PublicSkillsService.downloadSkill — PUB-04, D-08');
  });
});
