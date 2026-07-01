import {
  IsString,
  IsOptional,
  IsArray,
  MaxLength,
  ValidateNested,
} from 'class-validator';
import { Type } from 'class-transformer';
import { EvalAssertionDto } from './eval-assertion.dto.js';

export class UpdateEvalCaseDto {
  @IsOptional()
  @IsString()
  @MaxLength(200)
  name?: string;

  @IsOptional()
  @IsString()
  @MaxLength(10_000)
  prompt?: string;

  @IsOptional()
  @IsString()
  @MaxLength(50_000)
  expectedOutput?: string;

  @IsOptional()
  @IsArray()
  @ValidateNested({ each: true })
  @Type(() => EvalAssertionDto)
  assertions?: EvalAssertionDto[];

  @IsOptional()
  @IsString()
  @MaxLength(10_000)
  context?: string;
}
