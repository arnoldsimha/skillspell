import { Expose, Exclude } from 'class-transformer';
import type { SkillFileItem } from '@skillspell/shared';

/**
 * Lightweight response for listing skills — excludes heavy content fields
 * and excludes submissionStatus (not populated by findAll/discover).
 * Uses class-transformer @Exclude/@Expose for proper serialization.
 */
@Exclude()
export class SkillListItemDto {
  @Expose()
  id!: string;

  @Expose()
  ownerId!: string;

  @Expose()
  name!: string;

  @Expose()
  description!: string;

  @Expose()
  status!: string;

  @Expose()
  version!: number;

  @Expose()
  isPublished!: boolean;

  @Expose()
  createdAt!: string;

  @Expose()
  updatedAt!: string;
}

/**
 * Single-skill metadata response — extends SkillListItemDto.
 */
@Exclude()
export class SkillSummaryDto extends SkillListItemDto {
  @Expose()
  publishedVersion?: number;

  @Expose()
  approvedVersions?: number[];
}

/**
 * Full skill detail response — includes content fields but excludes
 * deprecated/internal fields.
 * Uses class-transformer @Exclude/@Expose for proper serialization.
 */
@Exclude()
export class SkillDetailDto {
  @Expose()
  id!: string;

  @Expose()
  ownerId!: string;

  @Expose()
  name!: string;

  @Expose()
  description!: string;

  @Expose()
  status!: string;

  @Expose()
  skillContent!: string;

  @Expose()
  scripts!: SkillFileItem[];

  @Expose()
  references!: SkillFileItem[];

  @Expose()
  assets!: SkillFileItem[];

  @Expose()
  version!: number;

  @Expose()
  isPublished!: boolean;

  @Expose()
  createdAt!: string;

  @Expose()
  updatedAt!: string;
}
