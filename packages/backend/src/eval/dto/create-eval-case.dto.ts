import {
  IsString,
  IsOptional,
  IsArray,
  IsNotEmpty,
  IsInt,
  Max,
  Min,
  MaxLength,
  ValidateNested,
} from 'class-validator';
import { Transform } from 'class-transformer';
import { Type } from 'class-transformer';
import { EvalAssertionDto } from './eval-assertion.dto.js';

export class CreateEvalCaseDto {
  @IsString()
  @IsNotEmpty()
  @MaxLength(200)
  name!: string;

  @IsString()
  @IsNotEmpty()
  @MaxLength(10_000)
  prompt!: string;

  @IsOptional()
  @IsString()
  @MaxLength(50_000)
  expectedOutput?: string;

  @IsArray()
  @ValidateNested({ each: true })
  @Type(() => EvalAssertionDto)
  assertions!: EvalAssertionDto[];

  @IsOptional()
  @IsString()
  @MaxLength(10_000)
  context?: string;

  @IsOptional()
  @Transform(({ value }) => (typeof value === 'number' ? Math.round(value) : value))
  @IsInt()
  @Min(1024)
  @Max(16_000)
  maxOutputTokens?: number;
}
