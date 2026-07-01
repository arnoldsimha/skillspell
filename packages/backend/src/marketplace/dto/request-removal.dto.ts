import { IsEnum, IsOptional, IsString, IsUUID, MaxLength, ValidateIf } from 'class-validator';

export class RequestRemovalDto {
  @IsEnum(['skill', 'version'])
  scope!: 'skill' | 'version';

  /** Required when scope='version'. Ignored (and should be omitted) when scope='skill'. */
  @ValidateIf((o) => o.scope === 'version')
  @IsUUID()
  targetSubmissionId?: string;

  @IsOptional()
  @IsString()
  @MaxLength(1000)
  reason?: string;
}
