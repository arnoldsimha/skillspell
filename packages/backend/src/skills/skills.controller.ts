import {
  Controller,
  Get,
  Patch,
  Post,
  Put,
  Delete,
  NotFoundException,
  Param,
  Query,
  Body,
  ParseIntPipe,
  ParseUUIDPipe,
  HttpCode,
} from '@nestjs/common';
import { plainToInstance } from 'class-transformer';
import { SkillsService } from './skills.service.js';
import { GenerationService } from '../generation/generation.service.js';
import { CreateSkillDto } from './dto/create-skill.dto.js';
import { UpdateSkillDto } from './dto/update-skill.dto.js';
import { ApproveOptimizationDto } from './dto/approve-optimization.dto.js';
import { UpdateSkillMetadataDto } from './dto/update-skill-metadata.dto.js';
import { CheckNameDto } from './dto/check-name.dto.js';
import { SkillListItemDto, SkillSummaryDto, SkillDetailDto } from './dto/skill-response.dto.js';
import { PublicSkillListQueryDto } from '../public/dto/public-skill-list-query.dto.js';
import { CheckOwnership } from '../ownership/decorators/check-ownership.decorator.js';
import { CurrentUser } from '../auth/decorators/current-user.decorator.js';
import { ParseVersionPipe } from '../common/pipes/parse-version.pipe.js';
import type {
  SkillDiagram,
  SkillVersionSnapshot,
  SkillVersionSummary,
  User,
} from '@skillspell/shared';

@Controller('skills')
export class SkillsController {
  constructor(
    private readonly skillsService: SkillsService,
    private readonly generationService: GenerationService,
  ) {}

  /**
   * GET /api/skills — List all skills owned by the current user (metadata only).
   * Uses SkillListItemDto (no submissionStatus) because findAll does not resolve
   * submission status in bulk — use GET /api/skills/:id/metadata for that.
   */
  @Get()
  async findAll(): Promise<SkillListItemDto[]> {
    const skills = await this.skillsService.findAll();
    return plainToInstance(SkillListItemDto, skills, {
      excludeExtraneousValues: true,
    });
  }

  /* ------------------------------------------------------------------ */
  /*  DISCOVER  (must come before :id to avoid route conflicts)          */
  /* ------------------------------------------------------------------ */

  /**
   * GET /api/skills/discover — Authenticated discovery list.
   *
   * Returns published skills from all users merged with the caller's own
   * private (unpublished) skills. This is the correct view for the CLI
   * `list` command when the user is authenticated:
   *   - Published skills: visible to everyone
   *   - Caller's own private skills: only visible to their owner
   *   - Another user's private skills: never returned
   *
   * Supports the same limit/offset/search query params as GET /api/public/skills.
   */
  @Get('discover')
  async discover(@Query() query: PublicSkillListQueryDto): Promise<SkillListItemDto[]> {
    const skills = await this.skillsService.discover(
      query.limit ?? 20,
      query.offset ?? 0,
      query.search,
    );
    return plainToInstance(SkillListItemDto, skills, {
      excludeExtraneousValues: true,
    });
  }

  /* ------------------------------------------------------------------ */
  /*  NAME CHECK  (must come before :id to avoid route conflicts)        */
  /* ------------------------------------------------------------------ */

  /**
   * POST /api/skills/check-name — Check if a skill name is already taken.
   * Body: { name: string; excludeId?: string }
   * Returns { exists: boolean }. Name uniqueness is scoped per-owner.
   */
  @Post('check-name')
  @HttpCode(200)
  async checkName(
    @Body() dto: CheckNameDto,
  ): Promise<{ exists: boolean }> {
    const exists = await this.skillsService.nameExists(dto.name, dto.excludeId);
    return { exists };
  }

  /* ------------------------------------------------------------------ */
  /*  METADATA  (must come before :id to avoid route conflicts)          */
  /* ------------------------------------------------------------------ */

  /**
   * GET /api/skills/:id/metadata — Get skill metadata only (no content).
   * Lightweight query — no heavy JSONB fields loaded from DB.
   * Use GET /api/skills/v:version/:id for version-specific content.
   */
  @Get(':id/metadata')
  @CheckOwnership('id')
  async getMetadata(
    @Param('id', ParseUUIDPipe) id: string,
  ): Promise<SkillSummaryDto> {
    const meta = await this.skillsService.getMetadata(id);
    return plainToInstance(SkillSummaryDto, meta, { excludeExtraneousValues: true });
  }

  /* ------------------------------------------------------------------ */
  /*  VERSION HISTORY  (must come before :id to avoid route conflicts)   */
  /* ------------------------------------------------------------------ */

  /**
   * GET /api/skills/:id/versions — List all version summaries for a skill.
   */
  @Get(':id/versions')
  @CheckOwnership('id')
  async getVersionHistory(
    @Param('id', ParseUUIDPipe) id: string,
  ): Promise<SkillVersionSummary[]> {
    return this.skillsService.getVersionHistory(id);
  }

  /**
   * GET /api/skills/v:version/:id — Get a full version snapshot.
   */
  @Get('v:version/:id')
  @CheckOwnership('id')
  async getVersionSnapshot(
    @Param('id', ParseUUIDPipe) id: string,
    @Param('version', ParseIntPipe) version: number,
  ): Promise<SkillVersionSnapshot> {
    return this.skillsService.getVersionSnapshot(id, version);
  }

