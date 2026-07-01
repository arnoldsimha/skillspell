import {
  Body,
  Controller,
  Get,
  Patch,
} from '@nestjs/common';
import type { Organization, OidcProviderConfig, SamlProviderConfig, SmtpConfigResponse } from '@skillspell/shared';
import { Roles } from '../auth/decorators/roles.decorator.js';
import { OrganizationService } from './organization.service.js';
import { UpdateOrganizationDto } from './dto/update-organization.dto.js';

/**
 * Organization management controller (admin-only).
 *
 * Handles core organization CRUD and the aggregate GET endpoint
 * that returns org details + SAML config + SMTP config in one call.
 *
 * SSO/SAML endpoints are in {@link SsoConfigController}.
 * SMTP endpoints are in {@link SmtpConfigController}.
 */
@Controller('admin/organization')
@Roles('admin')
export class OrganizationController {
  constructor(
    private readonly orgService: OrganizationService,
  ) {}

  // ─── Organization CRUD ──────────────────────────────────────────────

  /**
   * Get the organization details + SAML config + SMTP config.
   *
   * This is the aggregate endpoint used by the frontend settings page
   * to load all configuration in a single request.
   */
  @Get()
  async getOrganization(): Promise<{
    organization: Organization;
    samlConfig: SamlProviderConfig | null;
    oidcConfig: Omit<OidcProviderConfig, 'encryptedClientSecret'> & { hasClientSecret: boolean } | null;
    smtpConfig: SmtpConfigResponse | null;
    acsUrl: string | null;
  }> {
    const organization = await this.orgService.getOrganization();
    const samlConfig = await this.orgService.getSamlConfig(organization.id);
    const acsUrl = samlConfig
      ? `${samlConfig.spEntityId}/api/auth/saml/callback`
      : null;

    // Load SMTP config and convert to response (mask password)
    const rawSmtpConfig = await this.orgService.getSmtpConfig(organization.id);
    const smtpConfig = rawSmtpConfig
      ? {
          host: rawSmtpConfig.host,
          port: rawSmtpConfig.port,
          security: rawSmtpConfig.security as SmtpConfigResponse['security'],
          authMethod: rawSmtpConfig.authMethod as SmtpConfigResponse['authMethod'],
          username: rawSmtpConfig.username,
          hasPassword: !!rawSmtpConfig.encryptedPassword,
          fromEmail: rawSmtpConfig.fromEmail,
          fromName: rawSmtpConfig.fromName,
          replyToEmail: rawSmtpConfig.replyToEmail,
          replyToName: rawSmtpConfig.replyToName,
          enabled: rawSmtpConfig.enabled,
          rejectUnauthorized: rawSmtpConfig.rejectUnauthorized,
          connectionTimeoutMs: rawSmtpConfig.connectionTimeoutMs,
          socketTimeoutMs: rawSmtpConfig.socketTimeoutMs,
          defaultBcc: rawSmtpConfig.defaultBcc,
          defaultCc: rawSmtpConfig.defaultCc,
          createdAt: rawSmtpConfig.createdAt,
          updatedAt: rawSmtpConfig.updatedAt,
        }
      : null;

    const rawOidcConfig = await this.orgService.getOidcConfig(organization.id);
    const oidcConfig = rawOidcConfig
      ? (({ clientSecret: _, ...rest }) => ({ ...rest, hasClientSecret: !!_ }))(rawOidcConfig)
      : null;

    return { organization, samlConfig, oidcConfig, smtpConfig, acsUrl };
  }

  /**
   * Update the organization name.
   */
  @Patch()
  async updateOrganization(
    @Body() dto: UpdateOrganizationDto,
  ): Promise<Organization> {
    const org = await this.orgService.getOrganization();
    return this.orgService.updateOrganization(org.id, {
      name: dto.name,
      passwordLoginEnabled: dto.passwordLoginEnabled,
      ssoLoginEnabled: dto.ssoLoginEnabled,
      activeSsoProtocol: dto.activeSsoProtocol,
      marketplaceAllowSelfApproval: dto.marketplaceAllowSelfApproval,
      marketplaceEnabled: dto.marketplaceEnabled,
    });
  }
}
