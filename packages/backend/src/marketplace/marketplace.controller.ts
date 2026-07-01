import {
  BadRequestException,
  Body,
  Controller,
  Get,
  Header,
  HttpCode,
  HttpStatus,
  Logger,
  NotFoundException,
  Param,
  ParseUUIDPipe,
  Post,
  Query,
  StreamableFile,
  UseGuards,
} from '@nestjs/common';
import { Throttle } from '@nestjs/throttler';
import { MarketplaceGuard } from './marketplace.guard.js';
import { plainToInstance } from 'class-transformer';
import { CurrentUser } from '../auth/decorators/current-user.decorator.js';
import { ExportService } from '../export/export.service.js';
import { GenerationService } from '../generation/generation.service.js';
import type { SkillDiagram } from '@skillspell/shared';
import { MarketplaceService } from './marketplace.service.js';
import { MarketplaceSubmissionService } from './marketplace-submission.service.js';
import { MarketplaceBrowseResponseDto } from './dto/marketplace-browse-response.dto.js';
import { MarketplaceListItemDto } from './dto/marketplace-list-item.dto.js';
import { MarketplaceListQueryDto } from './dto/marketplace-list-query.dto.js';
import { MarketplaceSkillDetailDto } from './dto/marketplace-skill-detail.dto.js';
import { MySubmissionDto } from './dto/my-submission.dto.js';
import { RequestRemovalDto } from './dto/request-removal.dto.js';
import { SubmitSkillDto } from './dto/submit-skill.dto.js';
import type { MarketplaceSubmission, SubmissionRequirement, User } from '@skillspell/shared';

/**
 * User-facing marketplace endpoints.
 *
 * No @Roles decorator — global JwtAuthGuard applies. All authenticated users can
 * submit skills, browse the listing, download, and view stats.
 *
 * IMPORTANT — route order: literal path segments MUST be defined before :param routes.
 * - 'my-submissions' before ':skillId'
 * - ':skillId/versions' before ':skillId' (would shadow as param)
 * - ':skillId/download', ':skillId/diagram' before ':skillId'
 */
@Controller('marketplace')
@UseGuards(MarketplaceGuard)
export class MarketplaceController {
  private readonly logger = new Logger(MarketplaceController.name);

  constructor(
    private readonly marketplaceService: MarketplaceService,
    private readonly submissionService: MarketplaceSubmissionService,
    private readonly exportService: ExportService,
    private readonly generationService: GenerationService,
  ) {}

  /**
   * Submit a skill to the marketplace.
   * POST /api/marketplace/submit
   */
  @Post('submit')
  @HttpCode(HttpStatus.CREATED)
  async submit(
    @Body() dto: SubmitSkillDto,
    @CurrentUser() user: User,
  ): Promise<MySubmissionDto> {
    const result = await this.submissionService.submit(dto, user);
    return plainToInstance(MySubmissionDto, result, { excludeExtraneousValues: true });
  }

  /**
   * Return the authenticated user's marketplace submissions.
   * GET /api/marketplace/my-submissions
   *
   * NOTE: This route MUST be declared before /:skillId routes to prevent
   * NestJS from treating "my-submissions" as a dynamic :skillId parameter.
   */
  @Get('my-submissions')
  async getMySubmissions(
    @CurrentUser() user: User,
  ): Promise<MySubmissionDto[]> {
    const results = await this.marketplaceService.findBySubmittedBy(user);
    return plainToInstance(MySubmissionDto, results, { excludeExtraneousValues: true });
  }

  /**
   * Return the org-scoped approved marketplace listing.
   * GET /api/marketplace
   */
  @Get()
  async browse(
    @Query() query: MarketplaceListQueryDto,
    @CurrentUser() user: User,
  ): Promise<MarketplaceBrowseResponseDto> {
    const result = await this.marketplaceService.findApproved(user.orgId, query, user.id);
    return plainToInstance(MarketplaceBrowseResponseDto, result, { excludeExtraneousValues: true });
  }

