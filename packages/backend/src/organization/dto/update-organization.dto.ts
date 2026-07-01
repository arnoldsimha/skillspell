import {
  IsBoolean,
  IsIn,
  IsNotEmpty,
  IsOptional,
  IsString,
  IsTimeZone,
  MinLength,
  ValidateIf,
} from 'class-validator';

/**
 * DTO for updating organization settings (name and/or login modes).
 */
export class UpdateOrganizationDto {
  @IsOptional()
  @IsString()
  @IsNotEmpty()
  @MinLength(1)
  name?: string;

  @IsOptional()
  @IsBoolean()
  passwordLoginEnabled?: boolean;

  @IsOptional()
  @IsBoolean()
  ssoLoginEnabled?: boolean;

  @IsOptional()
  @IsTimeZone()
  defaultTimezone?: string;

  // @IsIn(['saml', 'oidc', null]) is non-standard — null in the allowed array
  // relies on undocumented class-validator behaviour that may break in future versions.
  // Use @ValidateIf to skip @IsIn when the value is explicitly null (clear the protocol),
  // while still enforcing the allowed string values when a non-null value is provided.
  @IsOptional()
  @ValidateIf((o) => o.activeSsoProtocol !== null)
  @IsIn(['saml', 'oidc'])
  activeSsoProtocol?: 'saml' | 'oidc' | null;

  @IsOptional()
  @IsBoolean()
  marketplaceAllowSelfApproval?: boolean;

  @IsOptional()
  @IsBoolean()
  marketplaceEnabled?: boolean;
}

/**
 * DTO for creating an organization (used internally during setup).
 */
export class CreateOrganizationDto {
  @IsString()
  @IsNotEmpty()
  @MinLength(1)
  name!: string;
}
