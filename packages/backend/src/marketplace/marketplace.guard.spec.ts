import { ExecutionContext, ForbiddenException } from '@nestjs/common';
import { Test, TestingModule } from '@nestjs/testing';
import { ClsService } from 'nestjs-cls';
import { MarketplaceGuard } from './marketplace.guard';
import type { Organization } from '@skillspell/shared';

/**
 * Unit tests for MarketplaceGuard — organization-level marketplace feature gate.
 *
 * Tests cover:
 * - Allow access when marketplaceEnabled === true
 * - Throw ForbiddenException when marketplaceEnabled === false
 * - Allow access when org is null/undefined (development fallback)
 */
describe('MarketplaceGuard', () => {
  let guard: MarketplaceGuard;
  let clsService: ClsService;

  /** Helper — build a mock ExecutionContext. */
  const makeContext = (): ExecutionContext =>
    ({
      switchToHttp: () => ({
        getRequest: () => ({}),
      }),
    }) as unknown as ExecutionContext;

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      providers: [
        MarketplaceGuard,
        {
          provide: ClsService,
          useValue: {
            get: jest.fn(),
          },
        },
      ],
    }).compile();

    guard = module.get<MarketplaceGuard>(MarketplaceGuard);
    clsService = module.get<ClsService>(ClsService);
  });

  afterEach(() => {
    jest.clearAllMocks();
  });

  it('should allow access when marketplaceEnabled === true', () => {
    const org: Organization = {
      id: 'org-1',
      name: 'Test Org',
      passwordLoginEnabled: true,
      ssoLoginEnabled: true,
      marketplaceAllowSelfApproval: false,
      marketplaceEnabled: true,
      createdAt: '2024-01-01T00:00:00Z',
      updatedAt: '2024-01-01T00:00:00Z',
    };

    jest.spyOn(clsService, 'get').mockReturnValue(org);

    const result = guard.canActivate(makeContext());

    expect(result).toBe(true);
    expect(clsService.get).toHaveBeenCalledWith('org');
  });

  it('should throw ForbiddenException when marketplaceEnabled === false', () => {
    const org: Organization = {
      id: 'org-1',
      name: 'Test Org',
      passwordLoginEnabled: true,
      ssoLoginEnabled: true,
      marketplaceAllowSelfApproval: false,
      marketplaceEnabled: false,
      createdAt: '2024-01-01T00:00:00Z',
      updatedAt: '2024-01-01T00:00:00Z',
    };

    jest.spyOn(clsService, 'get').mockReturnValue(org);

    expect(() => guard.canActivate(makeContext())).toThrow(ForbiddenException);
    expect(() => guard.canActivate(makeContext())).toThrow(
      'Marketplace is disabled for this organization',
    );
  });

  it('should allow access when org is null/undefined (development fallback)', () => {
    jest.spyOn(clsService, 'get').mockReturnValue(undefined);

    const result = guard.canActivate(makeContext());

    expect(result).toBe(true);
  });

  it('should allow access when org is null', () => {
    jest.spyOn(clsService, 'get').mockReturnValue(null);

    const result = guard.canActivate(makeContext());

    expect(result).toBe(true);
  });
});
