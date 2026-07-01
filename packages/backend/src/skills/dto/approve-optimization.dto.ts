import {
  IsString,
  IsNotEmpty,
  IsOptional,
  IsArray,
  MaxLength,
  ValidateNested,
} from 'class-validator';
import { Type } from 'class-transformer';
import { SkillFileItemDto } from '../../common/dto/skill-file-item.dto.js';

export class ApproveOptimizationDto {
  @IsOptional()
  @IsString()
  @IsNotEmpty()
  @MaxLength(64)
  name?: string;

  @IsString()
  @IsNotEmpty()
  @MaxLength(2048)
  description!: string;

  @IsString()
  @IsNotEmpty()
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

  @IsOptional()
  @IsString()
  @MaxLength(10_000)
  explanation?: string;
}
