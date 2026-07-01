import { Inject, Injectable, NotFoundException } from '@nestjs/common';
import { SKILL_REPOSITORY, type ISkillRepository, type SkillSummary } from '@skillspell/shared';

/** Public download response — minimal envelope with no PII. */
export interface PublicSkillDownload {
  name: string;
  slug: string;
  content: string;
}

/**
 * Public skill list item — strips ownerId (a UUID that is user-linked data) from
 * the full SkillSummary before returning to unauthenticated callers.
 */
export type PublicSkillSummary = Omit<SkillSummary, 'ownerId'>;

/**
 * Service for unauthenticated public skill access.
 *
 * Provides paginated listing of published skills and a download endpoint.
 * Response types are deliberately minimal — no userId, ownerId, or other user data.
 */
@Injectable()
export class PublicSkillsService {
  constructor(
    @Inject(SKILL_REPOSITORY)
    private readonly skillRepo: ISkillRepository,
  ) {}

  /**
   * List published skills with optional pagination and name search.
   * Strips ownerId before returning — unauthenticated callers must not receive
   * owner UUIDs that could be used to enumerate users.
   */
  async listPublished(limit: number, offset: number, search?: string): Promise<PublicSkillSummary[]> {
    const skills = await this.skillRepo.findPublished(limit, offset, search);
    return skills.map(({ ownerId: _owner, ...rest }) => rest);
  }

  /**
   * Download a published skill's content as a lean JSON envelope.
   * Returns 404 for unpublished or unknown skills.
   * Response has exactly: name, slug, content — no user PII.
   */
  async downloadSkill(id: string): Promise<PublicSkillDownload> {
    const skill = await this.skillRepo.findById(id);

    if (!skill || !skill.isPublished) {
      throw new NotFoundException(`Skill not found or not published`);
    }

    return {
      name: skill.name,
      slug: this.toSlug(skill.name),
      content: skill.skillContent,
    };
  }

  /**
   * Derive a URL-safe kebab-case slug from a skill name.
   * Used in the download response for CLI consumers.
   */
  private toSlug(name: string): string {
    return name
      .toLowerCase()
      .replace(/\s+/g, '-')
      .replace(/[^a-z0-9-]/g, '')
      .replace(/-+/g, '-')
      .replace(/^-|-$/g, '');
  }
}
