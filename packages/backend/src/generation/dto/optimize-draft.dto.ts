import {
  IsString,
  IsNotEmpty,
  MaxLength,
  IsOptional,
  ValidateNested,
  IsArray,
} from 'class-validator';
import { Type } from 'class-transformer';
import { SkillFileItemDto } from '../../common/dto/skill-file-item.dto.js';

class DraftContextDto {
  @IsString()
  @IsNotEmpty()
  @MaxLength(64)
  name!: string;

  @IsString()
  @MaxLength(2048)
  description!: string;

  @IsString()
  @MaxLength(500_000)
  skillContent!: string;

  @IsArray()
  @ValidateNested({ each: true })
  @Type(() => SkillFileItemDto)
  scripts!: SkillFileItemDto[];

  @IsArray()
  @ValidateNested({ each: true })
  @Type(() => SkillFileItemDto)
  references!: SkillFileItemDto[];

  @IsArray()
  @ValidateNested({ each: true })
  @Type(() => SkillFileItemDto)
  assets!: SkillFileItemDto[];
}

export class OptimizeDraftDto {
  @IsString()
  @IsNotEmpty()
  @MaxLength(50_000)
  refinement!: string;

  @IsOptional()
  @ValidateNested()
  @Type(() => DraftContextDto)
  draftContext?: DraftContextDto;
}
