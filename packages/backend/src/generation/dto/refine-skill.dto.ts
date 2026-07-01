import { IsString, IsNotEmpty, MaxLength } from 'class-validator';

export class RefineSkillDto {
  @IsString()
  @IsNotEmpty()
  @MaxLength(50_000)
  refinement!: string;
}
