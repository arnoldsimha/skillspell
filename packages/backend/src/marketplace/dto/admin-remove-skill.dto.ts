import { IsNotEmpty, IsString, MaxLength } from 'class-validator';

export class AdminRemoveSkillDto {
  @IsString()
  @IsNotEmpty({ message: 'A reason is required when removing a skill for policy violations.' })
  // cap reason length consistent with RequestRemovalDto (which has @MaxLength(1000))
  @MaxLength(2000, { message: 'Reason must not exceed 2000 characters' })
  reason!: string;
}
