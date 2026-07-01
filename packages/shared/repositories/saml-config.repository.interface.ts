import type { SamlProviderConfig } from '@skillspell/shared';

export const SAML_CONFIG_REPOSITORY = Symbol('SAML_CONFIG_REPOSITORY');

/**
 * Repository interface for SAML/SSO configuration.
 */
export interface ISamlConfigRepository {
  /** Get SAML provider configuration for an organization. */
  getSamlConfig(orgId: string): Promise<SamlProviderConfig | null>;
  /** Create or update the SAML provider configuration for an organization. */
  saveSamlConfig(orgId: string, config: SamlProviderConfig): Promise<void>;
  /** Delete the SAML provider configuration for an organization. */
  deleteSamlConfig(orgId: string): Promise<void>;
}
