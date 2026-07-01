import {
  BadRequestException,
  Inject,
  Injectable,
  Logger,
  NotFoundException,
} from '@nestjs/common';
import {
  ORGANIZATION_REPOSITORY,
  type IOrganizationRepository,
  SAML_CONFIG_REPOSITORY,
  type ISamlConfigRepository,
  SMTP_CONFIG_REPOSITORY,
  type ISmtpConfigRepository,
  OIDC_CONFIG_REPOSITORY,
  type IOidcConfigRepository,
  type Organization,
  type SamlProviderConfig,
  type SmtpConfig,
  type OidcProviderConfig,
} from '@skillspell/shared';
import { EncryptionService } from '../common/services/encryption.service.js';

/**
 * Organization management service.
 *
 * Handles organization CRUD and delegates SSO config to the
 * dedicated ISamlConfigRepository.
 */
@Injectable()
export class OrganizationService {
  private readonly logger = new Logger(OrganizationService.name);

  constructor(
    @Inject(ORGANIZATION_REPOSITORY)
    private readonly orgRepo: IOrganizationRepository,
    @Inject(SAML_CONFIG_REPOSITORY)
    private readonly samlConfigRepo: ISamlConfigRepository,
    @Inject(SMTP_CONFIG_REPOSITORY)
    private readonly smtpConfigRepo: ISmtpConfigRepository,
    @Inject(OIDC_CONFIG_REPOSITORY)
    private readonly oidcConfigRepo: IOidcConfigRepository,
    private readonly encryptionService: EncryptionService,
  ) {}

  // ─── Organization CRUD ──────────────────────────────────────────────

  /**
   * Get the singleton organization.
   * @throws NotFoundException if no organization exists.
   */
  async getOrganization(): Promise<Organization> {
    const org = await this.orgRepo.findSingleton();
    if (!org) {
      throw new NotFoundException('No organization found');
    }
    return org;
  }

  /**
   * Get organization by ID.
   * @throws NotFoundException if not found.
   */
  async getOrganizationById(id: string): Promise<Organization> {
    const org = await this.orgRepo.findById(id);
    if (!org) {
      throw new NotFoundException(`Organization ${id} not found`);
    }
    return org;
  }

  /**
   * Create a new organization (called during setup).
   */
  async createOrganization(data: { name: string }): Promise<Organization> {
    const org = await this.orgRepo.create(data);
    this.logger.log(`Created organization ${org.id} ("${org.name}")`);
    return org;
  }

  /**
   * Update the organization name.
   * @throws NotFoundException if org doesn't exist.
   */
  async updateOrganization(
    id: string,
    data: { name?: string; passwordLoginEnabled?: boolean; ssoLoginEnabled?: boolean; activeSsoProtocol?: 'saml' | 'oidc' | null; marketplaceAllowSelfApproval?: boolean; marketplaceEnabled?: boolean },
  ): Promise<Organization> {
    // Verify org exists
    const current = await this.getOrganizationById(id);

    // Validate that at least one login mode remains enabled
    const resultPasswordEnabled = data.passwordLoginEnabled ?? current.passwordLoginEnabled;
    const resultSsoEnabled = data.ssoLoginEnabled ?? current.ssoLoginEnabled;

    if (!resultPasswordEnabled && !resultSsoEnabled) {
      throw new BadRequestException(
        'At least one login method must be enabled. Cannot disable both email/password and SSO login.',
      );
    }

    // Verify the corresponding SSO config exists before activating a protocol.
    // Prevents an admin from switching to 'oidc' or 'saml' when no config has been saved yet,
    // which would show a broken SSO button on the login page.
    if (data.activeSsoProtocol === 'oidc') {
      const oidcConfig = await this.oidcConfigRepo.getOidcConfig(id);
      if (!oidcConfig) {
        throw new BadRequestException(
          'Cannot set OIDC as active protocol: no OIDC configuration exists.',
        );
      }
    }
    if (data.activeSsoProtocol === 'saml') {
      const samlConfig = await this.samlConfigRepo.getSamlConfig(id);
      if (!samlConfig) {
        throw new BadRequestException(
          'Cannot set SAML as active protocol: no SAML configuration exists.',
        );
      }
    }

    return this.orgRepo.update(id, data);
  }

