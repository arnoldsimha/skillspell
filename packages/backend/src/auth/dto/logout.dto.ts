import { IsString, IsOptional } from 'class-validator';

/**
 * DTO for the logout endpoint.
 * The refresh token is optional — if provided, only that specific
 * refresh token is revoked. Otherwise, the session just ends client-side.
 */
export class LogoutDto {
  @IsOptional()
  @IsString()
  refreshToken?: string;
}
