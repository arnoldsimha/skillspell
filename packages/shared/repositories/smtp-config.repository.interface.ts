import type { SmtpConfig } from '@skillspell/shared';

export const SMTP_CONFIG_REPOSITORY = Symbol('SMTP_CONFIG_REPOSITORY');

/**
 * Repository interface for SMTP configuration.
 * Follows the same pattern as {@link ISamlConfigRepository}.
 */
export interface ISmtpConfigRepository {
  /** Get SMTP configuration for an organization. */
  getSmtpConfig(orgId: string): Promise<SmtpConfig | null>;
  /** Create or update the SMTP configuration for an organization. */
  saveSmtpConfig(orgId: string, config: SmtpConfig): Promise<void>;
  /** Delete the SMTP configuration for an organization. */
  deleteSmtpConfig(orgId: string): Promise<void>;
}
