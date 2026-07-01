import { Controller, Get, Param, ParseUUIDPipe, Query } from '@nestjs/common';
import { Public } from '../auth/decorators/public.decorator.js';
import { PublicSkillListQueryDto } from './dto/public-skill-list-query.dto.js';
import { PublicSkillsService } from './public-skills.service.js';

/**
 * Public (unauthenticated) skill access endpoints.
 *
 * Both routes use @Public() — the global JwtAuthGuard skips auth checks.
 * Authenticated callers (JWT or PAT) also succeed — @Public() does not reject
 * them, it merely makes auth optional.
 *
 * Base path: /api/public/skills (global /api prefix + controller prefix 'public/skills')
 */
@Controller('public/skills')
export class PublicController {
  constructor(private readonly publicSkillsService: PublicSkillsService) {}

  /**
   * GET /api/public/skills — List published skills.
   * Supports optional search (name ILIKE) and offset/limit pagination.
   */
  @Public()
  @Get()
  async listPublished(@Query() query: PublicSkillListQueryDto) {
    return this.publicSkillsService.listPublished(
      query.limit ?? 20,
      query.offset ?? 0,
      query.search,
    );
  }

  /**
   * GET /api/public/skills/:id/download — Download a published skill.
   * Returns {name, slug, content}. Returns 404 for unpublished or unknown skills.
   * ParseUUIDPipe validates the id param before reaching service.
   */
  @Public()
  @Get(':id/download')
  async downloadSkill(@Param('id', ParseUUIDPipe) id: string) {
    return this.publicSkillsService.downloadSkill(id);
  }
}
