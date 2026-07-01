import {
  IsString,
  IsNotEmpty,
  IsBoolean,
  IsOptional,
  IsInt,
  Min,
  Max,
  IsArray,
  ValidateNested,
  MaxLength,
} from 'class-validator';
import { Type } from 'class-transformer';

class TriggerEvalQueryDto {
  @IsString()
  @IsNotEmpty()
  @MaxLength(1000)
  query!: string;

  @IsBoolean()
  shouldTrigger!: boolean;
}

export class GenerateTriggerEvalsDto {
  @IsOptional()
  @IsInt()
  @Min(4)
  @Max(50)
  count?: number;
}

export class RunDescriptionOptimizationDto {
  @IsArray()
  @ValidateNested({ each: true })
  @Type(() => TriggerEvalQueryDto)
  queries!: TriggerEvalQueryDto[];

  @IsOptional()
  @IsInt()
  @Min(1)
  @Max(10)
  maxIterations?: number;

  @IsOptional()
  @IsInt()
  @Min(1)
  @Max(5)
  runsPerQuery?: number;
}

export class ApplyOptimizedDescriptionDto {
  @IsString()
  @IsNotEmpty()
  @MaxLength(1024)
  description!: string;
}
