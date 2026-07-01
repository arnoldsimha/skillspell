import { Test, TestingModule } from '@nestjs/testing';
import { NotFoundException, ForbiddenException } from '@nestjs/common';
import { OwnershipService } from './ownership.service';
import { SKILL_REPOSITORY, type SkillSummary } from '@skillspell/shared';
import { RequestContext } from '../common/context/request-context.service';

/**
 * Unit tests for OwnershipService — skill ownership verification.
 *
 * Tests cover:
 * - Owner match (allowed)
 * - Owner mismatch (ForbiddenException)
 * - Skill not found (NotFoundException)
 * - Legacy skills without ownerId (rejected — fail closed)
 */
describe('OwnershipService', () => {
  let service: OwnershipService;
  let findMetadataByIdMock: jest.Mock;
  let ctxMock: { userId: string };

  const OWNER_ID = 'user-owner-123';
  const OTHER_USER_ID = 'user-other-456';
  const SKILL_ID = 'skill-abc-789';

  /** Helper — build a minimal SkillSummary for test use. */
  const makeSkillSummary = (overrides: Partial<SkillSummary> = {}): SkillSummary =>
    ({
      id: SKILL_ID,
      name: 'Test Skill',
      description: 'A test skill',
      version: 1,
      status: 'ready',
      ownerId: OWNER_ID,
      createdAt: '2024-01-01T00:00:00.000Z',
      updatedAt: '2024-01-01T00:00:00.000Z',
      ...overrides,
    }) as SkillSummary;

  beforeEach(async () => {
    findMetadataByIdMock = jest.fn();
    ctxMock = { userId: OWNER_ID };

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        OwnershipService,
        {
          provide: SKILL_REPOSITORY,
          useValue: { findMetadataById: findMetadataByIdMock },
        },
        {
          provide: RequestContext,
          useValue: ctxMock,
        },
      ],
    }).compile();

    service = module.get<OwnershipService>(OwnershipService);
  });

  describe('assertOwnership', () => {
    it('should return the skill summary when the current user is the owner', async () => {
      const summary = makeSkillSummary();
      findMetadataByIdMock.mockResolvedValue(summary);

      const result = await service.assertOwnership(SKILL_ID);

      expect(result).toBe(summary);
      expect(findMetadataByIdMock).toHaveBeenCalledWith(SKILL_ID);
    });

    it('should throw NotFoundException when skill does not exist', async () => {
      findMetadataByIdMock.mockResolvedValue(null);

      await expect(service.assertOwnership(SKILL_ID)).rejects.toThrow(
        NotFoundException,
      );
    });

    it('should include skill ID in the NotFoundException message', async () => {
      findMetadataByIdMock.mockResolvedValue(null);

      await expect(service.assertOwnership(SKILL_ID)).rejects.toThrow(
        `Skill with id "${SKILL_ID}" not found`,
      );
    });

    it('should throw ForbiddenException when a different user tries to access', async () => {
      const summary = makeSkillSummary({ ownerId: OWNER_ID });
      findMetadataByIdMock.mockResolvedValue(summary);

      // Set current user to a different user
      ctxMock.userId = OTHER_USER_ID;

      await expect(service.assertOwnership(SKILL_ID)).rejects.toThrow(
        ForbiddenException,
      );
    });

    it('should include a clear message in ForbiddenException', async () => {
      const summary = makeSkillSummary({ ownerId: OWNER_ID });
      findMetadataByIdMock.mockResolvedValue(summary);
      ctxMock.userId = OTHER_USER_ID;

      await expect(service.assertOwnership(SKILL_ID)).rejects.toThrow(
        'You do not own this skill',
      );
    });

    it('should reject legacy skills without ownerId (fail closed)', async () => {
      const legacySkill = makeSkillSummary({ ownerId: undefined as unknown as string });
      findMetadataByIdMock.mockResolvedValue(legacySkill);

      ctxMock.userId = OTHER_USER_ID;

      await expect(service.assertOwnership(SKILL_ID)).rejects.toThrow(
        ForbiddenException,
      );
    });

    it('should reject skills with empty string ownerId (fail closed)', async () => {
      const edgeCaseSkill = makeSkillSummary({ ownerId: '' });
      findMetadataByIdMock.mockResolvedValue(edgeCaseSkill);
      ctxMock.userId = OTHER_USER_ID;

      await expect(service.assertOwnership(SKILL_ID)).rejects.toThrow(
        ForbiddenException,
      );
    });

    it('should not call repo more than once per assertOwnership call', async () => {
      const summary = makeSkillSummary();
      findMetadataByIdMock.mockResolvedValue(summary);

      await service.assertOwnership(SKILL_ID);
      expect(findMetadataByIdMock).toHaveBeenCalledTimes(1);
    });
  });
});
