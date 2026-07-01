import {
  BadRequestException,
  Body,
  Controller,
  Delete,
  Get,
  HttpCode,
  HttpStatus,
  Post,
  Put,
} from '@nestjs/common';
import type { SamlProviderConfig } from '@skillspell/shared';
import { XMLParser } from 'fast-xml-parser';
import { Roles } from '../auth/decorators/roles.decorator.js';
import { OrganizationService } from './organization.service.js';
import { SaveSamlConfigDto, ImportMetadataDto } from '../auth/dto/saml-config.dto.js';
import { SamlAuthService } from '../auth/strategies/saml.strategy.js';

/**
 * SSO / SAML configuration controller (admin-only).
 *
 * Handles all SSO-related endpoints under `/api/admin/organization/sso`.
 */
@Controller('admin/organization/sso')
@Roles('admin')
export class SsoConfigController {
  constructor(
    private readonly orgService: OrganizationService,
    private readonly samlAuthService: SamlAuthService,
  ) {}

  /**
   * Create or update the SAML configuration.
   */
  @Put()
  async saveSamlConfig(
    @Body() dto: SaveSamlConfigDto,
  ): Promise<{ config: SamlProviderConfig; acsUrl: string }> {
    const org = await this.orgService.getOrganization();
    const now = new Date().toISOString();

    // Check if config already exists (for createdAt preservation)
    const existing = await this.orgService.getSamlConfig(org.id);

    const config: SamlProviderConfig = {
      id: dto.id,
      displayName: dto.displayName,
      idpEntityId: dto.idpEntityId,
      idpSsoUrl: dto.idpSsoUrl,
      idpSloUrl: dto.idpSloUrl,
      idpCertificate: dto.idpCertificate,
      spEntityId: dto.spEntityId,
      attributeMapping: dto.attributeMapping,
      autoProvision: dto.autoProvision,
      defaultRole: dto.defaultRole,
      iconUrl: dto.iconUrl,
      createdAt: existing?.createdAt ?? now,
      updatedAt: now,
    };

    await this.orgService.saveSamlConfig(org.id, config);

    const acsUrl = `${config.spEntityId}/api/auth/saml/callback`;
    return { config, acsUrl };
  }

  /**
   * Delete/disable the SAML configuration.
   */
  @Delete()
  @HttpCode(HttpStatus.OK)
  async deleteSamlConfig(): Promise<{ message: string }> {
    const org = await this.orgService.getOrganization();
    await this.orgService.deleteSamlConfig(org.id);
    return { message: 'SAML configuration deleted' };
  }

  /**
   * Import IdP metadata from XML string.
   * Parses the XML and extracts idpEntityId, idpSsoUrl, idpSloUrl, idpCertificate.
   */
  @Post('import-metadata')
  async importMetadata(
    @Body() dto: ImportMetadataDto,
  ): Promise<{
    idpEntityId: string;
    idpSsoUrl: string;
    idpSloUrl?: string;
    idpCertificate: string;
  }> {
    const xml = dto.metadataXml;

    const {
      idpEntityId: parsedEntityId,
      idpSsoUrl: parsedSsoUrl,
      idpSloUrl: parsedSloUrl,
      idpCertificate: parsedCertificate,
    } = this.parseMetadataXml(xml);

    const idpEntityId = parsedEntityId || '';
    const idpSsoUrl = parsedSsoUrl || '';
    const idpSloUrl = parsedSloUrl || undefined;
    const idpCertificate = parsedCertificate || '';

    if (!idpEntityId || !idpSsoUrl || !idpCertificate) {
      throw new BadRequestException(
        'Could not extract required fields from metadata XML. ' +
          'Please ensure the XML contains entityID, SingleSignOnService, and X509Certificate.',
      );
    }

    return { idpEntityId, idpSsoUrl, idpSloUrl, idpCertificate };
  }

  /**
   * Get SP metadata XML for configuring the IdP.
   */
  @Get('sp-metadata')
  async getSpMetadata(): Promise<string> {
    return this.samlAuthService.getSpMetadataXml();
  }

  // ─── XML parsing via fast-xml-parser ───────────────────────────────

  private parseMetadataXml(xml: string): {
    idpEntityId: string | null;
    idpSsoUrl: string | null;
    idpSloUrl: string | null;
    idpCertificate: string | null;
  } {
    const parser = new XMLParser({
      ignoreAttributes: false,
      attributeNamePrefix: '@_',
      removeNSPrefix: true, // strip namespace prefixes (md:, ds:, etc.)
      isArray: (name) =>
        ['SingleSignOnService', 'SingleLogoutService', 'KeyDescriptor'].includes(name),
    });

    let parsed: Record<string, unknown>;
    try {
      parsed = parser.parse(xml) as Record<string, unknown>;
    } catch {
      return { idpEntityId: null, idpSsoUrl: null, idpSloUrl: null, idpCertificate: null };
    }

    // Navigate: EntityDescriptor → IDPSSODescriptor
    const entityDescriptor = (
      parsed['EntityDescriptor'] ?? parsed['md:EntityDescriptor']
    ) as Record<string, unknown> | undefined;

    if (!entityDescriptor) {
      return { idpEntityId: null, idpSsoUrl: null, idpSloUrl: null, idpCertificate: null };
    }

    const idpEntityId = (entityDescriptor['@_entityID'] as string) || null;

    const idpSsoDescriptor = (
      entityDescriptor['IDPSSODescriptor'] ?? entityDescriptor['md:IDPSSODescriptor']
    ) as Record<string, unknown> | undefined;

    // SSO URL — prefer HTTP-Redirect, fall back to HTTP-POST, then first available
    const ssoServices =
      (idpSsoDescriptor?.['SingleSignOnService'] as Array<Record<string, unknown>>) ?? [];
    const redirectSso = ssoServices.find((s) =>
      String(s['@_Binding'] ?? '').includes('HTTP-Redirect'),
    );
    const postSso = ssoServices.find((s) =>
      String(s['@_Binding'] ?? '').includes('HTTP-POST'),
    );
    const idpSsoUrl =
      ((redirectSso?.['@_Location'] ??
        postSso?.['@_Location'] ??
        ssoServices[0]?.['@_Location']) as string) || null;

    // SLO URL
    const sloServices =
      (idpSsoDescriptor?.['SingleLogoutService'] as Array<Record<string, unknown>>) ?? [];
    const idpSloUrl = (sloServices[0]?.['@_Location'] as string) || null;

    // Certificate — from KeyDescriptor with use="signing" or first available
    const keyDescriptors =
      (idpSsoDescriptor?.['KeyDescriptor'] as Array<Record<string, unknown>>) ?? [];
    const signingKey =
      keyDescriptors.find((k) => k['@_use'] === 'signing') ?? keyDescriptors[0];
    const keyInfo = signingKey?.['KeyInfo'] as Record<string, unknown> | undefined;
    const x509Data = keyInfo?.['X509Data'] as Record<string, unknown> | undefined;
    const rawCert = x509Data?.['X509Certificate'] as string | undefined;
    const idpCertificate = rawCert ? rawCert.replace(/\s/g, '') : null;

    return { idpEntityId, idpSsoUrl, idpSloUrl, idpCertificate };
  }
}
