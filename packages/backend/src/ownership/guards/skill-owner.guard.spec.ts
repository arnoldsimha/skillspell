import { Test, TestingModule } from '@nestjs/testing';
import { ExecutionContext, ForbiddenException, NotFoundException } from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import { SkillOwnerGuard } from './skill-owner.guard';
import { OwnershipService } from '../ownership.service';
import { RequestContext } from '../../common/context/request-context.service';
import { CHECK_OWNERSHIP_KEY } from '../decorators/check-ownership.decorator';
import type { SkillSummary } from '@skillspell/shared';

/**
 * Unit tests for SkillOwnerGuard — route-level ownership enforcement.
 *
 * Tests cover:
 * - Guard passes through when no @CheckOwnership decorator is present
 * - Guard calls OwnershipService when decorator is present
 * - Guard stores the pre-fetched skill metadata in RequestContext.skill
 * - Guard passes through when param is missing from request
 * - Guard propagates NotFoundException from OwnershipService
 * - Guard propagates ForbiddenException from OwnershipService
 */
describe('SkillOwnerGuard', () => {
  let guard: SkillOwnerGuard;
  let reflector: Reflector;
  let ownershipMock: { assertOwnership: jest.Mock; fetchSkillMetadata: jest.Mock };
  let ctxMock: { skill: SkillSummary | undefined; userRole: string };

  const SKILL_ID = 'skill-abc-789';

  const makeSkillSummary = (): SkillSummary =>
    ({
      id: SKILL_ID,
      name: 'Test Skill',
      description: 'A test skill',
      version: 1,
      status: 'ready',
      ownerId: 'user-owner-123',
      createdAt: '2024-01-01T00:00:00.000Z',
      updatedAt: '2024-01-01T00:00:00.000Z',
    }) as SkillSummary;

  /** Helper — build a mock ExecutionContext with the given route params. */
  const makeContext = (params: Record<string, string> = {}): ExecutionContext => {
    const handler = jest.fn();
    const cls = jest.fn();
    return {
      switchToHttp: () => ({
        getRequest: () => ({ params }),
      }),
      getHandler: () => handler,
      getClass: () => cls,
    } as unknown as ExecutionContext;
  };

  beforeEach(async () => {
    ownershipMock = { assertOwnership: jest.fn(), fetchSkillMetadata: jest.fn() };
    ctxMock = { skill: undefined, userRole: 'user' };

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        SkillOwnerGuard,
        Reflector,
        {
          provide: OwnershipService,
          useValue: ownershipMock,
        },
        {
          provide: RequestContext,
          useValue: ctxMock,
        },
      ],
    }).compile();

    guard = module.get<SkillOwnerGuard>(SkillOwnerGuard);
    reflector = module.get<Reflector>(Reflector);
  });

  it('should pass through when no @CheckOwnership decorator is present', async () => {
    jest.spyOn(reflector, 'getAllAndOverride').mockReturnValue(undefined);

    const result = await guard.canActivate(makeContext());

    expect(result).toBe(true);
    expect(ownershipMock.assertOwnership).not.toHaveBeenCalled();
  });

  it('should call OwnershipService when @CheckOwnership is present', async () => {
    const summary = makeSkillSummary();
    jest.spyOn(reflector, 'getAllAndOverride').mockReturnValue('id');
    ownershipMock.assertOwnership.mockResolvedValue(summary);

    const result = await guard.canActivate(makeContext({ id: SKILL_ID }));

    expect(result).toBe(true);
    expect(ownershipMock.assertOwnership).toHaveBeenCalledWith(SKILL_ID);
  });

  it('should store the pre-fetched skill metadata in RequestContext.skill', async () => {
    const summary = makeSkillSummary();
    jest.spyOn(reflector, 'getAllAndOverride').mockReturnValue('id');
    ownershipMock.assertOwnership.mockResolvedValue(summary);

    await guard.canActivate(makeContext({ id: SKILL_ID }));

    expect(ctxMock.skill).toBe(summary);
  });

  it('should use the correct param name from @CheckOwnership("skillId")', async () => {
    const summary = makeSkillSummary();
    jest.spyOn(reflector, 'getAllAndOverride').mockReturnValue('skillId');
    ownershipMock.assertOwnership.mockResolvedValue(summary);

    await guard.canActivate(makeContext({ skillId: SKILL_ID }));

    expect(ownershipMock.assertOwnership).toHaveBeenCalledWith(SKILL_ID);
  });

  it('should throw ForbiddenException when the param is declared but missing from the request', async () => {
    jest.spyOn(reflector, 'getAllAndOverride').mockReturnValue('id');

    // @CheckOwnership('id') declared but request has no 'id' param — fail closed
    await expect(guard.canActivate(makeContext({}))).rejects.toThrow(ForbiddenException);
    expect(ownershipMock.assertOwnership).not.toHaveBeenCalled();
  });

  it('should propagate NotFoundException when skill does not exist', async () => {
    jest.spyOn(reflector, 'getAllAndOverride').mockReturnValue('id');
    ownershipMock.assertOwnership.mockRejectedValue(
      new NotFoundException('Skill not found'),
    );

    await expect(
      guard.canActivate(makeContext({ id: SKILL_ID })),
    ).rejects.toThrow(NotFoundException);
  });

  it('should propagate ForbiddenException when user is not the owner', async () => {
    jest.spyOn(reflector, 'getAllAndOverride').mockReturnValue('id');
    ownershipMock.assertOwnership.mockRejectedValue(
      new ForbiddenException('You do not own this skill'),
    );

    await expect(
      guard.canActivate(makeContext({ id: SKILL_ID })),
    ).rejects.toThrow(ForbiddenException);
  });

  it('should bypass ownership check and populate ctx.skill for admin users', async () => {
    const summary = makeSkillSummary();
    jest.spyOn(reflector, 'getAllAndOverride').mockReturnValue('id');
    ctxMock.userRole = 'admin';
    ownershipMock.fetchSkillMetadata.mockResolvedValue(summary);

    const result = await guard.canActivate(makeContext({ id: SKILL_ID }));

    expect(result).toBe(true);
    expect(ownershipMock.fetchSkillMetadata).toHaveBeenCalledWith(SKILL_ID);
    expect(ownershipMock.assertOwnership).not.toHaveBeenCalled();
    expect(ctxMock.skill).toBe(summary);
  });

  it('should bypass ownership check for owner (higher than admin) users', async () => {
    const summary = makeSkillSummary();
    jest.spyOn(reflector, 'getAllAndOverride').mockReturnValue('id');
    ctxMock.userRole = 'owner';
    ownershipMock.fetchSkillMetadata.mockResolvedValue(summary);

    const result = await guard.canActivate(makeContext({ id: SKILL_ID }));

    expect(result).toBe(true);
    expect(ownershipMock.fetchSkillMetadata).toHaveBeenCalledWith(SKILL_ID);
    expect(ownershipMock.assertOwnership).not.toHaveBeenCalled();
    expect(ctxMock.skill).toBe(summary);
  });

  it('should read metadata from both handler and class level', async () => {
    const getAllAndOverrideSpy = jest.spyOn(reflector, 'getAllAndOverride').mockReturnValue(undefined);

    const context = makeContext();
    await guard.canActivate(context);

    // Verify getAllAndOverride was called with the correct key and both targets
    expect(getAllAndOverrideSpy).toHaveBeenCalledWith(CHECK_OWNERSHIP_KEY, [
      context.getHandler(),
      context.getClass(),
    ]);
  });
});
