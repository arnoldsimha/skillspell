import {
  IsArray,
  IsBoolean,
  IsIn,
  IsNotEmpty,
  IsOptional,
  IsString,
  IsUrl,
  MaxLength,
  ValidateNested,
} from 'class-validator';
import { Type } from 'class-transformer';

class AttributeMappingDto {
  @IsString()
  @IsNotEmpty()
  @MaxLength(256)
  email!: string;

  @IsString()
  @IsNotEmpty()
  @MaxLength(256)
  firstName!: string;

  @IsString()
  @IsNotEmpty()
  @MaxLength(256)
  lastName!: string;
}

/**
 * DTO for creating/updating OIDC SSO configuration.
 *
 * Mirrors SaveSamlConfigDto structure with OIDC-specific fields.
 */
export class SaveOidcConfigDto {
  /** OIDC issuer URL (discovery endpoint base). Required. */
  @IsString()
  @IsNotEmpty()
  @IsUrl({ protocols: ['https', 'http'], require_protocol: true, require_tld: false })
  @MaxLength(2048)
  issuerUrl!: string;

  @IsString()
  @IsNotEmpty()
  @MaxLength(2048)
  clientId!: string;

  /** Optional on update — omit to keep the existing saved secret. */
  @IsOptional()
  @IsString()
  @MaxLength(2048)
  clientSecret?: string;

  /** OAuth2 scopes. Example: ['openid', 'email', 'profile'] */
  @IsArray()
  @IsString({ each: true })
  scopes!: string[];

  /** Attribute mapping — maps OIDC claim names to system fields. */
  @ValidateNested()
  @Type(() => AttributeMappingDto)
  attributeMapping!: AttributeMappingDto;

  @IsBoolean()
  autoProvision!: boolean;

  @IsIn(['user', 'admin'])
  defaultRole!: 'user' | 'admin';

  /** Optional override: authorization endpoint URL. */
  @IsOptional()
  @IsString()
  @IsUrl({ protocols: ['https', 'http'], require_protocol: true, require_tld: false })
  @MaxLength(2048)
  authorizationUrl?: string;

  /** Optional override: token endpoint URL. */
  @IsOptional()
  @IsString()
  @IsUrl({ protocols: ['https', 'http'], require_protocol: true, require_tld: false })
  @MaxLength(2048)
  tokenUrl?: string;

  /** Optional override: JWKS URI. */
  @IsOptional()
  @IsString()
  @IsUrl({ protocols: ['https', 'http'], require_protocol: true, require_tld: false })
  @MaxLength(2048)
  jwksUri?: string;
}
