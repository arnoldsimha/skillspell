import {
  IsBoolean,
  IsEmail,
  IsIn,
  IsInt,
  IsNotEmpty,
  IsOptional,
  IsString,
  Max,
  Min,
  ValidateIf,
} from 'class-validator';

/**
 * DTO for creating/updating SMTP configuration.
 */
export class SaveSmtpConfigDto {
  // ─── 1. Connection Fields ─────────────────────────────────────────

  @IsString({ message: 'SMTP Host is required' })
  @IsNotEmpty({ message: 'SMTP Host is required' })
  host!: string;

  @IsInt({ message: 'Port must be a number' })
  @Min(1, { message: 'Port must be between 1 and 65535' })
  @Max(65535, { message: 'Port must be between 1 and 65535' })
  port!: number;

  @IsIn(['none', 'starttls', 'tls'], { message: 'Security must be None, STARTTLS, or TLS' })
  security!: 'none' | 'starttls' | 'tls';

  // ─── 2. Authentication Fields ─────────────────────────────────────

  @IsIn(['none', 'plain', 'oauth2'], { message: 'Auth Method must be None, Password, or OAuth2' })
  authMethod!: 'none' | 'plain' | 'oauth2';

  /** SMTP username. Required when authMethod='plain'. */
  @IsString()
  @IsOptional()
  username?: string;

  /**
   * SMTP password in plaintext. Encrypted before storage.
   * Optional on update — if omitted, existing encrypted password is preserved.
   */
  @IsString()
  @IsOptional()
  password?: string;

  // ─── 3. Sender Information Fields ─────────────────────────────────

  @IsEmail({}, { message: 'From Email must be a valid email address' })
  fromEmail!: string;

  @IsString({ message: 'From Name is required' })
  @IsNotEmpty({ message: 'From Name is required' })
  fromName!: string;

  @ValidateIf((o) => o.replyToEmail !== undefined && o.replyToEmail !== '')
  @IsEmail({}, { message: 'Reply-To Email must be a valid email address' })
  @IsOptional()
  replyToEmail?: string;

  @IsString()
  @IsOptional()
  replyToName?: string;

  // ─── 4. Advanced/Optional Fields ──────────────────────────────────

  @IsBoolean({ message: 'Enabled must be a boolean' })
  enabled!: boolean;

  @IsBoolean()
  @IsOptional()
  rejectUnauthorized?: boolean;

  @IsInt({ message: 'Connection Timeout must be a number' })
  @Min(1000, { message: 'Connection Timeout must be at least 1000 ms' })
  @Max(120000, { message: 'Connection Timeout must be at most 120000 ms' })
  @IsOptional()
  connectionTimeoutMs?: number;

  @IsInt({ message: 'Socket Timeout must be a number' })
  @Min(1000, { message: 'Socket Timeout must be at least 1000 ms' })
  @Max(120000, { message: 'Socket Timeout must be at most 120000 ms' })
  @IsOptional()
  socketTimeoutMs?: number;

  @ValidateIf((o) => o.defaultBcc !== undefined && o.defaultBcc !== '')
  @IsEmail({}, { message: 'Default BCC must be a valid email address' })
  @IsOptional()
  defaultBcc?: string;

  @ValidateIf((o) => o.defaultCc !== undefined && o.defaultCc !== '')
  @IsEmail({}, { message: 'Default CC must be a valid email address' })
  @IsOptional()
  defaultCc?: string;
}

/**
 * DTO for testing SMTP email delivery.
 */
export class TestSmtpEmailDto {
  @IsEmail()
  recipientEmail!: string;
}
