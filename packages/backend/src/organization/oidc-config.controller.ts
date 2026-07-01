import {
  Body,
  Controller,
  Delete,
  Get,
  HttpCode,
  HttpStatus,
  Post,
  Put,
} from '@nestjs/common';
import { IsOptional, IsString, IsUrl, MaxLength } from 'class-validator';
import type { OidcProviderConfig, OidcProviderConfigResponse } from '@skillspell/shared';
import { Roles } from '../auth/decorators/roles.decorator.js';
import { OrganizationService } from './organization.service.js';
import { OidcAuthService } from '../auth/strategies/oidc.strategy.js';
import { SaveOidcConfigDto } from '../auth/dto/oidc-config.dto.js';

/**
 * Typed DTO for the discover endpoint to validate issuerUrl format
 * before making an outbound HTTP request (SSRF mitigation).
 */
class DiscoverEndpointsDto {
  @IsUrl({ protocols: ['https', 'http'], require_protocol: true, require_tld: false })
  @MaxLength(2048)
  issuerUrl!: string;

  @IsOptional()
  @IsString()
  clientId?: string;

  @IsOptional()
  @IsString()
  clientSecret?: string;
}

/**
 * OIDC configuration controller (admin-only).
 *
 * Handles all OIDC-related endpoints under `/api/admin/organization/oidc`.
 *
 * Security: @Roles('admin') at class level — all three admin endpoints
 * inherit the guard.
 *
 * clientSecret is NEVER returned to the frontend.
 */
@Controller('admin/organization/oidc')
@Roles('admin')
export class OidcConfigController {
  constructor(
    private readonly orgService: OrganizationService,
    private readonly oidcAuthService: OidcAuthService,
  ) {}

  /**
   * GET /api/admin/organization/oidc
   * Returns current OIDC config with clientSecret masked as hasClientSecret flag.
   */
  @Get()
  async getOidcConfig(): Promise<{ config: OidcProviderConfigResponse | null }> {
    const org = await this.orgService.getOrganization();
    const config = await this.orgService.getOidcConfig(org.id);
    if (!config) return { config: null };
    const { clientSecret: _, ...rest } = config;
    return { config: { ...rest, hasClientSecret: true } };
  }

  /**
   * PUT /api/admin/organization/oidc
   * Create or update OIDC configuration.
   * clientSecret is stored but NEVER returned in the response.
   */
  @Put()
  async saveOidcConfig(
    @Body() dto: SaveOidcConfigDto,
  ): Promise<{ config: OidcProviderConfigResponse }> {
    const org = await this.orgService.getOrganization();
    const now = new Date().toISOString();
    const existing = await this.orgService.getOidcConfig(org.id);

    // Preserve the plaintext secret separately; the service encrypts before storing.
    // If omitted on update, reuse the existing decrypted secret (getOidcConfig already decrypts it).
    const plaintextSecret = dto.clientSecret ?? existing?.clientSecret ?? '';
    const config: OidcProviderConfig = {
      issuerUrl: dto.issuerUrl,
      clientId: dto.clientId,
      // encryptedClientSecret is set by OrganizationService.saveOidcConfig — placeholder here
      encryptedClientSecret: '',
      scopes: dto.scopes,
      attributeMapping: dto.attributeMapping,
      autoProvision: dto.autoProvision,
      defaultRole: dto.defaultRole,
      authorizationUrl: dto.authorizationUrl,
      tokenUrl: dto.tokenUrl,
      jwksUri: dto.jwksUri,
      createdAt: existing?.createdAt ?? now,
      updatedAt: now,
    };

    await this.orgService.saveOidcConfig(org.id, config, plaintextSecret);
    // encryptedClientSecret NEVER returned to frontend
    const { encryptedClientSecret: _, ...rest } = config;
    return { config: { ...rest, hasClientSecret: true } };
  }

  /**
   * DELETE /api/admin/organization/oidc
   * Remove OIDC configuration.
   */
  @Delete()
  @HttpCode(HttpStatus.OK)
  async deleteOidcConfig(): Promise<{ message: string }> {
    const org = await this.orgService.getOrganization();
    await this.orgService.deleteOidcConfig(org.id);
    return { message: 'OIDC configuration deleted' };
  }

  /**
   * POST /api/admin/organization/oidc/discover
   * Fetches OIDC provider metadata from the discovery URL.
   * Admin clicks "Fetch Configuration" to auto-populate endpoint override fields.
   */
  @Post('discover')
  async discoverEndpoints(
    @Body() dto: DiscoverEndpointsDto,
  ): Promise<{ authorizationUrl: string; tokenUrl: string; jwksUri: string }> {
    return this.oidcAuthService.fetchDiscoveryMetadata(
      dto.issuerUrl,
      dto.clientId ?? 'probe',
      dto.clientSecret ?? '',
    );
  }
}
