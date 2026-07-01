import {
  IsString,
  IsOptional,
  IsArray,
  IsNumber,
  IsBoolean,
  MaxLength,
  ArrayMaxSize,
  Max,
  Min,
  ValidateNested,
} from 'class-validator';
import { Type } from 'class-transformer';

export class EvalRunConfigDto {
  @IsOptional()
  @IsNumber()
  @Min(1)
  @Max(100_000)
  maxTokens?: number;

  @IsOptional()
  @IsNumber()
  @Min(0)
  @Max(2)
  temperature?: number;

  @IsOptional()
  @IsBoolean()
  compareBaseline?: boolean;
}

export class RunEvalsDto {
  @IsOptional()
  @IsArray()
  @ArrayMaxSize(50)
  @IsString({ each: true })
  @MaxLength(100, { each: true })
  evalIds?: string[];

  @ValidateNested()
  @Type(() => EvalRunConfigDto)
  config!: EvalRunConfigDto;

  /** Number of times to run each eval case. Default 1, use 3-5 for benchmarking. */
  @IsOptional()
  @IsNumber()
  @Min(1)
  @Max(5)
  runsPerCase?: number;

  /** Run against a specific skill version instead of the current one. */
  @IsOptional()
  @IsNumber()
  @Min(1)
  targetVersion?: number;
}
