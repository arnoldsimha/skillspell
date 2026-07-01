import {
  Body,
  Controller,
  Delete,
  Get,
  HttpCode,
  HttpStatus,
  Param,
  ParseUUIDPipe,
  Post,
  Query,
  UseGuards,
} from '@nestjs/common';
import { Roles } from '../auth/decorators/roles.decorator.js';
import { CurrentUser } from '../auth/decorators/current-user.decorator.js';
import { MarketplaceGuard } from './marketplace.guard.js';
import { MarketplaceService } from './marketplace.service.js';
import { MarketplaceSubmissionService } from './marketplace-submission.service.js';
import { ApproveRejectDto } from './dto/approve-reject.dto.js';
import { AdminRemoveSkillDto } from './dto/admin-remove-skill.dto.js';
import type { MarketplaceListItem, MarketplaceRemovalRequest, MarketplaceSubmission, User } from '@skillspell/shared';

/**
 * Admin-only marketplace management endpoints.
 *
 * @Roles('admin') at class level — RolesGuard blocks non-admin users for all methods.
 * Elevation of Privilege mitigation applied here.
 *
 * IMPORTANT — route order: literal path segments MUST come before :param segments in NestJS.
 * Order preserved:
 *   /pending
 *   /approved
 *   /removal-requests
 *   /removal-requests/:id/approve
 *   /removal-requests/:id/reject
 *   /submissions/:submissionId
 *   /submissions/:submissionId  (DELETE)
 *   /:submissionId/approve
 *   /:submissionId/reject
 *   /:skillId          (DELETE)
 */
@Controller('admin/marketplace')
@Roles('admin')
@UseGuards(MarketplaceGuard)
export class AdminMarketplaceController {
  constructor(
    private readonly marketplaceService: MarketplaceService,
    private readonly submissionService: MarketplaceSubmissionService,
  ) {}

  /**
   * List pending_review submissions scoped to the admin's org.
   * GET /api/admin/marketplace/pending
   */
  @Get('pending')
  async listPending(@CurrentUser() admin: User): Promise<MarketplaceSubmission[]> {
    return this.submissionService.listPendingSubmissions(admin);
  }

  /**
   * List approved marketplace skills for the admin's org (management table) with pagination.
   * GET /api/admin/marketplace/approved?limit=100&offset=0
   *
   * Added limit/offset query params — the previous hard-coded limit:200 silently
   * truncated results for orgs with many approved skills. Defaults to 100-item pages.
   *
   * @Roles('admin') applied at class level — new endpoint inherits guard automatically.
   * Org scoping enforced via listApprovedSubmissions → findApprovedByOrg(admin.orgId).
   */
  @Get('approved')
  async listApproved(
    @CurrentUser() admin: User,
    @Query('limit') limit?: string,
    @Query('offset') offset?: string,
  ): Promise<{ items: MarketplaceListItem[]; total: number }> {
    const parsedLimit = Math.min(Math.max(parseInt(limit ?? '100', 10) || 100, 1), 500);
    const parsedOffset = Math.max(parseInt(offset ?? '0', 10) || 0, 0);
    return this.marketplaceService.listApprovedSubmissions(admin, parsedLimit, parsedOffset);
  }

  /**
   * List all pending owner removal requests scoped to the admin's org.
   * GET /api/admin/marketplace/removal-requests
   */
  @Get('removal-requests')
  async listRemovalRequests(@CurrentUser() admin: User): Promise<MarketplaceRemovalRequest[]> {
    return this.submissionService.listRemovalRequests(admin);
  }

  /**
   * Approve an owner-initiated removal request — removes all approved versions and the listing.
   * POST /api/admin/marketplace/removal-requests/:id/approve
   *
   * NOTE: Must be declared before /:submissionId/approve to prevent route shadowing.
   */
  @Post('removal-requests/:id/approve')
  @HttpCode(HttpStatus.NO_CONTENT)
  async approveRemoval(
    @Param('id', ParseUUIDPipe) id: string,
    @CurrentUser() admin: User,
  ): Promise<void> {
    return this.submissionService.approveRemoval(id, admin);
  }

