import { IsNotEmpty, IsString, Length, Matches } from 'class-validator';

/**
 * DTO for POST /api/auth/cli/exchange.
 * Accepts the one-time code issued by the SAML callback to the local CLI server.
 *
 * Added @Length and @Matches constraints so arbitrary-length strings cannot be
 * submitted. Codes are always 64 hex chars (randomBytes(32).toString('hex')).
 */
export class CliExchangeDto {
  @IsString()
  @IsNotEmpty()
  @Length(64, 64)
  @Matches(/^[0-9a-f]+$/, { message: 'code must be a 64-character lowercase hex string' })
  code!: string;
}
