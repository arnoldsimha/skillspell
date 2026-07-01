import {
  IsString,
  IsNotEmpty,
  IsOptional,
  IsArray,
  IsIn,
  ValidateNested,
  MaxLength,
  MinLength,
  Matches,
} from 'class-validator';
import { Type, Transform } from 'class-transformer';
import { normalizeSkillName } from '../../common/utils/normalize-skill-name.js';

/** Validated file item within a skill (scripts, references, assets). */
export class SkillFileItemDto {
  @IsString()
  @IsNotEmpty()
  @MaxLength(200)
  name!: string;

  @IsString()
  @MaxLength(500_000)
  content!: string;
}

export class CreateSkillDto {
  @Transform(({ value }) => normalizeSkillName(value))
  @IsString()
  @IsNotEmpty()
  @MinLength(1)
  @MaxLength(64)
  @Matches(/^[a-z][a-z0-9-]*$/, {
    message:
      'name must be lowercase, start with a letter, and contain only lowercase letters, numbers, and hyphens',
  })
  name!: string;

  @IsString()
  @IsNotEmpty()
  @MaxLength(2048)
  description!: string;

  @IsOptional()
  @IsString()
  @MaxLength(500000)
  skillContent?: string;

  @IsOptional()
  @IsArray()
  @ValidateNested({ each: true })
  @Type(() => SkillFileItemDto)
  scripts?: SkillFileItemDto[];

  @IsOptional()
  @IsArray()
  @ValidateNested({ each: true })
  @Type(() => SkillFileItemDto)
  references?: SkillFileItemDto[];

  @IsOptional()
  @IsArray()
  @ValidateNested({ each: true })
  @Type(() => SkillFileItemDto)
  assets?: SkillFileItemDto[];

  @IsOptional()
  @IsIn(['draft', 'ready'])
  status?: 'draft' | 'ready';
}
