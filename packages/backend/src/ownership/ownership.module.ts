import { Module } from '@nestjs/common';
import { OwnershipService } from './ownership.service.js';
import { SkillOwnerGuard } from './guards/skill-owner.guard.js';

/**
 * Ownership module — provides skill ownership verification.
 *
 * This is a leaf module with no circular dependencies. Any module that
 * needs to verify "does the current user own this skill?" imports
 * OwnershipModule instead of importing SkillsModule.
 *
 * Provides:
 * - OwnershipService  — programmatic ownership assertion
 * - SkillOwnerGuard   — route-level guard activated by @CheckOwnership()
 *
 * Dependencies: RepositoriesModule (for SKILL_REPOSITORY), RequestContext
 * (globally provided via RequestContextModule).
 */
@Module({
  imports: [],
  providers: [OwnershipService, SkillOwnerGuard],
  exports: [OwnershipService, SkillOwnerGuard],
})
export class OwnershipModule {}
