import {
  IsString,
  IsOptional,
  IsEnum,
  MinLength,
  MaxLength,
  Matches,
} from 'class-validator';
import { Transform } from 'class-transformer';
import { normalizeSkillName } from '../../common/utils/normalize-skill-name.js';

export enum SkillStatus {
  DRAFT = 'draft',
  READY = 'ready',
  IN_REVIEW = 'in_review',
  PUBLISHED = 'published',
}

export class UpdateSkillDto {
  @IsOptional()
  @Transform(({ value }) => (value === undefined ? value : normalizeSkillName(value)))
  @IsString()
  @MinLength(1)
  @MaxLength(64)
  @Matches(/^[a-z][a-z0-9-]*$/, {
    message:
      'name must be lowercase, start with a letter, and contain only lowercase letters, numbers, and hyphens',
  })
  name?: string;

  @IsOptional()
  @IsString()
  @MaxLength(2048)
  description?: string;

  @IsOptional()
  @IsEnum(SkillStatus, {
    message: 'status must be one of: draft, ready, in_review, published',
  })
  status?: SkillStatus;

  @IsOptional()
  @IsString()
  @MaxLength(500_000)
  skillContent?: string;
}
