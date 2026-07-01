import type { OidcProviderConfig } from '../types/user.js';

export const OIDC_CONFIG_REPOSITORY = Symbol('OIDC_CONFIG_REPOSITORY');

/**
 * Repository interface for OIDC/SSO configuration.
 */
export interface IOidcConfigRepository {
  /** Get OIDC provider configuration for an organization. */
  getOidcConfig(orgId: string): Promise<OidcProviderConfig | null>;
  /** Create or update the OIDC provider configuration for an organization. */
  saveOidcConfig(orgId: string, config: OidcProviderConfig): Promise<void>;
  /** Delete the OIDC provider configuration for an organization. */
  deleteOidcConfig(orgId: string): Promise<void>;
}
