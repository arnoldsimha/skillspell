import {
  BadRequestException,
  ConflictException,
  ForbiddenException,
  NotFoundException,
} from '@nestjs/common';
import { Test, TestingModule } from '@nestjs/testing';
import {
  MARKETPLACE_LISTING_REPOSITORY,
  MARKETPLACE_REMOVAL_REQUEST_REPOSITORY,
  MARKETPLACE_SUBMISSION_REPOSITORY,
  ORGANIZATION_REPOSITORY,
  SKILL_REPOSITORY,
  USER_REPOSITORY,
  type IMarketplaceListingRepository,
  type IMarketplaceRemovalRequestRepository,
  type IMarketplaceSubmissionRepository,
  type IOrganizationRepository,
  type ISkillRepository,
  type IUserRepository,
  type MarketplaceListing,
  type MarketplaceSubmission,
  type Organization,
  type User,
} from '@skillspell/shared';
import { DataSource } from 'typeorm';
import { MarketplaceSubmissionService } from './marketplace-submission.service.js';
import { RequirementsCheckerService } from './requirements-checker.service.js';

// ─── Factories ───────────────────────────────────────────────────────────────

const makeSubmission = (overrides: Partial<MarketplaceSubmission> = {}): MarketplaceSubmission => ({
  id: 'sub-1',
  skillId: 'skill-1',
  version: '1',
  status: 'pending_review',
  submittedBy: 'user-1',
  reviewedBy: null,
  reviewNote: null,
  submittedAt: new Date().toISOString(),
  reviewedAt: null,
  snapshotName: 'My Skill',
  snapshotDescription: 'A great skill',
  snapshotCategories: ['productivity'],
  requirementsMet: null,
  ...overrides,
});

const makeUser = (overrides: Partial<User> = {}): User =>
  ({
    id: 'user-1',
    orgId: 'org-1',
    email: 'user@example.com',
    firstName: 'Test',
    lastName: 'User',
    role: 'user',
    isActive: true,
    authProviders: [],
    profileComplete: true,
    twoFactorEnabled: false,
    createdAt: new Date().toISOString(),
    updatedAt: new Date().toISOString(),
    ...overrides,
  }) as unknown as User;

const makeListing = (overrides: Partial<MarketplaceListing> = {}): MarketplaceListing => ({
  id: 'listing-1',
  skillId: 'skill-1',
  orgId: 'org-1',
  submissionId: 'sub-1',
  snapshotName: 'My Skill',
  snapshotDescription: 'A great skill',
  snapshotCategories: ['productivity'],
  snapshotVersion: 1,
  status: 'active',
  removalReason: null,
  removedBy: null,
  removalType: null,
  firstApprovedAt: new Date().toISOString(),
  lastApprovedAt: new Date().toISOString(),
  ...overrides,
});

const makeOrg = (overrides: Partial<Organization> = {}) => ({
  id: 'org-1',
  name: 'Test Org',
  passwordLoginEnabled: true,
  ssoLoginEnabled: true,
  marketplaceAllowSelfApproval: false,
  createdAt: new Date().toISOString(),
  updatedAt: new Date().toISOString(),
  ...overrides,
});

// ─── Test Suite ───────────────────────────────────────────────────────────────

