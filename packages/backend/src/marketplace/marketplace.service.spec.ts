import { ForbiddenException, NotFoundException } from '@nestjs/common';
import { CACHE_MANAGER } from '@nestjs/cache-manager';
import { Test, TestingModule } from '@nestjs/testing';
import {
  MARKETPLACE_LISTING_REPOSITORY,
  MARKETPLACE_SUBMISSION_REPOSITORY,
  SKILL_DOWNLOAD_EVENT_REPOSITORY,
  SKILL_FAVORITE_REPOSITORY,
  SKILL_REPOSITORY,
  SKILL_UPVOTE_REPOSITORY,
  USER_REPOSITORY,
  type IMarketplaceListingRepository,
  type IMarketplaceSubmissionRepository,
  type ISkillDownloadEventRepository,
  type ISkillFavoriteRepository,
  type ISkillRepository,
  type ISkillUpvoteRepository,
  type IUserRepository,
  type MarketplaceListing,
  type MarketplaceListItem,
  type MarketplaceSubmission,
  type SkillFavoriteItem,
  type User,
} from '@skillspell/shared';
import { MarketplaceService } from './marketplace.service.js';

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
  snapshotName: 'Test Skill',
  snapshotDescription: null,
  snapshotCategories: [],
  requirementsMet: null,
  ...overrides,
});

const makeListing = (overrides: Partial<MarketplaceListing> = {}): MarketplaceListing => ({
  id: 'listing-1',
  skillId: 'skill-1',
  orgId: 'org-1',
  submissionId: 'sub-1',
  snapshotName: 'Test Skill',
  snapshotDescription: 'A test skill',
  snapshotCategories: ['testing'],
  snapshotVersion: 1,
  status: 'active',
  removalReason: null,
  removedBy: null,
  removalType: null,
  firstApprovedAt: new Date().toISOString(),
  lastApprovedAt: new Date().toISOString(),
  ...overrides,
});

const makeUser = (overrides: Partial<User> = {}): User => ({
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
} as unknown as User);

