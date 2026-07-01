import { Test } from '@nestjs/testing';
import { getRepositoryToken } from '@nestjs/typeorm';
import { PostgresSkillUpvoteRepository } from '../skill-upvote.repository.js';
import { SkillUpvoteEntity } from '../../entities/skill-upvote.entity.js';

const SKILL_ID = 'aaaaaaaa-0000-0000-0000-000000000001';
const USER_ID  = 'bbbbbbbb-0000-0000-0000-000000000001';

function makeRepo(overrides: Record<string, unknown> = {}) {
  return {
    findOne: jest.fn().mockResolvedValue(null),
    delete: jest.fn().mockResolvedValue({ affected: 0 }),
    save: jest.fn().mockResolvedValue(undefined),
    create: jest.fn().mockReturnValue({ skillId: SKILL_ID, userId: USER_ID }),
    count: jest.fn().mockResolvedValue(0),
    find: jest.fn().mockResolvedValue([]),
    ...overrides,
  };
}

describe('PostgresSkillUpvoteRepository', () => {
  let repo: PostgresSkillUpvoteRepository;
  let mockTypeOrmRepo: ReturnType<typeof makeRepo>;

  beforeEach(async () => {
    mockTypeOrmRepo = makeRepo();
    const module = await Test.createTestingModule({
      providers: [
        PostgresSkillUpvoteRepository,
        { provide: getRepositoryToken(SkillUpvoteEntity), useValue: mockTypeOrmRepo },
      ],
    }).compile();
    repo = module.get(PostgresSkillUpvoteRepository);
  });

  describe('toggle', () => {
    it('inserts and returns true when no existing upvote', async () => {
      mockTypeOrmRepo.delete.mockResolvedValue({ affected: 0 });
      const result = await repo.toggle(SKILL_ID, USER_ID);
      expect(result).toBe(true);
      expect(mockTypeOrmRepo.delete).toHaveBeenCalledWith({ skillId: SKILL_ID, userId: USER_ID });
      expect(mockTypeOrmRepo.save).toHaveBeenCalled();
    });

    it('deletes and returns false when upvote exists', async () => {
      mockTypeOrmRepo.delete.mockResolvedValue({ affected: 1 });
      const result = await repo.toggle(SKILL_ID, USER_ID);
      expect(result).toBe(false);
      expect(mockTypeOrmRepo.delete).toHaveBeenCalledWith({ skillId: SKILL_ID, userId: USER_ID });
      expect(mockTypeOrmRepo.save).not.toHaveBeenCalled();
    });

    it('returns true when concurrent insert wins the race (unique violation)', async () => {
      mockTypeOrmRepo.delete.mockResolvedValue({ affected: 0 });
      const uniqueErr = Object.assign(new Error('duplicate key'), { code: '23505' });
      mockTypeOrmRepo.save.mockRejectedValue(uniqueErr);
      const result = await repo.toggle(SKILL_ID, USER_ID);
      expect(result).toBe(true);
    });

    it('rethrows non-unique-constraint errors', async () => {
      mockTypeOrmRepo.delete.mockResolvedValue({ affected: 0 });
      const dbErr = Object.assign(new Error('connection lost'), { code: '08006' });
      mockTypeOrmRepo.save.mockRejectedValue(dbErr);
      await expect(repo.toggle(SKILL_ID, USER_ID)).rejects.toThrow('connection lost');
    });
  });

  describe('countBySkillId', () => {
    it('delegates to typeorm count', async () => {
      mockTypeOrmRepo.count.mockResolvedValue(7);
      const result = await repo.countBySkillId(SKILL_ID);
      expect(result).toBe(7);
    });
  });

  describe('findSkillIdsByUser', () => {
    it('returns empty array when skillIds is empty', async () => {
      const result = await repo.findSkillIdsByUser(USER_ID, []);
      expect(result).toEqual([]);
      expect(mockTypeOrmRepo.find).not.toHaveBeenCalled();
    });

    it('returns skillIds from matching rows', async () => {
      mockTypeOrmRepo.find.mockResolvedValue([{ skillId: SKILL_ID }]);
      const result = await repo.findSkillIdsByUser(USER_ID, [SKILL_ID]);
      expect(result).toEqual([SKILL_ID]);
    });
  });
});
