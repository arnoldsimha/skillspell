import { IsDateString, IsNotEmpty, IsString, MaxLength } from 'class-validator';

/**
 * DTO for creating a personal access token.
 *
 * The backend generates the raw token; this DTO only accepts the user-provided
 * label and expiry. expiresAt is required — no infinite-lifetime tokens.
 */
export class CreatePatDto {
  @IsString()
  @IsNotEmpty()
  @MaxLength(100)
  name!: string;

  /** ISO 8601 datetime string. The CLI default is 1 year from now. */
  @IsDateString()
  @IsNotEmpty()
  expiresAt!: string;
}
