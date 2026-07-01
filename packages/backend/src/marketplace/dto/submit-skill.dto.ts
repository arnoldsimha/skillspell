import { IsNotEmpty, IsOptional, IsString, IsUUID, Matches, MaxLength } from 'class-validator';

export class SubmitSkillDto {
  @IsUUID()
  @IsNotEmpty()
  skillId!: string;

  @IsString()
  @IsNotEmpty()
  @MaxLength(50)
  @Matches(/^[1-9]\d*$/, { message: 'version must be a positive integer string (≥1)' })
  version!: string;

  @IsOptional()
  @IsString()
  @MaxLength(1000)
  submitterNote?: string;
}