  // ─── SSO / SAML Config ─────────────────────────────────────────────

  /**
   * Get SAML config for the organization.
   */
  async getSamlConfig(orgId: string): Promise<SamlProviderConfig | null> {
    return this.samlConfigRepo.getSamlConfig(orgId);
  }

  /**
   * Save SAML config for the organization.
   */
  async saveSamlConfig(
    orgId: string,
    config: SamlProviderConfig,
  ): Promise<void> {
    // Verify org exists
    await this.getOrganizationById(orgId);
    await this.samlConfigRepo.saveSamlConfig(orgId, config);
    this.logger.log(
      `Saved SAML config "${config.id}" for org ${orgId}`,
    );
  }

  /**
   * Delete SAML config for the organization.
   */
  async deleteSamlConfig(orgId: string): Promise<void> {
    await this.samlConfigRepo.deleteSamlConfig(orgId);
    this.logger.log(`Deleted SAML config for org ${orgId}`);
  }

  // ─── SMTP Config ─────────────────────────────────────────────────

  /**
   * Get SMTP config for the organization.
   */
  async getSmtpConfig(orgId: string): Promise<SmtpConfig | null> {
    return this.smtpConfigRepo.getSmtpConfig(orgId);
  }

  /**
   * Save SMTP config for the organization.
   */
  async saveSmtpConfig(
    orgId: string,
    config: SmtpConfig,
  ): Promise<void> {
    // Verify org exists
    await this.getOrganizationById(orgId);
    await this.smtpConfigRepo.saveSmtpConfig(orgId, config);
    this.logger.log(
      `Saved SMTP config for org ${orgId} (host=${config.host}, enabled=${config.enabled})`,
    );
  }

  /**
   * Delete SMTP config for the organization.
   */
  async deleteSmtpConfig(orgId: string): Promise<void> {
    await this.smtpConfigRepo.deleteSmtpConfig(orgId);
    this.logger.log(`Deleted SMTP config for org ${orgId}`);
  }

  // ─── OIDC Config ──────────────────────────────────────────────────

  async getOidcConfig(orgId: string): Promise<(Omit<OidcProviderConfig, 'encryptedClientSecret'> & { clientSecret: string }) | null> {
    const config = await this.oidcConfigRepo.getOidcConfig(orgId);
    if (!config) return null;
    const clientSecret = this.encryptionService.decrypt(config.encryptedClientSecret);
    const { encryptedClientSecret: _, ...rest } = config;
    return { ...rest, clientSecret };
  }

  /**
   * Save OIDC config for the organization.
   *
   * Encrypts the plaintext clientSecret before persisting so the DB
   * never contains cleartext credentials. Mirrors SmtpConfig.encryptedPassword pattern.
   *
   * @param plaintextSecret - The raw client secret from the admin DTO.
   */
  async saveOidcConfig(
    orgId: string,
    config: OidcProviderConfig,
    plaintextSecret: string,
  ): Promise<void> {
    // Verify org exists
    await this.getOrganizationById(orgId);
    const encryptedClientSecret = this.encryptionService.encrypt(plaintextSecret);
    await this.oidcConfigRepo.saveOidcConfig(orgId, { ...config, encryptedClientSecret });
    this.logger.log(`Saved OIDC config for org ${orgId}`);
  }

  /**
   * Delete OIDC config for the organization.
   *
   * Pitfall 4: if OIDC is the active protocol, clear activeSsoProtocol to null
   * so the login page does not show a broken SSO button.
   */
  async deleteOidcConfig(orgId: string): Promise<void> {
    const org = await this.orgRepo.findById(orgId);
    await this.oidcConfigRepo.deleteOidcConfig(orgId);
    if (org?.activeSsoProtocol === 'oidc') {
      await this.orgRepo.update(orgId, { activeSsoProtocol: null });
    }
    this.logger.log(`Deleted OIDC config for org ${orgId}`);
  }
}