  /**
   * Return the authenticated user's favorited marketplace skills.
   * GET /api/marketplace/favorites
   *
   * NOTE: This route MUST be declared before /:skillId routes to prevent
   * NestJS from treating "favorites" as a dynamic :skillId parameter.
   */
  @Get('favorites')
  async getFavorites(
    @Query('limit') limitStr: string | undefined,
    @Query('page') pageStr: string | undefined,
    @CurrentUser() user: User,
  ): Promise<{ items: MarketplaceListItemDto[]; total: number }> {
    const limit = limitStr !== undefined ? parseInt(limitStr, 10) : 30;
    const page  = pageStr  !== undefined ? parseInt(pageStr, 10)  : 1;

    if (limitStr !== undefined && (isNaN(limit) || limit < 1 || limit > 100)) {
      throw new BadRequestException('limit must be an integer between 1 and 100');
    }
    if (pageStr !== undefined && (isNaN(page) || page < 1)) {
      throw new BadRequestException('page must be a positive integer');
    }

    const result = await this.marketplaceService.getFavorites(user, {
      limit: Math.min(limit, 100),
      page:  Math.max(page, 1),
    });
    return {
      items: result.items.map(item =>
        plainToInstance(MarketplaceListItemDto, item, { excludeExtraneousValues: true }),
      ),
      total: result.total,
    };
  }

  /**
   * Toggle upvote on a marketplace skill.
   * POST /api/marketplace/:skillId/upvote
   *
   * Rate limited to 30 requests per minute via 'short' throttler.
   * NOTE: Must be declared BEFORE @Get(':skillId') per route ordering rules.
   */
  @Post(':skillId/upvote')
  @HttpCode(HttpStatus.OK)
  @Throttle({ short: { ttl: 60_000, limit: 30 } })
  async toggleUpvote(
    @Param('skillId', ParseUUIDPipe) skillId: string,
    @CurrentUser() user: User,
  ): Promise<{ upvoteCount: number; isUpvoted: boolean }> {
    return this.marketplaceService.toggleUpvote(skillId, user);
  }

  /**
   * Toggle favorite on a marketplace skill.
   * POST /api/marketplace/:skillId/favorite
   *
   * Rate limited to 30 requests per minute via 'short' throttler.
   * NOTE: Must be declared BEFORE @Get(':skillId') per route ordering rules.
   */
  @Post(':skillId/favorite')
  @HttpCode(HttpStatus.OK)
  @Throttle({ short: { ttl: 60_000, limit: 30 } })
  async toggleFavorite(
    @Param('skillId', ParseUUIDPipe) skillId: string,
    @CurrentUser() user: User,
  ): Promise<{ isFavorited: boolean }> {
    return this.marketplaceService.toggleFavorite(skillId, user);
  }

  /**
   * List all approved versions for a skill visible to the caller's org.
   * GET /api/marketplace/:skillId/versions
   *
   * NOTE: Must be declared BEFORE @Get(':skillId') to prevent NestJS treating
   * 'versions' as a :skillId param value.
   */
  @Get(':skillId/versions')
  async listVersions(
    @Param('skillId', ParseUUIDPipe) skillId: string,
    @CurrentUser() user: User,
  ): Promise<MarketplaceSubmission[]> {
    return this.marketplaceService.listVersions(skillId, user.orgId);
  }

  /**
   * Return submission eligibility requirements for a skill.
   * GET /api/marketplace/:skillId/eligibility
   *
   * NOTE: Must be declared BEFORE @Get(':skillId') to prevent NestJS treating
   * 'eligibility' as a :skillId param value.
   */
  @Get(':skillId/eligibility')
  async getEligibility(
    @Param('skillId', ParseUUIDPipe) skillId: string,
    @CurrentUser() user: User,
  ): Promise<SubmissionRequirement[]> {
    return this.submissionService.getEligibility(skillId, user);
  }

  /**
   * Return JSON detail for a single approved marketplace skill.
   * GET /api/marketplace/:skillId
   */
  @Get(':skillId')
  async getDetail(
    @Param('skillId', ParseUUIDPipe) skillId: string,
    @CurrentUser() user: User,
  ): Promise<MarketplaceSkillDetailDto> {
    const result = await this.marketplaceService.findApprovedSkillDetail(skillId, user.orgId, user.id);
    if (!result) throw new NotFoundException(`Skill ${skillId} not found in marketplace`);
    return plainToInstance(MarketplaceSkillDetailDto, result, { excludeExtraneousValues: true });
  }

