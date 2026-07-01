import {
  Controller,
  Get,
  Header,
  Inject,
  Param,
  ParseUUIDPipe,
  Post,
  Query,
  BadRequestException,
  NotFoundException,
  StreamableFile,
} from '@nestjs/common';
import { SkillsService } from '../skills/skills.service.js';
import { ExportService } from '../export/export.service.js';
import { GenerationService } from '../generation/generation.service.js';
import { CurrentUser } from '../auth/decorators/current-user.decorator.js';
import { ParseVersionPipe } from '../common/pipes/parse-version.pipe.js';
import { USER_REPOSITORY, type IUserRepository, type User, type SkillDiagram, type SkillVersionSnapshot } from '@skillspell/shared';

export interface SharedSkillResponse {
  name: string;
  description: string;
  snapshot: SkillVersionSnapshot;
}

const VALID_FORMATS = ['claude', 'cursor', 'windsurf', 'copilot', 'roo'] as const;
type ExportFormat = (typeof VALID_FORMATS)[number];

@Controller('skills/share')
export class ShareController {
  constructor(
    private readonly skillsService: SkillsService,
    private readonly exportService: ExportService,
    private readonly generationService: GenerationService,
    @Inject(USER_REPOSITORY) private readonly userRepo: IUserRepository,
  ) {}

  /**
   * Resolves and validates shared skill access — used by both endpoints below.
   * Returns the numeric version derived from the v-prefixed path param.
   */
  private async authorizeSharedAccess(
    skillId: string,
    versionParam: number | undefined,
    requester: User,
  ): Promise<{ version: number }> {
    const skill = await this.skillsService.findById(skillId).catch(() => null);
    if (!skill || !skill.isPublished) throw new NotFoundException('Skill not found');

    const owner = await this.userRepo.findById(skill.ownerId);
    if (!owner || owner.orgId !== requester.orgId) {
      // Return 404 — not 403 — to avoid confirming the skill exists to cross-org callers
      throw new NotFoundException('Skill not found');
    }

    return { version: versionParam ?? skill.version };
  }

  /**
   * GET /api/skills/share/:skillId/v:version
   * URL example: /api/skills/share/uuid/v2
   *
   * Returns a version snapshot for authenticated same-org users.
   * Skill must be public. 403 if private or cross-org, 404 if not found.
   */
  @Get(':skillId/v:version')
  async getSharedSkill(
    @Param('skillId', ParseUUIDPipe) skillId: string,
    @Param('version', ParseVersionPipe) version: number | undefined,
    @CurrentUser() requester: User,
  ): Promise<SharedSkillResponse> {
    const { version: resolvedVersion } = await this.authorizeSharedAccess(skillId, version, requester);
    const skill = await this.skillsService.findById(skillId);
    const snapshot = await this.skillsService.getVersionSnapshot(skillId, resolvedVersion);
    return { name: skill.name, description: skill.description, snapshot };
  }

  /**
   * GET /api/skills/share/:skillId/v:version/export?format=claude
   * URL example: /api/skills/share/uuid/v2/export?format=claude
   *
   * Downloads a skill zip for authenticated same-org users — org-scoped, not ownership-gated.
   */
  @Get(':skillId/v:version/export')
  @Header('Content-Type', 'application/zip')
  async exportSharedSkill(
    @Param('skillId', ParseUUIDPipe) skillId: string,
    @Param('version', ParseVersionPipe) version: number | undefined,
    @CurrentUser() requester: User,
    @Query('format') format: string = 'claude',
  ): Promise<StreamableFile> {
    if (!VALID_FORMATS.includes(format as ExportFormat)) {
      throw new BadRequestException(
        `Invalid export format "${format}". Valid formats: ${VALID_FORMATS.join(', ')}`,
      );
    }

    const { version: resolvedVersion } = await this.authorizeSharedAccess(skillId, version, requester);
    const { stream, name } = await this.exportService.exportAsZip(skillId, format as ExportFormat, resolvedVersion);
    const safeName = name.replace(/[^a-zA-Z0-9_.-]/g, '_') || 'skill';

    return new StreamableFile(stream, {
      type: 'application/zip',
      disposition: `attachment; filename="${safeName}-${format}.zip"`,
    });
  }

  /**
   * POST /api/skills/share/:skillId/v:version/diagram
   *
   * Generate or return cached Mermaid diagram for same-org authenticated users.
   * Org-scoped — does not require skill ownership.
   */
  @Post(':skillId/v:version/diagram')
  async getSharedDiagram(
    @Param('skillId', ParseUUIDPipe) skillId: string,
    @Param('version', ParseVersionPipe) version: number | undefined,
    @Query('force') force: string,
    @CurrentUser() requester: User,
  ): Promise<SkillDiagram> {
    const { version: resolvedVersion } = await this.authorizeSharedAccess(skillId, version, requester);
    return this.generationService.generateDiagram(skillId, force === 'true', resolvedVersion);
  }
}
