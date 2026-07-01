import { ClsService } from 'nestjs-cls';
import { RequestContext } from './request-context.service';
import type { Organization, User, UserRole, SkillSummary } from '@skillspell/shared';

describe('RequestContext', () => {
  let ctx: RequestContext;
  let clsService: jest.Mocked<ClsService>;

  beforeEach(() => {
    clsService = {
      get: jest.fn(),
      set: jest.fn(),
    } as unknown as jest.Mocked<ClsService>;

    ctx = new RequestContext(clsService);
  });

  afterEach(() => {
    jest.clearAllMocks();
  });

  describe('userId getter', () => {
    it('should retrieve userId from CLS', () => {
      const userId = 'user-123';
      clsService.get.mockReturnValue(userId);

      expect(ctx.userId).toBe(userId);
      expect(clsService.get).toHaveBeenCalledWith('userId');
    });
  });

  describe('user getter', () => {
    it('should retrieve full user object from CLS', () => {
      const user: User = {
        id: 'user-123',
        orgId: 'org-123',
        email: 'test@example.com',
        firstName: 'John',
        lastName: 'Doe',
        role: 'user' as UserRole,
        isActive: true,
        authProviders: ['local'],
        profileComplete: true,
        twoFactorEnabled: false,
        createdAt: '2024-01-01T00:00:00Z',
        updatedAt: '2024-01-01T00:00:00Z',
      };

      clsService.get.mockReturnValue(user);

      expect(ctx.user).toBe(user);
      expect(clsService.get).toHaveBeenCalledWith('user');
    });
  });

  describe('userRole getter', () => {
    it('should retrieve user role from CLS', () => {
      const role: UserRole = 'admin';
      clsService.get.mockReturnValue(role);

      expect(ctx.userRole).toBe(role);
      expect(clsService.get).toHaveBeenCalledWith('userRole');
    });
  });

  describe('org getter', () => {
    it('should retrieve organization from CLS', () => {
      const org: Organization = {
        id: 'org-123',
        name: 'Test Org',
        passwordLoginEnabled: true,
        ssoLoginEnabled: true,
        marketplaceAllowSelfApproval: false,
        marketplaceEnabled: true,
        createdAt: '2024-01-01T00:00:00Z',
        updatedAt: '2024-01-01T00:00:00Z',
      };

      clsService.get.mockReturnValue(org);

      expect(ctx.org).toBe(org);
      expect(clsService.get).toHaveBeenCalledWith('org');
    });

    it('should return undefined if org is not set in CLS', () => {
      clsService.get.mockReturnValue(undefined);

      expect(ctx.org).toBeUndefined();
      expect(clsService.get).toHaveBeenCalledWith('org');
    });

    it('should include marketplace feature flags in org', () => {
      const org: Organization = {
        id: 'org-123',
        name: 'Test Org',
        passwordLoginEnabled: true,
        ssoLoginEnabled: true,
        marketplaceAllowSelfApproval: true,
        marketplaceEnabled: false, // Marketplace disabled
        createdAt: '2024-01-01T00:00:00Z',
        updatedAt: '2024-01-01T00:00:00Z',
      };

      clsService.get.mockReturnValue(org);

      const retrievedOrg = ctx.org;

      expect(retrievedOrg).toBeDefined();
      expect(retrievedOrg?.marketplaceEnabled).toBe(false);
      expect(retrievedOrg?.marketplaceAllowSelfApproval).toBe(true);
    });
  });

  describe('skill getter/setter', () => {
    it('should retrieve skill from CLS', () => {
      const skill: SkillSummary = {
        id: 'skill-123',
        ownerId: 'user-123',
        name: 'Test Skill',
        description: 'A test skill',
        status: 'ready',
        isPublished: false,
        version: 1,
        createdAt: '2024-01-01T00:00:00Z',
        updatedAt: '2024-01-01T00:00:00Z',
      };

      clsService.get.mockReturnValue(skill);

      expect(ctx.skill).toBe(skill);
      expect(clsService.get).toHaveBeenCalledWith('skill');
    });

    it('should set skill in CLS', () => {
      const skill: SkillSummary = {
        id: 'skill-123',
        ownerId: 'user-123',
        name: 'Test Skill',
        description: 'A test skill',
        status: 'ready',
        isPublished: false,
        version: 1,
        createdAt: '2024-01-01T00:00:00Z',
        updatedAt: '2024-01-01T00:00:00Z',
      };

      ctx.skill = skill;

      expect(clsService.set).toHaveBeenCalledWith('skill', skill);
    });
  });
});
