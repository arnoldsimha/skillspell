import { ExecutionContext } from '@nestjs/common';
import { Test, TestingModule } from '@nestjs/testing';
import { ClsService } from 'nestjs-cls';
import { OrganizationContextGuard } from './organization-context.guard';
import { OrganizationService } from '../../organization/organization.service.js';
import type { Organization, User } from '@skillspell/shared';

/**
 * Unit tests for OrganizationContextGuard — organization context injection.
 *
 * Tests cover:
 * - Allow request and store org when user is authenticated and org is found
 * - Handle missing orgId gracefully (log warning, allow through)
 * - Handle org fetch failures gracefully (log error, allow through)
 * - Skip org fetch when user is not authenticated
 */
describe('OrganizationContextGuard', () => {
  let guard: OrganizationContextGuard;
  let orgService: jest.Mocked<OrganizationService>;
  let clsService: jest.Mocked<ClsService>;

  /** Helper — build a mock ExecutionContext with optional user. */
  const makeContext = (user?: Partial<User> | null): ExecutionContext =>
    ({
      switchToHttp: () => ({
        getRequest: () => ({ user }),
      }),
    }) as unknown as ExecutionContext;

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      providers: [
        OrganizationContextGuard,
        {
          provide: OrganizationService,
          useValue: {
            getOrganizationById: jest.fn(),
          },
        },
        {
          provide: ClsService,
          useValue: {
            set: jest.fn(),
            get: jest.fn(),
          },
        },
      ],
    }).compile();

    guard = module.get<OrganizationContextGuard>(OrganizationContextGuard);
    orgService = module.get<jest.Mocked<OrganizationService>>(OrganizationService);
    clsService = module.get<jest.Mocked<ClsService>>(ClsService);
  });

  afterEach(() => {
    jest.clearAllMocks();
  });

  // ── Successful org fetch ─────────────────────────────────────────────────

  it('should fetch and store organization when user is authenticated', async () => {
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

    orgService.getOrganizationById.mockResolvedValue(org);

    const user: Partial<User> = {
      id: 'user-123',
      email: 'test@example.com',
      orgId: 'org-123',
    };

    const result = await guard.canActivate(makeContext(user));

    expect(result).toBe(true);
    expect(orgService.getOrganizationById).toHaveBeenCalledWith('org-123');
    expect(clsService.set).toHaveBeenCalledWith('org', org);
  });

  // ── No user / unauthenticated ────────────────────────────────────────────

  it('should allow through without fetching org when user is not authenticated', async () => {
    const result = await guard.canActivate(makeContext(null));

    expect(result).toBe(true);
    expect(orgService.getOrganizationById).not.toHaveBeenCalled();
    expect(clsService.set).not.toHaveBeenCalled();
  });

  // ── Missing orgId ────────────────────────────────────────────────────────

  it('should log warning and allow through when user has no orgId', async () => {
    const user: Partial<User> = {
      id: 'user-123',
      email: 'test@example.com',
      // orgId is explicitly undefined
    };

    const result = await guard.canActivate(makeContext(user));

    expect(result).toBe(true);
    expect(orgService.getOrganizationById).not.toHaveBeenCalled();
    expect(clsService.set).not.toHaveBeenCalled();
  });

  // ── Org fetch failure ────────────────────────────────────────────────────

  it('should log error and allow through when org fetch fails', async () => {
    orgService.getOrganizationById.mockRejectedValue(new Error('Org not found'));

    const user: Partial<User> = {
      id: 'user-123',
      email: 'test@example.com',
      orgId: 'org-456',
    };

    const result = await guard.canActivate(makeContext(user));

    expect(result).toBe(true);
    expect(orgService.getOrganizationById).toHaveBeenCalledWith('org-456');
    // Should NOT call set since fetch failed
    expect(clsService.set).not.toHaveBeenCalled();
  });

  it('should handle non-Error exceptions during org fetch', async () => {
    orgService.getOrganizationById.mockRejectedValue('Database connection lost');

    const user: Partial<User> = {
      id: 'user-123',
      email: 'test@example.com',
      orgId: 'org-789',
    };

    const result = await guard.canActivate(makeContext(user));

    expect(result).toBe(true);
    expect(orgService.getOrganizationById).toHaveBeenCalledWith('org-789');
    expect(clsService.set).not.toHaveBeenCalled();
  });

  // ── Marketplace feature flag ─────────────────────────────────────────────

  it('should store org with marketplaceEnabled flag', async () => {
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

    orgService.getOrganizationById.mockResolvedValue(org);

    const user: Partial<User> = {
      id: 'user-123',
      email: 'test@example.com',
      orgId: 'org-123',
    };

    const result = await guard.canActivate(makeContext(user));

    expect(result).toBe(true);
    expect(clsService.set).toHaveBeenCalledWith(
      'org',
      expect.objectContaining({
        marketplaceEnabled: false,
        marketplaceAllowSelfApproval: true,
      }),
    );
  });

  // ── Null org fetch result ────────────────────────────────────────────────

  it('should allow through when org fetch returns null', async () => {
    orgService.getOrganizationById.mockResolvedValue(
      null as unknown as Organization,
    );

    const user: Partial<User> = {
      id: 'user-123',
      email: 'test@example.com',
      orgId: 'org-999',
    };

    const result = await guard.canActivate(makeContext(user));

    expect(result).toBe(true);
    expect(orgService.getOrganizationById).toHaveBeenCalledWith('org-999');
    expect(clsService.set).toHaveBeenCalledWith('org', null);
  });

  // ── CLS set failure ──────────────────────────────────────────────────────

  it('should log error and allow through when cls.set() fails', async () => {
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

    orgService.getOrganizationById.mockResolvedValue(org);
    clsService.set.mockImplementation(() => {
      throw new Error('CLS storage unavailable');
    });

    const user: Partial<User> = {
      id: 'user-123',
      email: 'test@example.com',
      orgId: 'org-123',
    };

    const result = await guard.canActivate(makeContext(user));

    expect(result).toBe(true);
    expect(clsService.set).toHaveBeenCalledWith('org', org);
  });

  // ── Concurrent request handling ──────────────────────────────────────────

  it('should handle concurrent requests with different orgs', async () => {
    const org1: Organization = {
      id: 'org-1',
      name: 'Org 1',
      passwordLoginEnabled: true,
      ssoLoginEnabled: true,
      marketplaceAllowSelfApproval: false,
      marketplaceEnabled: true,
      createdAt: '2024-01-01T00:00:00Z',
      updatedAt: '2024-01-01T00:00:00Z',
    };

    const org2: Organization = {
      id: 'org-2',
      name: 'Org 2',
      passwordLoginEnabled: false,
      ssoLoginEnabled: false,
      marketplaceAllowSelfApproval: true,
      marketplaceEnabled: false,
      createdAt: '2024-01-02T00:00:00Z',
      updatedAt: '2024-01-02T00:00:00Z',
    };

    orgService.getOrganizationById
      .mockResolvedValueOnce(org1)
      .mockResolvedValueOnce(org2);

    const user1: Partial<User> = {
      id: 'user-1',
      email: 'user1@example.com',
      orgId: 'org-1',
    };

    const user2: Partial<User> = {
      id: 'user-2',
      email: 'user2@example.com',
      orgId: 'org-2',
    };

    const result1 = await guard.canActivate(makeContext(user1));
    const result2 = await guard.canActivate(makeContext(user2));

    expect(result1).toBe(true);
    expect(result2).toBe(true);
    expect(orgService.getOrganizationById).toHaveBeenCalledWith('org-1');
    expect(orgService.getOrganizationById).toHaveBeenCalledWith('org-2');
  });

  // ── Edge case: empty string orgId ─────────────────────────────────────────

  it('should treat empty string orgId as missing', async () => {
    const user: Partial<User> = {
      id: 'user-123',
      email: 'test@example.com',
      orgId: '',
    };

    const result = await guard.canActivate(makeContext(user));

    expect(result).toBe(true);
    expect(orgService.getOrganizationById).not.toHaveBeenCalled();
    expect(clsService.set).not.toHaveBeenCalled();
  });
});
