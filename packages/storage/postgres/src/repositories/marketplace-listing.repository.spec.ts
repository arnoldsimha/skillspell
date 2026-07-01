/**
 * Unit tests for PostgresMarketplaceListingRepository.
 *
 * We mock the entire entity module before it loads to sidestep the
 * skill.entity <-> skill-version.entity circular-reference that crashes Jest
 * when TypeORM entity files are loaded outside a full NestJS bootstrap.
 */

// Mock entity modules before any imports that would trigger them
jest.mock('../entities/marketplace-listing.entity', () => {
  class MockMarketplaceListingEntity {}
  return {
    MarketplaceListingEntity: MockMarketplaceListingEntity,
    MarketplaceListingStatus: {
      ACTIVE: 'active',
      REMOVAL_REQUESTED: 'removal_requested',
      REMOVED: 'removed',
    },
    MarketplaceRemovalType: {
      ADMIN_POLICY: 'admin_policy',
      OWNER_REQUEST: 'owner_request',
    },
  };
});

import { Test } from '@nestjs/testing';
import { getRepositoryToken } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { MarketplaceListingEntity } from '../entities/marketplace-listing.entity';
import { PostgresMarketplaceListingRepository } from './marketplace-listing.repository';

const makeRawEntity = (overrides: Record<string, unknown> = {}): Record<string, unknown> => ({
  id: 'listing-1',
  skillId: 'skill-1',
  orgId: 'org-1',
  submissionId: 'sub-1',
  snapshotName: 'My Skill',
  snapshotDescription: 'A skill',
  snapshotCategories: ['testing'],
  snapshotVersion: 3,
  status: 'active',
  removalReason: null,
  removedBy: null,
  removalType: null,
  firstApprovedAt: new Date('2026-01-01'),
  lastApprovedAt: new Date('2026-01-01'),
  ...overrides,
});

describe('PostgresMarketplaceListingRepository', () => {
  let repo: PostgresMarketplaceListingRepository;

  const qbMock = {
    insert: jest.fn().mockReturnThis(),
    into: jest.fn().mockReturnThis(),
    values: jest.fn().mockReturnThis(),
    orUpdate: jest.fn().mockReturnThis(),
    execute: jest.fn().mockResolvedValue(undefined),
    where: jest.fn().mockReturnThis(),
    andWhere: jest.fn().mockReturnThis(),
    orderBy: jest.fn().mockReturnThis(),
    skip: jest.fn().mockReturnThis(),
    take: jest.fn().mockReturnThis(),
    getManyAndCount: jest.fn().mockResolvedValue([[], 0]),
  };

  const mockTypeOrmRepo = {
    findOne: jest.fn(),
    update: jest.fn(),
    createQueryBuilder: jest.fn().mockReturnValue(qbMock),
  } as unknown as jest.Mocked<Repository<any>>;

  beforeEach(async () => {
    jest.clearAllMocks();
    mockTypeOrmRepo.createQueryBuilder = jest.fn().mockReturnValue(qbMock);
    const module = await Test.createTestingModule({
      providers: [
        PostgresMarketplaceListingRepository,
        { provide: getRepositoryToken(MarketplaceListingEntity), useValue: mockTypeOrmRepo },
      ],
    }).compile();
    repo = module.get(PostgresMarketplaceListingRepository);
  });

  describe('upsert', () => {
    it('uses ON CONFLICT upsert and returns the saved listing', async () => {
      const entity = makeRawEntity({ snapshotVersion: 3 });
      (mockTypeOrmRepo.findOne as jest.Mock).mockResolvedValue(entity);

      const result = await repo.upsert({
        skillId: 'skill-1',
        orgId: 'org-1',
        submissionId: 'sub-1',
        snapshotName: 'My Skill',
        snapshotDescription: 'A skill',
        snapshotCategories: ['testing'],
        snapshotVersion: 3,
      });

      expect(qbMock.insert).toHaveBeenCalled();
      expect(qbMock.orUpdate).toHaveBeenCalled();
      expect(qbMock.execute).toHaveBeenCalled();
      expect(result.skillId).toBe('skill-1');
      expect(result.snapshotVersion).toBe(3);
    });
  });

  describe('setStatus', () => {
    it('updates status with removal metadata', async () => {
      (mockTypeOrmRepo.update as jest.Mock).mockResolvedValue({ affected: 1 });

      await repo.setStatus('skill-1', 'removed', {
        removedBy: 'admin-1',
        removalReason: 'Policy violation',
        removalType: 'admin_policy',
      });

      expect(mockTypeOrmRepo.update).toHaveBeenCalledWith(
        { skillId: 'skill-1' },
        expect.objectContaining({
          status: 'removed',
          removedBy: 'admin-1',
          removalReason: 'Policy violation',
          removalType: 'admin_policy',
        }),
      );
    });

    it('clears removal metadata when setting back to active', async () => {
      (mockTypeOrmRepo.update as jest.Mock).mockResolvedValue({ affected: 1 });

      await repo.setStatus('skill-1', 'active');

      expect(mockTypeOrmRepo.update).toHaveBeenCalledWith(
        { skillId: 'skill-1' },
        expect.objectContaining({ status: 'active', removedBy: null, removalReason: null }),
      );
    });
  });
});
