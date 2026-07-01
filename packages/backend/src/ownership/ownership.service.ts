import {
  Injectable,
  Inject,
  NotFoundException,
  ForbiddenException,
} from '@nestjs/common';
import {
  SKILL_REPOSITORY,
  type ISkillRepository,
  type SkillSummary,
} from '@skillspell/shared';
import { RequestContext } from '../common/context/request-context.service.js';

/**
 * Standalone ownership verification service.
 *
 * Extracted from SkillsService so that any module (Skills, Generation, Eval,
 * Export) can verify skill ownership without creating circular module
 * dependencies.
 *
 * Returns lightweight SkillSummary (metadata only) on success — no heavy
 * content fields (skillContent, scripts, etc.) are loaded from the database.
 * Services that need full content should fetch it themselves via
 * `skillRepo.findById()`.
 */
@Injectable()
export class OwnershipService {
  constructor(
    @Inject(SKILL_REPOSITORY)
    private readonly skillRepo: ISkillRepository,
    private readonly ctx: RequestContext,
  ) {}

  /**
   * Fetch skill metadata without asserting ownership.
   * Used by the SkillOwnerGuard for admin users who need CLS context
   * populated but are not subject to ownership checks.
   *
   * @throws NotFoundException if skill does not exist
   */
  async fetchSkillMetadata(skillId: string): Promise<SkillSummary> {
    const skill = await this.skillRepo.findMetadataById(skillId);
    if (!skill) {
      throw new NotFoundException(`Skill with id "${skillId}" not found`);
    }
    return skill;
  }

  /**
   * Verify the current user owns the skill. Returns lightweight metadata
   * (SkillSummary) — no content fields are loaded.
   *
   * Services that need full content (skillContent, scripts, etc.) should
   * call `skillRepo.findById()` separately.
   *
   * @throws NotFoundException if skill does not exist
   * @throws ForbiddenException if skill belongs to another user
   */
  async assertOwnership(skillId: string): Promise<SkillSummary> {
    const skill = await this.skillRepo.findMetadataById(skillId);
    if (!skill) {
      throw new NotFoundException(`Skill with id "${skillId}" not found`);
    }
    // Fail closed — require ownerId for all skills.
    // Legacy skills without ownerId must be migrated (backfill ownerId)
    // before they can be accessed.
    if (!skill.ownerId) {
      throw new ForbiddenException(
        'This skill has no owner assigned. Contact an administrator to migrate legacy data.',
      );
    }
    if (skill.ownerId !== this.ctx.userId) {
      throw new ForbiddenException('You do not own this skill');
    }
    return skill;
  }
}
