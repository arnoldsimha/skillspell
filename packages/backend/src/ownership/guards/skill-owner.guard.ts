import {
  CanActivate,
  ExecutionContext,
  ForbiddenException,
  Injectable,
  Logger,
} from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import { CHECK_OWNERSHIP_KEY } from '../decorators/check-ownership.decorator.js';
import { OwnershipService } from '../ownership.service.js';
import { RequestContext } from '../../common/context/request-context.service.js';

/**
 * Route-level guard that verifies the current user owns the skill
 * identified by a route parameter.
 *
 * Activated by the {@link CheckOwnership} decorator which specifies
 * the parameter name (e.g. `'id'` or `'skillId'`).
 *
 * On success a lightweight SkillSummary (metadata only) is stored in
 * the CLS context (`RequestContext.skill`) so downstream services can
 * read version, status, etc. without a duplicate database fetch.
 * Services that need full content should call `skillRepo.findById()`.
 *
 * Must run AFTER JwtAuthGuard and ClsGuard so that `RequestContext.userId`
 * is already populated.
 */
@Injectable()
export class SkillOwnerGuard implements CanActivate {
  private readonly logger = new Logger(SkillOwnerGuard.name);

  constructor(
    private readonly reflector: Reflector,
    private readonly ownership: OwnershipService,
    private readonly ctx: RequestContext,
  ) {}

  async canActivate(context: ExecutionContext): Promise<boolean> {
    // Check handler first, then controller — handler-level overrides class-level.
    const paramName = this.reflector.getAllAndOverride<string | undefined>(
      CHECK_OWNERSHIP_KEY,
      [context.getHandler(), context.getClass()],
    );

    // No @CheckOwnership decorator → skip (route doesn't need ownership check)
    if (!paramName) {
      return true;
    }

    const request = context.switchToHttp().getRequest();
    const skillId: string | undefined = request.params?.[paramName];

    if (!skillId) {
      this.logger.error(
        `@CheckOwnership('${paramName}') declared but param not found in request — denying access`,
      );
      throw new ForbiddenException('Ownership check parameter missing');
    }

    // Admins bypass ownership checks — they can access any skill.
    // Still fetch metadata so ctx.skill is populated for downstream services.
    if (this.ctx.userRole === 'admin') {
      this.ctx.skill = await this.ownership.fetchSkillMetadata(skillId);
      return true;
    }

    // assertOwnership throws NotFoundException / ForbiddenException on failure
    const skill = await this.ownership.assertOwnership(skillId);

    // Store the pre-fetched skill in CLS so services can access it via ctx.skill
    this.ctx.skill = skill;

    return true;
  }
}
