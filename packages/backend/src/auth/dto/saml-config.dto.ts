import {
  IsBoolean,
  IsNotEmpty,
  IsOptional,
  IsString,
  IsIn,
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
 * DTO for creating/updating SAML SSO configuration.
 */
export class SaveSamlConfigDto {
  @IsString()
  @IsNotEmpty()
  @MaxLength(256)
  id!: string;

  @IsString()
  @IsNotEmpty()
  @MaxLength(256)
  displayName!: string;

  @IsString()
  @IsNotEmpty()
  @MaxLength(2048)
  idpEntityId!: string;

  @IsString()
  @IsNotEmpty()
  @MaxLength(2048)
  idpSsoUrl!: string;

  @IsString()
  @IsOptional()
  @MaxLength(2048)
  idpSloUrl?: string;

  @IsString()
  @IsNotEmpty()
  @MaxLength(10_000)
  idpCertificate!: string;

  @IsString()
  @IsNotEmpty()
  @MaxLength(2048)
  spEntityId!: string;

  @ValidateNested()
  @Type(() => AttributeMappingDto)
  attributeMapping!: AttributeMappingDto;

  @IsBoolean()
  autoProvision!: boolean;

  @IsIn(['user', 'admin'])
  defaultRole!: 'user' | 'admin';

  @IsString()
  @IsOptional()
  @MaxLength(2048)
  iconUrl?: string;
}

/**
 * DTO for importing IdP metadata from XML string.
 */
export class ImportMetadataDto {
  @IsString()
  @IsNotEmpty()
  @MaxLength(100_000)
  metadataXml!: string;
}
