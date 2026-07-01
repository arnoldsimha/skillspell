import { IsString, IsOptional, MaxLength, IsIn, IsTimeZone } from 'class-validator';

/**
 * DTO for updating the current user's profile.
 */
export class UpdateProfileDto {
  @IsOptional()
  @IsString()
  @MaxLength(100)
  firstName?: string;

  @IsOptional()
  @IsString()
  @MaxLength(100)
  lastName?: string;

  /** IANA timezone identifier, e.g. "America/New_York". */
  @IsOptional()
  @IsTimeZone()
  timezone?: string;

  /** Preferred date display format. */
  @IsOptional()
  @IsIn(['MM/DD/YYYY', 'DD/MM/YYYY', 'YYYY-MM-DD'])
  dateFormat?: 'MM/DD/YYYY' | 'DD/MM/YYYY' | 'YYYY-MM-DD';
}
