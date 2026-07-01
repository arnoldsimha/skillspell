import { Injectable } from '@nestjs/common';
import { ClsService } from 'nestjs-cls';
import type { SkillSummary, User, UserRole, Organization } from '@skillspell/shared';

/**
 * Request-scoped user context backed by AsyncLocalStorage (via nestjs-cls).
 *
 * Provides typed accessors for the authenticated user's data without
 * requiring explicit parameter passing through controller → service chains.
 *
 * The CLS store is populated by the ClsGuard (registered after JwtAuthGuard)
 * which copies `request.user` into the store on each request.
 *
 * The `org` property is populated by OrganizationContextGuard (runs after ClsGuard)
 * — it contains the full organization entity including marketplace feature flags.
 *
 * The `skill` property is populated by SkillOwnerGuard on routes decorated
 * with @CheckOwnership — it contains only lightweight metadata (SkillSummary),
 * not heavy content fields. Services that need full content should fetch it
 * via `skillRepo.findById()`.
 *
 * @see https://docs.nestjs.com/recipes/async-local-storage
 */
@Injectable()
export class RequestContext {
  constructor(private readonly cls: ClsService) {}

  /** Get the authenticated user's ID. */
  get userId(): string {
    return this.cls.get('userId');
  }

  /** Get the full authenticated user object. */
  get user(): User {
    return this.cls.get('user');
  }

  /** Get the user's role. */
  get userRole(): UserRole {
    return this.cls.get('userRole');
  }

  /**
   * Get the user's organization entity.
   *
   * Populated by OrganizationContextGuard after user is authenticated.
   * Contains organization metadata including feature flags (marketplaceEnabled, etc.).
   * May be undefined if:
   * - User is not authenticated
   * - Organization fetch failed
   * - User's orgId is missing
   */
  get org(): Organization | undefined {
    return this.cls.get('org');
  }

  /**
   * Lightweight skill metadata pre-fetched by SkillOwnerGuard during
   * ownership verification.
   *
   * Only available on routes decorated with @CheckOwnership. Contains
   * only metadata fields (id, ownerId, name, description, status, version,
   * timestamps) — no heavy content (skillContent, scripts, etc.).
   *
   * Services that need full content should call `skillRepo.findById()`.
   */
  get skill(): SkillSummary | undefined {
    return this.cls.get('skill');
  }

  set skill(skill: SkillSummary) {
    this.cls.set('skill', skill);
  }
}