  /**
   * Reject an owner-initiated removal request — listing reverts to active.
   * POST /api/admin/marketplace/removal-requests/:id/reject
   *
   * NOTE: Must be declared before /:submissionId/reject to prevent route shadowing.
   */
  @Post('removal-requests/:id/reject')
  @HttpCode(HttpStatus.NO_CONTENT)
  async rejectRemoval(
    @Param('id', ParseUUIDPipe) id: string,
    @CurrentUser() admin: User,
  ): Promise<void> {
    return this.submissionService.rejectRemoval(id, admin);
  }

  /**
   * List all approved versions for a skill without requiring an active listing.
   * Returns empty array for first-time submissions (never published).
   * GET /api/admin/marketplace/skills/:skillId/approved-versions
   */
  @Get('skills/:skillId/approved-versions')
  async getApprovedVersions(
    @Param('skillId', ParseUUIDPipe) skillId: string,
  ): Promise<MarketplaceSubmission[]> {
    return this.marketplaceService.listApprovedVersionsForAdmin(skillId);
  }

  /**
   * Fetch a pending submission with skill content for the admin preview modal.
   * GET /api/admin/marketplace/submissions/:submissionId
   */
  @Get('submissions/:submissionId')
  async getSubmissionPreview(
    @Param('submissionId', ParseUUIDPipe) submissionId: string,
    @CurrentUser() admin: User,
  ): Promise<MarketplaceSubmission & { skillName: string; skillContent: string }> {
    return this.marketplaceService.getSubmissionPreview(submissionId, admin.orgId);
  }

  /**
   * Remove a single approved submission version from the marketplace.
   * If it was the last version, the listing is marked removed; otherwise the listing
   * is updated to point at the previous version.
   * DELETE /api/admin/marketplace/submissions/:submissionId
   */
  @Delete('submissions/:submissionId')
  @HttpCode(HttpStatus.NO_CONTENT)
  async removeVersion(
    @Param('submissionId', ParseUUIDPipe) submissionId: string,
    @CurrentUser() admin: User,
  ): Promise<void> {
    return this.submissionService.removeVersion(submissionId, admin);
  }

  /**
   * Approve a marketplace submission.
   * POST /api/admin/marketplace/:submissionId/approve
   */
  @Post(':submissionId/approve')
  @HttpCode(HttpStatus.NO_CONTENT)
  async approve(
    @Param('submissionId', ParseUUIDPipe) submissionId: string,
    @CurrentUser() admin: User,
  ): Promise<void> {
    return this.submissionService.approve(submissionId, admin);
  }

  /**
   * Reject a marketplace submission with an optional review note.
   * POST /api/admin/marketplace/:submissionId/reject
   */
  @Post(':submissionId/reject')
  @HttpCode(HttpStatus.NO_CONTENT)
  async reject(
    @Param('submissionId', ParseUUIDPipe) submissionId: string,
    @CurrentUser() admin: User,
    @Body() dto: ApproveRejectDto,
  ): Promise<void> {
    return this.submissionService.reject(submissionId, admin, dto.reviewNote);
  }

  /**
   * Remove a skill from the marketplace (sets all approved submissions to removed).
   * DELETE /api/admin/marketplace/:skillId
   * A reason is required in the request body for policy-violation removals.
   */
  @Delete(':skillId')
  @HttpCode(HttpStatus.NO_CONTENT)
  async remove(
    @Param('skillId', ParseUUIDPipe) skillId: string,
    @CurrentUser() admin: User,
    @Body() dto: AdminRemoveSkillDto,
  ): Promise<void> {
    return this.marketplaceService.removeFromMarketplace(skillId, admin, dto.reason);
  }
}