describe('MarketplaceService', () => {
  let service: MarketplaceService;

  const mockListingRepo: jest.Mocked<IMarketplaceListingRepository> = {
    upsert: jest.fn(),
    findBySkillId: jest.fn(),
    findActiveByOrgId: jest.fn(),
    setStatus: jest.fn(),
  };

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

  const mockDlEventRepo: jest.Mocked<ISkillDownloadEventRepository> = {
    create: jest.fn(),
    findBySkillId: jest.fn(),
    findBySkillIdAndVersion: jest.fn(),
    countBySkillIdGroupedByVersion: jest.fn(),
  };

  const mockUserRepo: jest.Mocked<IUserRepository> = {
    create: jest.fn(),
    findById: jest.fn(),
    findByEmail: jest.fn(),
    findAll: jest.fn(),
    update: jest.fn(),
    deactivate: jest.fn(),
  };

  const mockUpvoteRepo: jest.Mocked<ISkillUpvoteRepository> = {
    toggle: jest.fn(),
    countBySkillId: jest.fn(),
    findSkillIdsByUser: jest.fn(),
  };

  const mockFavoriteRepo: jest.Mocked<ISkillFavoriteRepository> = {
    toggle: jest.fn(),
    findByUser: jest.fn(),
    countByUser: jest.fn(),
    countActiveByUser: jest.fn(),
    findSkillIdsByUser: jest.fn(),
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

  beforeEach(async () => {
    jest.clearAllMocks();

    // Default mock return values for methods used by multiple describe blocks
    mockUpvoteRepo.findSkillIdsByUser.mockResolvedValue([]);
    mockUpvoteRepo.countBySkillId.mockResolvedValue(0);
    mockFavoriteRepo.findSkillIdsByUser.mockResolvedValue([]);
    mockFavoriteRepo.countActiveByUser.mockResolvedValue(0);
    mockSubmissionRepo.findById.mockResolvedValue(null);
    mockUserRepo.findById.mockResolvedValue(null);

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        MarketplaceService,
        { provide: MARKETPLACE_SUBMISSION_REPOSITORY, useValue: mockSubmissionRepo },
        { provide: MARKETPLACE_LISTING_REPOSITORY, useValue: mockListingRepo },
        { provide: SKILL_DOWNLOAD_EVENT_REPOSITORY, useValue: mockDlEventRepo },
        { provide: SKILL_REPOSITORY, useValue: mockSkillRepo },
        { provide: USER_REPOSITORY, useValue: mockUserRepo },
        { provide: SKILL_UPVOTE_REPOSITORY, useValue: mockUpvoteRepo },
        { provide: SKILL_FAVORITE_REPOSITORY, useValue: mockFavoriteRepo },
        { provide: CACHE_MANAGER, useValue: { get: jest.fn().mockResolvedValue(null), set: jest.fn().mockResolvedValue(undefined), del: jest.fn().mockResolvedValue(undefined) } },
      ],
    }).compile();

    service = module.get<MarketplaceService>(MarketplaceService);
  });

  describe('findBySubmittedBy (SC-2)', () => {
    it('should return all submissions for the authenticated user enriched with skillName', async () => {
      const user = makeUser({ id: 'user-1' });
      const submissions = [makeSubmission({ skillId: 'skill-1' })];
      mockSubmissionRepo.findBySubmittedBy.mockResolvedValue(submissions);
      mockSkillRepo.findById.mockResolvedValue({ id: 'skill-1', name: 'My Test Skill' } as never);

      const result = await service.findBySubmittedBy(user);

      expect(mockSubmissionRepo.findBySubmittedBy).toHaveBeenCalledWith('user-1');
      expect(result).toHaveLength(1);
      expect(result[0]).toMatchObject({ ...submissions[0], skillName: 'My Test Skill' });
    });

    it('should return empty array when no submissions exist', async () => {
      const user = makeUser({ id: 'user-1' });
      mockSubmissionRepo.findBySubmittedBy.mockResolvedValue([]);

      const result = await service.findBySubmittedBy(user);

      expect(result).toEqual([]);
      expect(mockSkillRepo.findById).not.toHaveBeenCalled();
    });

    it('should fall back to Unknown Skill when skill is deleted', async () => {
      const user = makeUser({ id: 'user-1' });
      const submissions = [makeSubmission({ skillId: 'deleted-skill' })];
      mockSubmissionRepo.findBySubmittedBy.mockResolvedValue(submissions);
      mockSkillRepo.findById.mockResolvedValue(null);

      const result = await service.findBySubmittedBy(user);

      expect(result[0].skillName).toBe('Unknown Skill');
    });
  });

  describe('findApproved (SC-3)', () => {
    it('should delegate to listingRepo.findActiveByOrgId with the caller orgId from JWT', async () => {
      const listing = makeListing();
      mockListingRepo.findActiveByOrgId.mockResolvedValue({ items: [listing as any], total: 1 });

      const result = await service.findApproved('org-1', { search: undefined, categories: undefined, sort: 'popular', page: 1, limit: 30 });

      expect(mockListingRepo.findActiveByOrgId).toHaveBeenCalledWith('org-1', expect.any(Object));
      expect(result).toEqual({ items: [listing], total: 1 });
      expect(mockSubmissionRepo.findApprovedByOrg).not.toHaveBeenCalled();
    });

    it('should pass search, categories, limit, page (as offset) from query to listingRepo', async () => {
      mockListingRepo.findActiveByOrgId.mockResolvedValue({ items: [], total: 0 });

      await service.findApproved('org-1', {
        search: 'auth',
        categories: ['security'],
        limit: 10,
        page: 2,
      });

      expect(mockListingRepo.findActiveByOrgId).toHaveBeenCalledWith('org-1', {
        search: 'auth',
        categories: ['security'],
        sort: 'popular',
        limit: 10,
        offset: 10,
        userId: undefined,
      });
    });

    it('should never accept orgId from request body', async () => {
      // Service signature requires orgId as separate param — not from query/body
      // Verify orgId passed to repo comes from parameter, not from query object
      mockListingRepo.findActiveByOrgId.mockResolvedValue({ items: [], total: 0 });

      await service.findApproved('org-from-jwt', { search: undefined, categories: undefined });

      const [calledOrgId] = mockListingRepo.findActiveByOrgId.mock.calls[0];
      expect(calledOrgId).toBe('org-from-jwt');
    });
  });

  describe('recordDownloadEvent (SC-4 / D-05)', () => {
    it('should call dlEventRepo.create with correct skillId and version', async () => {
      mockDlEventRepo.create.mockResolvedValue({} as never);

      await service.recordDownloadEvent('skill-1', '1');

      expect(mockDlEventRepo.create).toHaveBeenCalledWith({
        skillId: 'skill-1',
        version: '1',
      });
    });
  });

  describe('listVersions', () => {
    it('should return approved versions with download counts after passing org scope check', async () => {
      mockListingRepo.findBySkillId.mockResolvedValue(makeListing({ status: 'active', orgId: 'org-1' }));
      const versions = [makeSubmission({ status: 'approved', version: '1' })];
      mockSubmissionRepo.findApprovedVersionsBySkillId.mockResolvedValue(versions);
      mockDlEventRepo.countBySkillIdGroupedByVersion.mockResolvedValue(new Map([['1', 5]]));

      const result = await service.listVersions('skill-1', 'org-1');

      expect(mockSubmissionRepo.findApprovedVersionsBySkillId).toHaveBeenCalledWith('skill-1');
      expect(result).toHaveLength(1);
      expect(result[0]).toMatchObject({ ...versions[0], downloadCount: 5 });
    });

    it('should throw NotFoundException when skill is not found in marketplace', async () => {
      mockListingRepo.findBySkillId.mockResolvedValue(null);

      await expect(service.listVersions('skill-1', 'org-1')).rejects.toThrow(NotFoundException);
      expect(mockSubmissionRepo.findApprovedVersionsBySkillId).not.toHaveBeenCalled();
    });

    it('should throw NotFoundException when listing belongs to a different org', async () => {
      mockListingRepo.findBySkillId.mockResolvedValue(makeListing({ status: 'active', orgId: 'org-2' }));

      await expect(service.listVersions('skill-1', 'org-1')).rejects.toThrow(NotFoundException);
      expect(mockSubmissionRepo.findApprovedVersionsBySkillId).not.toHaveBeenCalled();
    });
  });

  describe('validateVersionDownload', () => {
    it('should succeed when approved version exists', async () => {
      mockSkillRepo.findSkillWithOwnerOrgId.mockResolvedValue({ skill: { id: 'skill-1' } as never, ownerOrgId: 'org-1' });
      mockSubmissionRepo.findApprovedVersionBySkillAndVersion.mockResolvedValue(
        makeSubmission({ status: 'approved', version: '2' }),
      );

      await expect(service.validateVersionDownload('skill-1', '2', 'org-1')).resolves.toBeUndefined();
      expect(mockSubmissionRepo.findApprovedVersionBySkillAndVersion).toHaveBeenCalledWith('skill-1', '2');
    });

    it('should throw NotFoundException when version is not found', async () => {
      mockSkillRepo.findSkillWithOwnerOrgId.mockResolvedValue({ skill: { id: 'skill-1' } as never, ownerOrgId: 'org-1' });
      mockSubmissionRepo.findApprovedVersionBySkillAndVersion.mockResolvedValue(null);

      await expect(service.validateVersionDownload('skill-1', '99', 'org-1')).rejects.toThrow(
        NotFoundException,
      );
    });

    it('should throw ForbiddenException before querying versions when org check fails', async () => {
      mockSkillRepo.findSkillWithOwnerOrgId.mockResolvedValue({ skill: { id: 'skill-1' } as never, ownerOrgId: 'org-2' });

      await expect(service.validateVersionDownload('skill-1', '1', 'org-1')).rejects.toThrow(
        ForbiddenException,
      );
      expect(mockSubmissionRepo.findApprovedVersionBySkillAndVersion).not.toHaveBeenCalled();
    });
  });

  // Helper: mock the org-scope check path for approve/reject/remove
  // assertSkillBelongsToOrg now calls skillRepo.findSkillWithOwnerOrgId (single JOIN)
  const mockOrgScopePass = (orgId = 'org-1') => {
    mockSkillRepo.findSkillWithOwnerOrgId.mockResolvedValue({ skill: { id: 'skill-1' } as never, ownerOrgId: orgId });
  };

  describe('listPendingSubmissions (SC-1 enrichment)', () => {
    it('returns enriched pending submissions with skillName and submitterName from JOIN', async () => {
      const admin = makeUser({ id: 'admin-1', orgId: 'org-1', role: 'admin' });
      // findPendingByOrg now performs a JOIN — skillName and submitterName come from repo
      const submissions = [
        { ...makeSubmission({ skillId: 'skill-1', submittedBy: 'user-1' }), skillName: 'Test Skill', submitterName: 'Jane Doe' },
      ];
      mockSubmissionRepo.findPendingByOrg.mockResolvedValue(submissions as any);

      const result = await service.listPendingSubmissions(admin);

      expect(mockSubmissionRepo.findPendingByOrg).toHaveBeenCalledWith('org-1');
      expect(result).toHaveLength(1);
      expect(result[0]).toHaveProperty('skillName', 'Test Skill');
      expect(result[0]).toHaveProperty('submitterName', 'Jane Doe');
      // No extra DB lookups needed — repo handles enrichment via JOIN
      expect(mockSkillRepo.findById).not.toHaveBeenCalled();
      expect(mockUserRepo.findById).not.toHaveBeenCalled();
    });

    it('returns empty array when no pending submissions exist', async () => {
      const admin = makeUser({ id: 'admin-1', orgId: 'org-1', role: 'admin' });
      mockSubmissionRepo.findPendingByOrg.mockResolvedValue([]);

      const result = await service.listPendingSubmissions(admin);

      expect(result).toEqual([]);
      expect(mockSkillRepo.findById).not.toHaveBeenCalled();
    });

    it('falls back to Unknown Skill when skillName is null on joined row', async () => {
      const admin = makeUser({ id: 'admin-1', orgId: 'org-1', role: 'admin' });
      // skillName null means the JOIN returned no matching skill (deleted)
      const submissions = [
        { ...makeSubmission({ skillId: 'deleted-skill' }), skillName: null, submitterName: null },
      ];
      mockSubmissionRepo.findPendingByOrg.mockResolvedValue(submissions as any);

      const result = await service.listPendingSubmissions(admin);

      expect(result[0]).toHaveProperty('skillName', 'Unknown Skill');
    });
  });

  describe('findApprovedSkillDetail', () => {
    const makeSnapshot = () => ({
      skillContent: '# Skill content',
      description: 'snap desc',
      scripts: [{ name: 'run.sh', content: 'echo hi' }],
      references: [],
      assets: [],
    });

    it('returns assembled DTO when listing is active and org matches', async () => {
      const listing = makeListing({ status: 'active', orgId: 'org-1', snapshotVersion: 3 });
      mockListingRepo.findBySkillId.mockResolvedValue(listing);
      mockSkillRepo.getVersionSnapshot.mockResolvedValue(makeSnapshot() as any);

      const result = await service.findApprovedSkillDetail('skill-1', 'org-1', 'user-1');

      expect(result).not.toBeNull();
      expect(result!.version).toBe('3');
      expect(result!.name).toBe(listing.snapshotName);
      expect(result!.description).toBe(listing.snapshotDescription);
      expect(result!.categories).toEqual(listing.snapshotCategories);
      expect(result!.skillContent).toBe('# Skill content');
      expect(result!.scripts).toHaveLength(1);
    });

    it('returns null when listing does not exist', async () => {
      mockListingRepo.findBySkillId.mockResolvedValue(null);

      const result = await service.findApprovedSkillDetail('skill-1', 'org-1', 'user-1');

      expect(result).toBeNull();
      expect(mockSkillRepo.getVersionSnapshot).not.toHaveBeenCalled();
    });

    it('returns null when listing status is not active', async () => {
      mockListingRepo.findBySkillId.mockResolvedValue(makeListing({ status: 'removed', orgId: 'org-1' }));

      const result = await service.findApprovedSkillDetail('skill-1', 'org-1', 'user-1');

      expect(result).toBeNull();
      expect(mockSkillRepo.getVersionSnapshot).not.toHaveBeenCalled();
    });

    it('returns null when listing belongs to a different org (org-scope guard)', async () => {
      mockListingRepo.findBySkillId.mockResolvedValue(makeListing({ status: 'active', orgId: 'org-2' }));

      const result = await service.findApprovedSkillDetail('skill-1', 'org-1', 'user-1');

      expect(result).toBeNull();
      expect(mockSkillRepo.getVersionSnapshot).not.toHaveBeenCalled();
    });

    it('returns null when version snapshot does not exist', async () => {
      mockListingRepo.findBySkillId.mockResolvedValue(makeListing({ status: 'active', orgId: 'org-1' }));
      mockSkillRepo.getVersionSnapshot.mockResolvedValue(null);

      const result = await service.findApprovedSkillDetail('skill-1', 'org-1', 'user-1');

      expect(result).toBeNull();
    });

    it('uses empty string for description when snapshotDescription is null', async () => {
      const listing = makeListing({ status: 'active', orgId: 'org-1', snapshotDescription: null });
      mockListingRepo.findBySkillId.mockResolvedValue(listing);
      mockSkillRepo.getVersionSnapshot.mockResolvedValue(makeSnapshot() as any);

      const result = await service.findApprovedSkillDetail('skill-1', 'org-1', 'user-1');

      expect(result!.description).toBe('');
    });

    it('looks up snapshot using listing.snapshotVersion', async () => {
      const listing = makeListing({ status: 'active', orgId: 'org-1', snapshotVersion: 7 });
      mockListingRepo.findBySkillId.mockResolvedValue(listing);
      mockSkillRepo.getVersionSnapshot.mockResolvedValue(makeSnapshot() as any);

      await service.findApprovedSkillDetail('skill-1', 'org-1', 'user-1');

      expect(mockSkillRepo.getVersionSnapshot).toHaveBeenCalledWith('skill-1', 7);
    });
  });

  describe('listApprovedSubmissions', () => {
    it('returns items and total from parallel repo calls', async () => {
      const items = [{ skillId: 'skill-1', name: 'Skill 1' }] as any;
      mockSubmissionRepo.findApprovedByOrg.mockResolvedValue(items);
      mockSubmissionRepo.findApprovedCountByOrg.mockResolvedValue(42);
      const admin = makeUser({ orgId: 'org-1', role: 'admin' });

      const result = await service.listApprovedSubmissions(admin);

      expect(result).toEqual({ items, total: 42 });
      expect(mockSubmissionRepo.findApprovedByOrg).toHaveBeenCalledWith('org-1', { limit: 100, offset: 0 });
      expect(mockSubmissionRepo.findApprovedCountByOrg).toHaveBeenCalledWith('org-1', {});
    });

    it('passes custom limit and offset to repo', async () => {
      mockSubmissionRepo.findApprovedByOrg.mockResolvedValue([]);
      mockSubmissionRepo.findApprovedCountByOrg.mockResolvedValue(0);
      const admin = makeUser({ orgId: 'org-1', role: 'admin' });

      await service.listApprovedSubmissions(admin, 25, 50);

      expect(mockSubmissionRepo.findApprovedByOrg).toHaveBeenCalledWith('org-1', { limit: 25, offset: 50 });
    });

    it('returns empty items and zero total when no approved submissions exist', async () => {
      mockSubmissionRepo.findApprovedByOrg.mockResolvedValue([]);
      mockSubmissionRepo.findApprovedCountByOrg.mockResolvedValue(0);
      const admin = makeUser({ orgId: 'org-1', role: 'admin' });

      const result = await service.listApprovedSubmissions(admin);

      expect(result).toEqual({ items: [], total: 0 });
    });

    it('scopes to admin orgId not caller id', async () => {
      mockSubmissionRepo.findApprovedByOrg.mockResolvedValue([]);
      mockSubmissionRepo.findApprovedCountByOrg.mockResolvedValue(0);
      const admin = makeUser({ id: 'admin-99', orgId: 'org-5', role: 'admin' });

      await service.listApprovedSubmissions(admin);

      const [calledOrgId] = mockSubmissionRepo.findApprovedByOrg.mock.calls[0];
      expect(calledOrgId).toBe('org-5');
    });
  });

  describe('getSubmissionPreview', () => {
    const makeSnapshot = () => ({
      skillContent: '# Content',
      description: 'snap desc',
      scripts: [],
      references: [],
      assets: [],
    });

    const makeSubmitter = (overrides: Partial<User> = {}) =>
      makeUser({ id: 'submitter-1', firstName: 'Jane', lastName: 'Doe', ...overrides });

    it('returns assembled preview with submitterName from firstName + lastName', async () => {
      const submission = makeSubmission({ submittedBy: 'submitter-1', version: '2', skillId: 'skill-1' });
      mockSubmissionRepo.findPendingByIdAndOrg.mockResolvedValue(submission);
      mockSkillRepo.findById.mockResolvedValue({ id: 'skill-1', name: 'My Skill' } as any);
      mockUserRepo.findById.mockResolvedValue(makeSubmitter() as any);
      mockSkillRepo.getVersionSnapshot.mockResolvedValue(makeSnapshot() as any);

      const result = await service.getSubmissionPreview('sub-1', 'org-1');

      expect(result.skillName).toBe('My Skill');
      expect(result.submitterName).toBe('Jane Doe');
      expect(result.skillContent).toBe('# Content');
      expect(result.scripts).toEqual([]);
    });

    it('throws NotFoundException when submission not found', async () => {
      mockSubmissionRepo.findPendingByIdAndOrg.mockResolvedValue(null);

      await expect(service.getSubmissionPreview('sub-1', 'org-1')).rejects.toThrow(NotFoundException);
      expect(mockSkillRepo.findById).not.toHaveBeenCalled();
    });

    it('throws NotFoundException when skill does not exist', async () => {
      mockSubmissionRepo.findPendingByIdAndOrg.mockResolvedValue(makeSubmission({ version: '1' }));
      mockSkillRepo.findById.mockResolvedValue(null);
      mockUserRepo.findById.mockResolvedValue(makeSubmitter() as any);
      mockSkillRepo.getVersionSnapshot.mockResolvedValue(makeSnapshot() as any);

      await expect(service.getSubmissionPreview('sub-1', 'org-1')).rejects.toThrow(NotFoundException);
    });

    it('throws NotFoundException when version snapshot does not exist', async () => {
      mockSubmissionRepo.findPendingByIdAndOrg.mockResolvedValue(makeSubmission({ version: '1' }));
      mockSkillRepo.findById.mockResolvedValue({ id: 'skill-1', name: 'Skill' } as any);
      mockUserRepo.findById.mockResolvedValue(makeSubmitter() as any);
      mockSkillRepo.getVersionSnapshot.mockResolvedValue(null);

      await expect(service.getSubmissionPreview('sub-1', 'org-1')).rejects.toThrow(NotFoundException);
    });

    it('throws NotFoundException when version is NaN (skips snapshot lookup)', async () => {
      mockSubmissionRepo.findPendingByIdAndOrg.mockResolvedValue(makeSubmission({ version: 'bad' }));
      mockSkillRepo.findById.mockResolvedValue({ id: 'skill-1', name: 'Skill' } as any);
      mockUserRepo.findById.mockResolvedValue(makeSubmitter() as any);

      await expect(service.getSubmissionPreview('sub-1', 'org-1')).rejects.toThrow(NotFoundException);
      expect(mockSkillRepo.getVersionSnapshot).not.toHaveBeenCalled();
    });

    it('falls back to submittedBy when submitter user record not found', async () => {
      mockSubmissionRepo.findPendingByIdAndOrg.mockResolvedValue(
        makeSubmission({ version: '1', submittedBy: 'user-ghost@example.com' }),
      );
      mockSkillRepo.findById.mockResolvedValue({ id: 'skill-1', name: 'Skill' } as any);
      mockUserRepo.findById.mockResolvedValue(null);
      mockSkillRepo.getVersionSnapshot.mockResolvedValue(makeSnapshot() as any);

      const result = await service.getSubmissionPreview('sub-1', 'org-1');

      expect(result.submitterName).toBe('user-ghost@example.com');
    });

    it('uses org-scoped findPendingByIdAndOrg (not global findById)', async () => {
      mockSubmissionRepo.findPendingByIdAndOrg.mockResolvedValue(null);

      await expect(service.getSubmissionPreview('sub-1', 'org-1')).rejects.toThrow(NotFoundException);

      expect(mockSubmissionRepo.findPendingByIdAndOrg).toHaveBeenCalledWith('sub-1', 'org-1');
      expect(mockSubmissionRepo.findById).not.toHaveBeenCalled();
    });

    it('trims submitterName when firstName or lastName has extra whitespace', async () => {
      mockSubmissionRepo.findPendingByIdAndOrg.mockResolvedValue(makeSubmission({ version: '1' }));
      mockSkillRepo.findById.mockResolvedValue({ id: 'skill-1', name: 'Skill' } as any);
      mockUserRepo.findById.mockResolvedValue(
        makeUser({ firstName: 'Jane', lastName: '' }) as any,
      );
      mockSkillRepo.getVersionSnapshot.mockResolvedValue(makeSnapshot() as any);

      const result = await service.getSubmissionPreview('sub-1', 'org-1');

      expect(result.submitterName).toBe('Jane');
    });
  });

  describe('toggleUpvote', () => {
    it('throws NotFoundException when listing not found', async () => {
      mockListingRepo.findBySkillId.mockResolvedValue(null);
      const user = makeUser({ orgId: 'org-1' });

      await expect(service.toggleUpvote('skill-1', user)).rejects.toThrow(NotFoundException);
      expect(mockUpvoteRepo.toggle).not.toHaveBeenCalled();
    });

    it('throws NotFoundException when listing orgId does not match user orgId', async () => {
      mockListingRepo.findBySkillId.mockResolvedValue(makeListing({ status: 'active', orgId: 'org-2' }));
      const user = makeUser({ orgId: 'org-1' });

      await expect(service.toggleUpvote('skill-1', user)).rejects.toThrow(NotFoundException);
      expect(mockUpvoteRepo.toggle).not.toHaveBeenCalled();
    });

    it('returns upvoteCount and isUpvoted when listing is valid', async () => {
      mockListingRepo.findBySkillId.mockResolvedValue(makeListing({ status: 'active', orgId: 'org-1' }));
      mockUpvoteRepo.toggle.mockResolvedValue(true);
      mockUpvoteRepo.countBySkillId.mockResolvedValue(5);
      const user = makeUser({ id: 'user-1', orgId: 'org-1' });

      const result = await service.toggleUpvote('skill-1', user);

      expect(mockUpvoteRepo.toggle).toHaveBeenCalledWith('skill-1', 'user-1');
      expect(mockUpvoteRepo.countBySkillId).toHaveBeenCalledWith('skill-1');
      expect(result).toEqual({ upvoteCount: 5, isUpvoted: true });
    });

    it('returns isUpvoted false when toggling off', async () => {
      mockListingRepo.findBySkillId.mockResolvedValue(makeListing({ status: 'active', orgId: 'org-1' }));
      mockUpvoteRepo.toggle.mockResolvedValue(false);
      mockUpvoteRepo.countBySkillId.mockResolvedValue(3);
      const user = makeUser({ id: 'user-1', orgId: 'org-1' });

      const result = await service.toggleUpvote('skill-1', user);

      expect(result).toEqual({ upvoteCount: 3, isUpvoted: false });
    });
  });

  describe('toggleFavorite', () => {
    it('throws NotFoundException when listing is removed (not active)', async () => {
      mockListingRepo.findBySkillId.mockResolvedValue(makeListing({ status: 'removed', orgId: 'org-1' }));
      const user = makeUser({ orgId: 'org-1' });

      await expect(service.toggleFavorite('skill-1', user)).rejects.toThrow(NotFoundException);
      expect(mockFavoriteRepo.toggle).not.toHaveBeenCalled();
    });

    it('returns isFavorited from repo when listing is active', async () => {
      mockListingRepo.findBySkillId.mockResolvedValue(makeListing({ status: 'active', orgId: 'org-1' }));
      mockFavoriteRepo.toggle.mockResolvedValue(true);
      const user = makeUser({ id: 'user-1', orgId: 'org-1' });

      const result = await service.toggleFavorite('skill-1', user);

      expect(mockFavoriteRepo.toggle).toHaveBeenCalledWith('skill-1', 'user-1');
      expect(result).toEqual({ isFavorited: true });
    });

    it('throws NotFoundException when listing belongs to a different org', async () => {
      mockListingRepo.findBySkillId.mockResolvedValue(makeListing({ status: 'active', orgId: 'org-99' }));
      const user = makeUser({ orgId: 'org-1' });

      await expect(service.toggleFavorite('skill-1', user)).rejects.toThrow(NotFoundException);
    });
  });

  describe('getFavorites', () => {
    const makeListItem = (skillId: string): MarketplaceListItem => ({
      skillId,
      name: `Skill ${skillId}`,
      status: 'approved',
      submittedAt: new Date().toISOString(),
    } as unknown as MarketplaceListItem);

    const makeFavoriteItem = (skillId: string): SkillFavoriteItem => ({
      skillId,
      createdAt: new Date().toISOString(),
    });

    it('returns empty when user has no favorites', async () => {
      mockFavoriteRepo.findByUser.mockResolvedValue([]);
      mockFavoriteRepo.countActiveByUser.mockResolvedValue(0);
      const user = makeUser({ id: 'user-1', orgId: 'org-1' });

      const result = await service.getFavorites(user, {});

      expect(result).toEqual({ items: [], total: 0 });
      expect(mockListingRepo.findActiveByOrgId).not.toHaveBeenCalled();
    });

    it('preserves favorite order (most recently favorited first)', async () => {
      const favorites: SkillFavoriteItem[] = [
        makeFavoriteItem('skill-c'),
        makeFavoriteItem('skill-a'),
        makeFavoriteItem('skill-b'),
      ];
      mockFavoriteRepo.findByUser.mockResolvedValue(favorites);
      mockFavoriteRepo.countActiveByUser.mockResolvedValue(3);

      // Listing repo returns items in a different order
      mockListingRepo.findActiveByOrgId.mockResolvedValue({
        items: [makeListItem('skill-a'), makeListItem('skill-b'), makeListItem('skill-c')],
        total: 3,
      });

      const user = makeUser({ id: 'user-1', orgId: 'org-1' });
      const result = await service.getFavorites(user, {});

      expect(result.items.map(i => i.skillId)).toEqual(['skill-c', 'skill-a', 'skill-b']);
      expect(mockListingRepo.findActiveByOrgId).toHaveBeenCalledWith(
        'org-1',
        expect.objectContaining({
          skillIds: ['skill-c', 'skill-a', 'skill-b'],
        }),
      );
    });

    it('omits skills that no longer have active listings', async () => {
      const favorites: SkillFavoriteItem[] = [
        makeFavoriteItem('skill-removed'),
        makeFavoriteItem('skill-active'),
      ];
      mockFavoriteRepo.findByUser.mockResolvedValue(favorites);
      mockFavoriteRepo.countActiveByUser.mockResolvedValue(2);

      // Only skill-active is returned by listing repo (skill-removed was delisted)
      mockListingRepo.findActiveByOrgId.mockResolvedValue({
        items: [makeListItem('skill-active')],
        total: 1,
      });

      const user = makeUser({ id: 'user-1', orgId: 'org-1' });
      const result = await service.getFavorites(user, {});

      expect(result.items.map(i => i.skillId)).toEqual(['skill-active']);
      expect(result.total).toBe(2); // total reflects DB count, not filtered count
    });

    it('caps limit at 100', async () => {
      mockFavoriteRepo.findByUser.mockResolvedValue([makeFavoriteItem('skill-1')]);
      mockFavoriteRepo.countActiveByUser.mockResolvedValue(1);
      mockListingRepo.findActiveByOrgId.mockResolvedValue({ items: [makeListItem('skill-1')], total: 1 });

      const user = makeUser({ id: 'user-1', orgId: 'org-1' });
      await service.getFavorites(user, { limit: 200 });

      expect(mockFavoriteRepo.findByUser).toHaveBeenCalledWith('user-1', expect.objectContaining({ limit: 100 }));
    });
  });

  describe('removeFromMarketplace (SC-8)', () => {
    it('should call removeAllApprovedBySkillId and setStatus with reason', async () => {
      const admin = makeUser({ id: 'admin-1' });
      mockSubmissionRepo.removeAllApprovedBySkillId.mockResolvedValue(undefined);
      mockListingRepo.setStatus.mockResolvedValue(undefined);
      mockOrgScopePass();

      await service.removeFromMarketplace('skill-1', admin, 'Policy violation');

      expect(mockSubmissionRepo.removeAllApprovedBySkillId).toHaveBeenCalledWith('skill-1', 'admin-1');
      expect(mockListingRepo.setStatus).toHaveBeenCalledWith(
        'skill-1',
        'removed',
        expect.objectContaining({ removalType: 'admin_policy', removalReason: 'Policy violation' }),
      );
    });

    it('should use a single atomic call (no loop over individual rows)', async () => {
      const admin = makeUser({ id: 'admin-1' });
      mockSubmissionRepo.removeAllApprovedBySkillId.mockResolvedValue(undefined);
      mockListingRepo.setStatus.mockResolvedValue(undefined);
      mockOrgScopePass();

      await service.removeFromMarketplace('skill-1', admin, 'Policy violation');

      expect(mockSubmissionRepo.findBySkillId).not.toHaveBeenCalled();
      expect(mockSubmissionRepo.updateStatus).not.toHaveBeenCalled();
    });

    it('should throw ForbiddenException when skill belongs to a different org', async () => {
      const admin = makeUser({ id: 'admin-1', orgId: 'org-1' });
      mockSkillRepo.findSkillWithOwnerOrgId.mockResolvedValue({ skill: { id: 'skill-1' } as never, ownerOrgId: 'org-2' });

      await expect(service.removeFromMarketplace('skill-1', admin, 'Policy violation')).rejects.toThrow(ForbiddenException);
      expect(mockSubmissionRepo.removeAllApprovedBySkillId).not.toHaveBeenCalled();
    });
  });
});
