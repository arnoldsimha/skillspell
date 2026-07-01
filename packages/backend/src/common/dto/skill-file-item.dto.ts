import { IsString, IsNotEmpty, MaxLength } from 'class-validator';

/**
 * Shared DTO representing a single file item within a skill
 * (script, reference, or asset).
 *
 * Used by both OptimizeDraftDto and ApproveOptimizationDto.
 */
export class SkillFileItemDto {
  @IsString()
  @IsNotEmpty()
  @MaxLength(255)
  name!: string;

  @IsString()
  @MaxLength(500_000)
  content!: string;
}