  /* ------------------------------------------------------------------ */
  /*  DIAGRAM  (must come before :id to avoid route conflicts)           */
  /* ------------------------------------------------------------------ */

  /**
   * POST /api/skills/:id/diagram — Get or generate a Mermaid diagram.
   * POST /api/skills/v:version/:id/diagram — same, for a specific version.
   * Returns cached diagram if available for the current skill version,
   * otherwise generates a new one via the light model.
   */
  @Post([':id/diagram', 'v:version/:id/diagram'])
  @CheckOwnership('id')
  async generateDiagram(
    @Param('id', ParseUUIDPipe) id: string,
    @Param('version', ParseVersionPipe) version?: number,
    @Query('force') force?: string,
  ): Promise<SkillDiagram> {
    return this.generationService.generateDiagram(id, force === 'true', version);
  }

  /* ------------------------------------------------------------------ */
  /*  APPROVE OPTIMIZATION  (must come before :id to avoid conflicts)    */
  /* ------------------------------------------------------------------ */

  /**
   * POST /api/skills/:id/approve-optimization — Approve an optimization draft.
   * Applies the draft data as a new skill version with proper snapshots.
   * This is the "commit" step of the draft-based optimization flow.
   */
  @Post(':id/approve-optimization')
  @CheckOwnership('id')
  async approveOptimization(
    @Param('id', ParseUUIDPipe) id: string,
    @Body() dto: ApproveOptimizationDto,
  ): Promise<SkillDetailDto> {
    const skill = await this.skillsService.approveOptimization(id, dto);
    return plainToInstance(SkillDetailDto, skill, { excludeExtraneousValues: true });
  }

  /* ------------------------------------------------------------------ */
  /*  SKILL CRUD                                                         */
  /* ------------------------------------------------------------------ */

  /**
   * POST /api/skills — Create a new skill manually (without generation).
   */
  @Post()
  async create(@Body() dto: CreateSkillDto): Promise<SkillDetailDto> {
    const skill = await this.skillsService.create(dto);
    return plainToInstance(SkillDetailDto, skill, { excludeExtraneousValues: true });
  }

  /**
   * GET /api/skills/:id — Get full skill detail.
   */
  @Get(':id')
  @CheckOwnership('id')
  async findById(@Param('id', ParseUUIDPipe) id: string): Promise<SkillDetailDto> {
    const skill = await this.skillsService.findById(id);
    return plainToInstance(SkillDetailDto, skill, { excludeExtraneousValues: true });
  }

  /**
   * PUT /api/skills/:id — Update skill.
   */
  @Put(':id')
  @CheckOwnership('id')
  async update(
    @Param('id', ParseUUIDPipe) id: string,
    @Body() dto: UpdateSkillDto,
  ): Promise<SkillDetailDto> {
    const skill = await this.skillsService.update(id, dto);
    return plainToInstance(SkillDetailDto, skill, { excludeExtraneousValues: true });
  }

  /**
   * PATCH /api/skills/:id/publish — Toggle public visibility of a skill.
   * Only the skill owner can publish/unpublish (enforced by @CheckOwnership).
   * Body: { isPublished: boolean }
   */
  @Patch(':id/publish')
  @CheckOwnership('id')
  async publish(
    @Param('id', ParseUUIDPipe) id: string,
    @Body() body: { isPublished: boolean },
  ): Promise<{ id: string; isPublished: boolean }> {
    const skill = await this.skillsService.publish(id, body.isPublished);
    return { id: skill.id, isPublished: skill.isPublished };
  }

  /**
   * GET /api/skills/:id/taxonomy — Get current category and tag assignments for a skill.
   * Returns full { categories, tags } objects so viewers can display names without a
   * separate admin lookup.
   *
   * Visibility check — only return taxonomy for published skills or skills the
   * caller owns. Without this guard, any authenticated user can confirm a UUID exists
   * and read category/tag metadata for another user's private skill.
   */
  @Get(':id/taxonomy')
  async getTaxonomy(
    @Param('id', ParseUUIDPipe) id: string,
    @CurrentUser() user: User,
  ): Promise<{ categories: { id: string; name: string }[] }> {
    const skill = await this.skillsService.findById(id).catch(() => null);
    if (!skill || (!skill.isPublished && skill.ownerId !== user.id)) {
      throw new NotFoundException('Skill not found');
    }
    return this.skillsService.getTaxonomy(id);
  }

  /**
   * PATCH /api/skills/:id/taxonomy — Set category and tag assignments for a skill.
   * Replaces all existing assignments with the provided IDs.
   * Only the skill owner can assign (@CheckOwnership).
   */
  @Patch(':id/taxonomy')
  @CheckOwnership('id')
  async setTaxonomy(
    @Param('id', ParseUUIDPipe) id: string,
    @Body() dto: UpdateSkillMetadataDto,
  ): Promise<{ categoryIds: string[] }> {
    return this.skillsService.setTaxonomy(id, dto);
  }

  /**
   * DELETE /api/skills/:id — Delete skill.
   */
  @Delete(':id')
  @CheckOwnership('id')
  @HttpCode(204)
  async delete(@Param('id', ParseUUIDPipe) id: string): Promise<void> {
    return this.skillsService.delete(id);
  }
}