  /**
   * Generate or return cached Mermaid diagram for a marketplace skill.
   * POST /api/marketplace/:skillId/diagram
   *
   * Uses POST (not GET) to match the sharing endpoint pattern — diagram generation
   * is potentially mutating (writes to cache). Requires the skill to be approved
   * and visible in the caller's org.
   *
   * force=true bypasses the cache and regenerates via LLM.
   */
  @Post(':skillId/diagram')
  async getDiagram(
    @Param('skillId', ParseUUIDPipe) skillId: string,
    @Query('force') force: string,
    @CurrentUser() user: User,
  ): Promise<SkillDiagram> {
    const detail = await this.marketplaceService.findApprovedSkillDetail(skillId, user.orgId, user.id);
    if (!detail) throw new NotFoundException(`Skill ${skillId} not found in marketplace`);
    return this.generationService.generateDiagram(skillId, force === 'true', undefined);
  }

  /**
   * Download a skill as a zip file.
   * GET /api/marketplace/:skillId/download?version=3
   *
   * Version format contract:
   * - ?version= arrives as a string from HTTP (e.g. "3")
   * - parsedVersion = parseInt(version, 10) — passed to exportAsZip() as integer snapshot counter
   * - Raw string version is passed to recordDownloadEvent() — matches the string stored in
   *   marketplace_submissions.version (e.g. "3"), ensuring event and submission records are consistent.
   * - If parseInt produces NaN (e.g. ?version=abc), BadRequestException is thrown before proceeding.
   *
   * Download event is recorded non-blocking — if recordDownloadEvent throws, the error
   * is logged and the zip is still served. The download UX is never blocked by a stats failure.
   *
   * validateVersionDownload guard ensures the specific version being requested is still active
   * on the marketplace (not removed), preventing downloads of yanked versions.
   */
  @Get(':skillId/download')
  @Header('Content-Type', 'application/zip')
  async download(
    @Param('skillId', ParseUUIDPipe) skillId: string,
    @Query('version') version: string,
    @CurrentUser() user: User,
  ): Promise<StreamableFile> {
    // Verify the skill has an approved marketplace submission visible to the
    // caller's org before streaming any content. Without this guard, any authenticated
    // user who knows a skill UUID can download it, bypassing the approval workflow.
    const approvedDetail = await this.marketplaceService.findApprovedSkillDetail(skillId, user.orgId, user.id);
    if (!approvedDetail) {
      throw new NotFoundException(`Skill ${skillId} not found in marketplace`);
    }

    const parsedVersion = parseInt(version, 10);
    if (isNaN(parsedVersion) || parsedVersion < 1 || parsedVersion > 10_000) {
      throw new BadRequestException('version must be a positive integer (1–10000)');
    }

    // Validate the requested version is still available (not yanked/removed).
    await this.marketplaceService.validateVersionDownload(skillId, version, user.orgId);

    // serve zip first, record event non-blocking after success.
    // exportAsZip must succeed before the download event is recorded — this prevents
    // inflating download counts for failed exports (S3 errors, missing snapshots, etc.).
    // parsedVersion (integer) is passed to exportAsZip — ExportService requires an integer snapshot counter.
    // version (raw string, e.g. "3") is passed to recordDownloadEvent — matches the string
    // stored in marketplace_submissions.version, ensuring event and submission records are consistent.
    const { stream, name } = await this.exportService.exportAsZip(skillId, 'claude', parsedVersion);
    // exclude dots to prevent path-traversal interpretation (e.g. ".." passes
    // unchanged with the old regex). Trim leading/trailing underscores that result from
    // stripping non-word chars at the boundary so the filename starts/ends cleanly.
    const safeName = (name ?? '')
      .replace(/[^a-zA-Z0-9_-]/g, '_')
      .replace(/^_+|_+$/g, '')
      || 'skill';

    try {
      await this.marketplaceService.recordDownloadEvent(skillId, version);
    } catch (err) {
      this.logger.warn(`Failed to record download event for skill ${skillId}: ${err}`);
    }

    return new StreamableFile(stream, {
      type: 'application/zip',
      disposition: `attachment; filename="${safeName}.zip"`,
    });
  }

  /**
   * Request removal of a skill from the marketplace (owner only).
   * POST /api/marketplace/:skillId/request-removal
   */
  @Post(':skillId/request-removal')
  @HttpCode(HttpStatus.NO_CONTENT)
  async requestRemoval(
    @Param('skillId', ParseUUIDPipe) skillId: string,
    @Body() dto: RequestRemovalDto,
    @CurrentUser() user: User,
  ): Promise<void> {
    return this.submissionService.requestRemoval(
      skillId, user, dto.scope, dto.targetSubmissionId, dto.reason,
    );
  }
}