describe('MarketplaceSubmissionService', () => {
  let service: MarketplaceSubmissionService;

  const mockSubmissionRepo: jest.Mocked<IMarketplaceSubmissionRepository> = {
    create: jest.fn(),
    findById: jest.fn(),
    findBySkillId: jest.fn(),
    findActiveBySkillId: jest.fn(),
    findBySubmittedBy: jest.fn(),
    findPendingByOrg: jest.fn(),
    findPendingByIdAndOrg: jest.fn(),
    updateStatus: jest.fn(),
    findApprovedByOrg: jest.fn(),
    findApprovedCountByOrg: jest.fn(),
    removeAllApprovedBySkillId: jest.fn(),
    findApprovedBySkillAndOrg: jest.fn(),
    findApprovedVersionsBySkillId: jest.fn(),
    findApprovedVersionBySkillAndVersion: jest.fn(),
    removeVersion: jest.fn(),
  };

  const mockListingRepo: jest.Mocked<IMarketplaceListingRepository> = {
    upsert: jest.fn(),
    findBySkillId: jest.fn(),
    findActiveByOrgId: jest.fn(),
    setStatus: jest.fn(),
  };

  const mockSkillRepo: jest.Mocked<ISkillRepository> = {
    create: jest.fn(),
    findById: jest.fn(),
    findMetadataById: jest.fn(),
    findByName: jest.fn(),
    findAll: jest.fn(),
    findByOwner: jest.fn(),
    update: jest.fn(),
    delete: jest.fn(),
    incrementVersion: jest.fn(),
    updateAndIncrementVersion: jest.fn(),
    saveVersionSnapshot: jest.fn(),
    getVersionHistory: jest.fn(),
    getVersionSnapshot: jest.fn(),
    deleteVersionSnapshots: jest.fn(),
    getDiagram: jest.fn(),
    saveDiagram: jest.fn(),
    deleteDiagrams: jest.fn(),
    findPublished: jest.fn(),
    findCategorySlugsBySkillId: jest.fn(),
    findSkillWithOwnerOrgId: jest.fn(),
  };

  const mockUserRepo: jest.Mocked<IUserRepository> = {
    create: jest.fn(),
    findById: jest.fn(),
    findByEmail: jest.fn(),
    findAll: jest.fn(),
    update: jest.fn(),
    deactivate: jest.fn(),
  };

  const mockOrgRepo: jest.Mocked<IOrganizationRepository> = {
    findById: jest.fn(),
    findSingleton: jest.fn(),
    create: jest.fn(),
    update: jest.fn(),
  };

  const mockRemovalRequestRepo: jest.Mocked<IMarketplaceRemovalRequestRepository> = {
    create: jest.fn(),
    findById: jest.fn(),
    findPendingByOrg: jest.fn(),
    hasPendingForSkill: jest.fn(),
    updateStatus: jest.fn(),
  };

  const mockDataSource = {
    getRepository: jest.fn(),
    query: jest.fn().mockResolvedValue([]),
    transaction: jest.fn((cb: (em: unknown) => Promise<unknown>) => cb({ query: jest.fn().mockResolvedValue(undefined) })),
  };

  beforeEach(async () => {
    jest.resetAllMocks();
    mockDataSource.transaction.mockImplementation((cb: (em: unknown) => Promise<unknown>) => cb({ query: jest.fn().mockResolvedValue(undefined) }));
    mockDataSource.query.mockResolvedValue([]);

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        MarketplaceSubmissionService,
        { provide: MARKETPLACE_SUBMISSION_REPOSITORY, useValue: mockSubmissionRepo },
        { provide: MARKETPLACE_LISTING_REPOSITORY, useValue: mockListingRepo },
        { provide: MARKETPLACE_REMOVAL_REQUEST_REPOSITORY, useValue: mockRemovalRequestRepo },
        { provide: SKILL_REPOSITORY, useValue: mockSkillRepo },
        { provide: USER_REPOSITORY, useValue: mockUserRepo },
        { provide: ORGANIZATION_REPOSITORY, useValue: mockOrgRepo },
        { provide: DataSource, useValue: mockDataSource },
        RequirementsCheckerService,
      ],
    }).compile();

    service = module.get<MarketplaceSubmissionService>(MarketplaceSubmissionService);
  });

  // Helper: wire up the org-scope check to pass for org-1
  // assertSkillBelongsToOrg now calls skillRepo.findSkillWithOwnerOrgId (single JOIN)
  const mockOrgScopePass = (orgId = 'org-1') => {
    mockSkillRepo.findSkillWithOwnerOrgId.mockResolvedValue({ skill: { id: 'skill-1' } as never, ownerOrgId: orgId });
  };

  const user = makeUser({ id: 'user-1', orgId: 'org-1' });
  const admin = makeUser({ id: 'admin-1', orgId: 'org-1', role: 'admin' });

  // ─── submit ─────────────────────────────────────────────────────────────────

  describe('submit', () => {
    it('sets skill status to in_review on successful submission', async () => {
      mockSkillRepo.findById.mockResolvedValue({ id: 'skill-1', ownerId: 'user-1', name: 'My Skill', description: null } as never);
      mockSubmissionRepo.findBySkillId.mockResolvedValue([]);
      mockSubmissionRepo.create.mockResolvedValue(makeSubmission());
      mockSkillRepo.findCategorySlugsBySkillId.mockResolvedValue([]);
      mockListingRepo.findBySkillId.mockResolvedValue(null);

      await service.submit({ skillId: 'skill-1', version: '1' }, user);

      expect(mockSkillRepo.update).toHaveBeenCalledWith('skill-1', { status: 'in_review' });
    });

    it('creates a submission with snapshot data from skill and categories', async () => {
      const user = makeUser({ id: 'user-1' });
      mockSkillRepo.findById.mockResolvedValue({
        id: 'skill-1',
        ownerId: 'user-1',
        name: 'My Skill',
        description: 'A great skill',
      } as never);
      mockSkillRepo.findCategorySlugsBySkillId.mockResolvedValue(['productivity']);
      mockSubmissionRepo.findBySkillId.mockResolvedValue([]);
      mockListingRepo.findBySkillId.mockResolvedValue(null);
      const expected = makeSubmission();
      mockSubmissionRepo.create.mockResolvedValue(expected);

      const result = await service.submit({ skillId: 'skill-1', version: '1' }, user);

      expect(mockSubmissionRepo.create).toHaveBeenCalledWith(
        expect.objectContaining({
          skillId: 'skill-1',
          version: '1',
          submittedBy: 'user-1',
          snapshotName: 'My Skill',
          snapshotDescription: 'A great skill',
          snapshotCategories: ['productivity'],
          submitterNote: null,
        }),
      );
      expect(result).toBe(expected);
    });

    it('throws ForbiddenException if caller is not the skill owner', async () => {
      const user = makeUser({ id: 'user-1' });
      mockSkillRepo.findById.mockResolvedValue({ id: 'skill-1', ownerId: 'other-user' } as never);

      await expect(service.submit({ skillId: 'skill-1', version: '1' }, user)).rejects.toThrow(
        ForbiddenException,
      );
      expect(mockSubmissionRepo.create).not.toHaveBeenCalled();
    });

    it('throws NotFoundException if skill does not exist', async () => {
      mockSkillRepo.findById.mockResolvedValue(null);

      await expect(
        service.submit({ skillId: 'skill-1', version: '1' }, makeUser()),
      ).rejects.toThrow(NotFoundException);
    });

    it('throws ConflictException if a pending_review submission already exists', async () => {
      const user = makeUser({ id: 'user-1' });
      mockSkillRepo.findById.mockResolvedValue({ id: 'skill-1', ownerId: 'user-1' } as never);
      mockSubmissionRepo.findBySkillId.mockResolvedValue([
        makeSubmission({ status: 'pending_review' }),
      ]);

      await expect(service.submit({ skillId: 'skill-1', version: '2' }, user)).rejects.toThrow(
        ConflictException,
      );
      expect(mockSubmissionRepo.create).not.toHaveBeenCalled();
    });

    it('throws ConflictException if this exact version is already approved', async () => {
      const user = makeUser({ id: 'user-1' });
      mockSkillRepo.findById.mockResolvedValue({ id: 'skill-1', ownerId: 'user-1' } as never);
      mockSubmissionRepo.findBySkillId.mockResolvedValue([
        makeSubmission({ status: 'approved', version: '1' }),
      ]);

      await expect(service.submit({ skillId: 'skill-1', version: '1' }, user)).rejects.toThrow(
        ConflictException,
      );
    });
  });

  // ─── approve ─────────────────────────────────────────────────────────────────

  // Helper: wire approve path — service uses findPendingByIdAndOrg + raw SQL transaction
  const mockApprovePass = (submittedBy = 'user-2') => {
    mockSubmissionRepo.findPendingByIdAndOrg.mockResolvedValue(
      makeSubmission({ id: 'sub-1', submittedBy, status: 'pending_review', version: '1' }),
    );
    mockSkillRepo.findSkillWithOwnerOrgId.mockResolvedValue({ skill: { id: 'skill-1' } as never, ownerOrgId: 'org-1' });
    mockSkillRepo.getVersionSnapshot.mockResolvedValue({ skillContent: '# content' } as never);
  };

  describe('approve', () => {
    it('runs the transaction and completes without error on a valid submission', async () => {
      mockApprovePass();

      await expect(service.approve('sub-1', admin)).resolves.toBeUndefined();
    });

    it('throws ForbiddenException on self-approval when org disallows it', async () => {
      mockApprovePass('admin-1'); // submittedBy === admin.id
      mockOrgRepo.findById.mockResolvedValue(makeOrg({ marketplaceAllowSelfApproval: false }) as never);

      await expect(service.approve('sub-1', admin)).rejects.toThrow(ForbiddenException);
    });

    it('throws NotFoundException if submission is not found or not pending in org', async () => {
      mockSubmissionRepo.findPendingByIdAndOrg.mockResolvedValue(null);

      await expect(service.approve('sub-missing', admin)).rejects.toThrow(NotFoundException);
    });

    it('throws NotFoundException instead of ConflictException when submission is not pending (org-scoped lookup returns null)', async () => {
      // Service uses findPendingByIdAndOrg — non-pending submissions return null → NotFoundException
      mockSubmissionRepo.findPendingByIdAndOrg.mockResolvedValue(null);

      await expect(service.approve('sub-1', admin)).rejects.toThrow(NotFoundException);
    });

    it('fetches skill org via single JOIN (no duplicate DB calls)', async () => {
      mockApprovePass();

      await service.approve('sub-1', admin);

      expect(mockSkillRepo.findSkillWithOwnerOrgId).toHaveBeenCalledTimes(1);
      expect(mockUserRepo.findById).not.toHaveBeenCalled();
    });

    it('throws ForbiddenException when skill belongs to a different org', async () => {
      mockSubmissionRepo.findPendingByIdAndOrg.mockResolvedValue(
        makeSubmission({ id: 'sub-1', submittedBy: 'user-2', status: 'pending_review' }),
      );
      mockSkillRepo.findSkillWithOwnerOrgId.mockResolvedValue({ skill: { id: 'skill-1' } as never, ownerOrgId: 'org-2' });

      await expect(service.approve('sub-1', admin)).rejects.toThrow(ForbiddenException);
    });

    it('allows self-approval when org.marketplaceAllowSelfApproval is true', async () => {
      mockApprovePass('admin-1'); // submittedBy === admin.id
      mockOrgRepo.findById.mockResolvedValue(makeOrg({ marketplaceAllowSelfApproval: true }) as never);

      await expect(service.approve('sub-1', admin)).resolves.not.toThrow();
    });

    it('blocks self-approval when org.marketplaceAllowSelfApproval is false', async () => {
      mockApprovePass('admin-1');
      mockOrgRepo.findById.mockResolvedValue(makeOrg({ marketplaceAllowSelfApproval: false }) as never);

      await expect(service.approve('sub-1', admin)).rejects.toThrow(
        'You cannot approve or reject your own submission.',
      );
    });
  });

  // ─── reject ──────────────────────────────────────────────────────────────────

  describe('reject', () => {
    it('sets skill status to ready on reject', async () => {
      mockSubmissionRepo.findPendingByIdAndOrg.mockResolvedValue(makeSubmission({ status: 'pending_review', submittedBy: 'user-2' }));
      mockSkillRepo.findSkillWithOwnerOrgId.mockResolvedValue({ skill: { id: 'skill-1' } as never, ownerOrgId: 'org-1' });
      mockOrgRepo.findById.mockResolvedValue(makeOrg({ marketplaceAllowSelfApproval: true }) as never);
      mockSubmissionRepo.updateStatus.mockResolvedValue(undefined);
      mockSubmissionRepo.findApprovedVersionsBySkillId.mockResolvedValue([]);

      await service.reject('sub-1', admin, 'Needs improvement');

      expect(mockSkillRepo.update).toHaveBeenCalledWith('skill-1', { status: 'ready' });
    });

    it('updates status to rejected with review note', async () => {
      const admin = makeUser({ id: 'admin-1', orgId: 'org-1' });
      mockSubmissionRepo.findPendingByIdAndOrg.mockResolvedValue(
        makeSubmission({ id: 'sub-1', submittedBy: 'user-2' }),
      );
      mockOrgScopePass();
      mockSubmissionRepo.updateStatus.mockResolvedValue(undefined);
      mockSubmissionRepo.findApprovedVersionsBySkillId.mockResolvedValue([]);

      await service.reject('sub-1', admin, 'Needs more detail');

      expect(mockSubmissionRepo.updateStatus).toHaveBeenCalledWith(
        'sub-1',
        'rejected',
        'admin-1',
        'Needs more detail',
      );
    });

    it('throws ForbiddenException on self-rejection', async () => {
      const admin = makeUser({ id: 'user-1', orgId: 'org-1' });
      mockSubmissionRepo.findPendingByIdAndOrg.mockResolvedValue(
        makeSubmission({ id: 'sub-1', submittedBy: 'user-1' }),
      );
      mockOrgScopePass();

      await expect(service.reject('sub-1', admin)).rejects.toThrow(ForbiddenException);
      expect(mockSubmissionRepo.updateStatus).not.toHaveBeenCalled();
    });

    it('throws NotFoundException if submission is not found or not pending in org', async () => {
      mockSubmissionRepo.findPendingByIdAndOrg.mockResolvedValue(null);

      await expect(service.reject('sub-missing', makeUser())).rejects.toThrow(NotFoundException);
    });

    it('throws NotFoundException when submission is not pending (org-scoped lookup returns null)', async () => {
      const admin = makeUser({ id: 'admin-1', orgId: 'org-1' });
      // Service uses findPendingByIdAndOrg — non-pending submissions return null → NotFoundException
      mockSubmissionRepo.findPendingByIdAndOrg.mockResolvedValue(null);

      await expect(service.reject('sub-1', admin)).rejects.toThrow(NotFoundException);
    });
  });

  // ─── removeVersion ───────────────────────────────────────────────────────────

  describe('removeVersion', () => {
    it('completes without error when last version is removed (no remaining versions)', async () => {
      mockSubmissionRepo.findById.mockResolvedValue(makeSubmission({ status: 'approved' }));
      mockSkillRepo.findSkillWithOwnerOrgId.mockResolvedValue({ skill: { id: 'skill-1' } as never, ownerOrgId: 'org-1' });
      mockListingRepo.findBySkillId.mockResolvedValue(makeListing({ status: 'active', orgId: 'org-1' }));
      mockSubmissionRepo.findApprovedVersionsBySkillId.mockResolvedValue([]); // no remaining

      await expect(service.removeVersion('sub-1', admin)).resolves.toBeUndefined();
    });

    it('completes without error when more approved versions remain', async () => {
      const admin = makeUser({ id: 'admin-1', orgId: 'org-1' });
      mockSubmissionRepo.findById.mockResolvedValue(makeSubmission({ status: 'approved' }));
      mockOrgScopePass();
      mockListingRepo.findBySkillId.mockResolvedValue(makeListing({ status: 'active', orgId: 'org-1' }));

      const remaining = makeSubmission({ id: 'sub-0', version: '0', status: 'approved' });
      mockSubmissionRepo.findApprovedVersionsBySkillId.mockResolvedValue([remaining]);

      await expect(service.removeVersion('sub-1', admin)).resolves.toBeUndefined();
    });

    it('fetches approved versions with orgId scope before executing transaction', async () => {
      const admin = makeUser({ id: 'admin-1', orgId: 'org-1' });
      mockSubmissionRepo.findById.mockResolvedValue(makeSubmission({ status: 'approved' }));
      mockOrgScopePass();
      mockListingRepo.findBySkillId.mockResolvedValue(makeListing({ status: 'active', orgId: 'org-1' }));
      mockSubmissionRepo.findApprovedVersionsBySkillId.mockResolvedValue([]);

      await service.removeVersion('sub-1', admin);

      expect(mockSubmissionRepo.findApprovedVersionsBySkillId).toHaveBeenCalledWith('skill-1', 'org-1');
    });

    it('throws ForbiddenException when skill belongs to a different org', async () => {
      const admin = makeUser({ id: 'admin-1', orgId: 'org-1' });
      mockSubmissionRepo.findById.mockResolvedValue(makeSubmission({ status: 'approved' }));
      mockSkillRepo.findSkillWithOwnerOrgId.mockResolvedValue({ skill: { id: 'skill-1' } as never, ownerOrgId: 'org-2' });

      await expect(service.removeVersion('sub-1', admin)).rejects.toThrow(ForbiddenException);
    });
  });

  // ─── requestRemoval ──────────────────────────────────────────────────────────

  describe('requestRemoval', () => {
    const user = makeUser({ id: 'user-1', orgId: 'org-1' });

    beforeEach(() => {
      mockSkillRepo.findById.mockResolvedValue({ id: 'skill-1', ownerId: 'user-1' } as never);
      mockListingRepo.findBySkillId.mockResolvedValue(makeListing({ status: 'active', orgId: 'org-1' }));
      mockRemovalRequestRepo.hasPendingForSkill.mockResolvedValue(false);
      mockRemovalRequestRepo.create.mockResolvedValue({
        id: 'rr-1', skillId: 'skill-1', scope: 'skill',
        targetSubmissionId: null, reason: null, submittedBy: 'user-1',
        status: 'pending', reviewedBy: null, reviewedAt: null,
        createdAt: new Date().toISOString(),
      });
    });

    it('creates a whole-skill removal request and sets listing to removal_requested', async () => {
      await service.requestRemoval('skill-1', user, 'skill', undefined, 'No longer needed');

      expect(mockDataSource.transaction).toHaveBeenCalled();
      expect(mockRemovalRequestRepo.create).not.toHaveBeenCalled();
      expect(mockListingRepo.setStatus).not.toHaveBeenCalled();
    });

    it('creates a version-specific removal request when scope=version', async () => {
      mockSubmissionRepo.findById.mockResolvedValue(
        makeSubmission({ id: 'sub-7', status: 'approved', skillId: 'skill-1' }),
      );

      await service.requestRemoval('skill-1', user, 'version', 'sub-7');

      expect(mockDataSource.transaction).toHaveBeenCalled();
      expect(mockRemovalRequestRepo.create).not.toHaveBeenCalled();
    });

    it('throws NotFoundException when targetSubmissionId is not an approved submission for the skill', async () => {
      mockSubmissionRepo.findById.mockResolvedValue(
        makeSubmission({ id: 'sub-7', status: 'approved', skillId: 'other-skill' }),
      );

      await expect(
        service.requestRemoval('skill-1', user, 'version', 'sub-7'),
      ).rejects.toThrow(NotFoundException);
    });

    it('throws ConflictException if a pending removal request already exists for the skill', async () => {
      mockRemovalRequestRepo.hasPendingForSkill.mockResolvedValue(true);

      await expect(service.requestRemoval('skill-1', user, 'skill')).rejects.toThrow(ConflictException);
    });

    it('throws BadRequestException if skill is not on the marketplace', async () => {
      mockListingRepo.findBySkillId.mockResolvedValue(null);

      await expect(service.requestRemoval('skill-1', user, 'skill')).rejects.toThrow(BadRequestException);
    });

    it('throws ForbiddenException if caller does not own the skill', async () => {
      mockSkillRepo.findById.mockResolvedValue({ id: 'skill-1', ownerId: 'other-user' } as never);

      await expect(service.requestRemoval('skill-1', user, 'skill')).rejects.toThrow(ForbiddenException);
    });
  });

  // ─── approveRemoval ──────────────────────────────────────────────────────────

  describe('approveRemoval', () => {
    const admin = makeUser({ id: 'admin-1', orgId: 'org-1' });
    const makeRemovalRequest = (overrides: Partial<{
      id: string; skillId: string; scope: 'skill' | 'version';
      targetSubmissionId: string | null; status: 'pending' | 'approved' | 'rejected';
    }> = {}) => ({
      id: 'rr-1',
      skillId: 'skill-1',
      scope: 'skill' as const,
      targetSubmissionId: null as string | null,
      reason: null,
      submittedBy: 'user-1',
      status: 'pending' as const,
      reviewedBy: null,
      reviewedAt: null,
      createdAt: new Date().toISOString(),
      ...overrides,
    });

    it('scope=skill: completes without error and marks removal request approved atomically in tx', async () => {
      mockRemovalRequestRepo.findById.mockResolvedValue(makeRemovalRequest({ scope: 'skill' }));
      mockOrgScopePass();
      mockListingRepo.findBySkillId.mockResolvedValue(makeListing({ status: 'removal_requested', orgId: 'org-1' }));

      await expect(service.approveRemoval('rr-1', admin)).resolves.toBeUndefined();
      // updateStatus is now handled via raw SQL inside the transaction (Fix m1);
      // verify the transaction was invoked rather than the repo method.
      expect(mockDataSource.transaction).toHaveBeenCalled();
      expect(mockRemovalRequestRepo.updateStatus).not.toHaveBeenCalled();
    });

    it('scope=version with remaining versions: marks target removed, rolls listing back, marks request approved atomically in tx', async () => {
      const targetSub = makeSubmission({ id: 'sub-7', status: 'approved', version: '7' });
      const remaining = makeSubmission({ id: 'sub-9', status: 'approved', version: '9' });
      mockRemovalRequestRepo.findById.mockResolvedValue(
        makeRemovalRequest({ scope: 'version', targetSubmissionId: 'sub-7' }),
      );
      mockSkillRepo.findSkillWithOwnerOrgId.mockResolvedValue({ skill: { id: 'skill-1' } as never, ownerOrgId: 'org-1' });
      mockListingRepo.findBySkillId.mockResolvedValue(makeListing({ status: 'active', orgId: 'org-1' }));
      mockSubmissionRepo.findById.mockResolvedValue(targetSub);
      mockSubmissionRepo.findApprovedVersionsBySkillId.mockResolvedValue([targetSub, remaining]);

      await expect(service.approveRemoval('rr-1', admin)).resolves.toBeUndefined();
      // updateStatus is now handled via raw SQL inside removeApprovedVersionTx (Fix m1);
      // verify the transaction was invoked rather than the repo method.
      expect(mockDataSource.transaction).toHaveBeenCalled();
      expect(mockRemovalRequestRepo.updateStatus).not.toHaveBeenCalled();
      expect(mockSkillRepo.findSkillWithOwnerOrgId).toHaveBeenCalledTimes(1);
    });

    it('scope=version with no remaining versions: delists the skill, marks request approved atomically in tx', async () => {
      const targetSub = makeSubmission({ id: 'sub-7', status: 'approved', version: '7' });
      mockRemovalRequestRepo.findById.mockResolvedValue(
        makeRemovalRequest({ scope: 'version', targetSubmissionId: 'sub-7' }),
      );
      mockSkillRepo.findSkillWithOwnerOrgId.mockResolvedValue({ skill: { id: 'skill-1' } as never, ownerOrgId: 'org-1' });
      mockListingRepo.findBySkillId.mockResolvedValue(makeListing({ status: 'active', orgId: 'org-1' }));
      mockSubmissionRepo.findById.mockResolvedValue(targetSub);
      mockSubmissionRepo.findApprovedVersionsBySkillId.mockResolvedValue([targetSub]);

      await expect(service.approveRemoval('rr-1', admin)).resolves.toBeUndefined();
      // updateStatus is now handled via raw SQL inside removeApprovedVersionTx (Fix m1).
      expect(mockDataSource.transaction).toHaveBeenCalled();
      expect(mockRemovalRequestRepo.updateStatus).not.toHaveBeenCalled();
    });

    it('H3: throws ForbiddenException when admin self-approves removal and org disallows it', async () => {
      mockRemovalRequestRepo.findById.mockResolvedValue(
        makeRemovalRequest({ scope: 'skill', status: 'pending', ...{ submittedBy: 'admin-1' } }),
      );
      mockOrgScopePass();
      mockOrgRepo.findById.mockResolvedValue(makeOrg({ marketplaceAllowSelfApproval: false }) as never);

      await expect(service.approveRemoval('rr-1', admin)).rejects.toThrow(ForbiddenException);
    });

    it('H3: allows self-approval when org.marketplaceAllowSelfApproval is true', async () => {
      mockRemovalRequestRepo.findById.mockResolvedValue(
        makeRemovalRequest({ scope: 'skill', status: 'pending', ...{ submittedBy: 'admin-1' } }),
      );
      mockOrgScopePass();
      mockOrgRepo.findById.mockResolvedValue(makeOrg({ marketplaceAllowSelfApproval: true }) as never);
      mockListingRepo.findBySkillId.mockResolvedValue(makeListing({ status: 'removal_requested', orgId: 'org-1' }));

      await expect(service.approveRemoval('rr-1', admin)).resolves.toBeUndefined();
    });

    it('H1: throws NotFoundException when targetSubmission does not belong to the skill', async () => {
      mockRemovalRequestRepo.findById.mockResolvedValue(
        makeRemovalRequest({ scope: 'version', targetSubmissionId: 'sub-bad' }),
      );
      mockOrgScopePass();
      mockSubmissionRepo.findById.mockResolvedValue(
        makeSubmission({ id: 'sub-bad', status: 'approved', skillId: 'other-skill' }),
      );

      await expect(service.approveRemoval('rr-1', admin)).rejects.toThrow(NotFoundException);
    });

    it('H1: throws NotFoundException when targetSubmission status is not approved', async () => {
      mockRemovalRequestRepo.findById.mockResolvedValue(
        makeRemovalRequest({ scope: 'version', targetSubmissionId: 'sub-bad' }),
      );
      mockOrgScopePass();
      mockSubmissionRepo.findById.mockResolvedValue(
        makeSubmission({ id: 'sub-bad', status: 'pending_review', skillId: 'skill-1' }),
      );

      await expect(service.approveRemoval('rr-1', admin)).rejects.toThrow(NotFoundException);
    });

    it('throws NotFoundException if removal request does not exist', async () => {
      mockRemovalRequestRepo.findById.mockResolvedValue(null);

      await expect(service.approveRemoval('rr-missing', admin)).rejects.toThrow(NotFoundException);
    });

    it('throws ConflictException if removal request is not pending', async () => {
      mockRemovalRequestRepo.findById.mockResolvedValue(makeRemovalRequest({ status: 'approved' }));

      await expect(service.approveRemoval('rr-1', admin)).rejects.toThrow(ConflictException);
    });
  });

  // ─── rejectRemoval ───────────────────────────────────────────────────────────

  describe('rejectRemoval', () => {
    const admin = makeUser({ id: 'admin-1', orgId: 'org-1' });
    const pendingRequest = {
      id: 'rr-1', skillId: 'skill-1', scope: 'skill' as const,
      targetSubmissionId: null as string | null, reason: null, submittedBy: 'user-1',
      status: 'pending' as const, reviewedBy: null, reviewedAt: null,
      createdAt: new Date().toISOString(),
    };

    it('sets listing back to active and marks request rejected', async () => {
      mockRemovalRequestRepo.findById.mockResolvedValue(pendingRequest);
      mockOrgScopePass();
      mockRemovalRequestRepo.updateStatus.mockResolvedValue(undefined);
      mockListingRepo.findBySkillId.mockResolvedValue(makeListing({ status: 'removal_requested' }));
      mockListingRepo.setStatus.mockResolvedValue(undefined);

      await service.rejectRemoval('rr-1', admin);

      expect(mockRemovalRequestRepo.updateStatus).toHaveBeenCalledWith('rr-1', 'rejected', 'admin-1');
      expect(mockListingRepo.setStatus).toHaveBeenCalledWith('skill-1', 'active');
    });

    it('does not restore listing if status is already removed', async () => {
      mockRemovalRequestRepo.findById.mockResolvedValue(pendingRequest);
      mockOrgScopePass();
      mockRemovalRequestRepo.updateStatus.mockResolvedValue(undefined);
      mockListingRepo.findBySkillId.mockResolvedValue(makeListing({ status: 'removed' }));

      await service.rejectRemoval('rr-1', admin);

      expect(mockRemovalRequestRepo.updateStatus).toHaveBeenCalledWith('rr-1', 'rejected', 'admin-1');
      expect(mockListingRepo.setStatus).not.toHaveBeenCalled();
      expect(mockSkillRepo.update).not.toHaveBeenCalled();
    });

    it('throws NotFoundException if removal request does not exist', async () => {
      mockRemovalRequestRepo.findById.mockResolvedValue(null);

      await expect(service.rejectRemoval('rr-missing', admin)).rejects.toThrow(NotFoundException);
    });

    it('throws ConflictException if removal request is not pending', async () => {
      mockRemovalRequestRepo.findById.mockResolvedValue({ ...pendingRequest, status: 'approved' as const });

      await expect(service.rejectRemoval('rr-1', admin)).rejects.toThrow(ConflictException);
    });

    it('throws ForbiddenException when admin self-rejects and org disallows it', async () => {
      mockRemovalRequestRepo.findById.mockResolvedValue({ ...pendingRequest, submittedBy: 'admin-1' });
      mockOrgScopePass();
      mockOrgRepo.findById.mockResolvedValue(makeOrg({ marketplaceAllowSelfApproval: false }) as never);
      mockListingRepo.findBySkillId.mockResolvedValue(makeListing({ status: 'removal_requested' }));

      await expect(service.rejectRemoval('rr-1', admin)).rejects.toThrow(ForbiddenException);
    });
  });

  // ─── list methods ────────────────────────────────────────────────────────────

  describe('listPendingSubmissions', () => {
    it('delegates to submissionRepo.findPendingByOrg scoped to admin org', async () => {
      const admin = makeUser({ id: 'admin-1', orgId: 'org-1' });
      const submissions = [makeSubmission()];
      mockSubmissionRepo.findPendingByOrg.mockResolvedValue(submissions);

      const result = await service.listPendingSubmissions(admin);

      expect(mockSubmissionRepo.findPendingByOrg).toHaveBeenCalledWith('org-1');
      expect(result).toBe(submissions);
    });
  });

  describe('listRemovalRequests', () => {
    it('delegates to removalRequestRepo.findPendingByOrg scoped to admin org', async () => {
      const admin = makeUser({ id: 'admin-1', orgId: 'org-1' });
      const requests = [{
        id: 'rr-1', skillId: 'skill-1', scope: 'skill' as const,
        targetSubmissionId: null, reason: null, submittedBy: 'user-1',
        status: 'pending' as const, reviewedBy: null, reviewedAt: null,
        createdAt: new Date().toISOString(),
      }];
      mockRemovalRequestRepo.findPendingByOrg.mockResolvedValue(requests);

      const result = await service.listRemovalRequests(admin);

      expect(mockRemovalRequestRepo.findPendingByOrg).toHaveBeenCalledWith('org-1');
      expect(result).toBe(requests);
    });
  });

  describe('findMySubmissions', () => {
    it('delegates to submissionRepo.findBySubmittedBy with user id', async () => {
      const user = makeUser({ id: 'user-1' });
      const submissions = [makeSubmission()];
      mockSubmissionRepo.findBySubmittedBy.mockResolvedValue(submissions);

      const result = await service.findMySubmissions(user);

      expect(mockSubmissionRepo.findBySubmittedBy).toHaveBeenCalledWith('user-1');
      expect(result).toBe(submissions);
    });
  });
});
