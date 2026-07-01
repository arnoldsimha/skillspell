import { IsOptional, IsInt, IsNumber, IsBoolean, IsIn, Min, Max, MaxLength, IsString } from 'class-validator';

/**
 * Validated body for POST /api/skills/:skillId/evals/optimize (SSE).
 *
 * Previously this endpoint accepted an untyped inline object, bypassing
 * the global ValidationPipe. Now class-validator enforces sensible bounds.
 */
export class OptimizeSkillDto {
  @IsOptional()
  @IsInt()
  @Min(1)
  @Max(5)
  maxIterations?: number;

  @IsOptional()
  @IsNumber()
  @Min(0)
  @Max(1)
  targetPassRate?: number;

  @IsOptional()
  @IsBoolean()
  includeFeedback?: boolean;

  /** Model used to execute eval cases during the loop. Defaults to 'main'. */
  @IsOptional()
  @IsIn(['main', 'light'])
  evalModel?: 'main' | 'light';
}
