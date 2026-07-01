import type { Organization } from '@skillspell/shared';

export const ORGANIZATION_REPOSITORY = Symbol('ORGANIZATION_REPOSITORY');

/**
 * Repository interface for Organization CRUD operations.
 */
export interface IOrganizationRepository {
  /** Create a new organization. */
  create(data: { name: string }): Promise<Organization>;
  /** Find an organization by its UUID. */
  findById(id: string): Promise<Organization | null>;
  /** Get the singleton organization (system supports only one). */
  findSingleton(): Promise<Organization | null>;
  /** Update organization fields. */
  update(id: string, data: { name?: string; passwordLoginEnabled?: boolean; ssoLoginEnabled?: boolean; defaultTimezone?: string | null; activeSsoProtocol?: 'saml' | 'oidc' | null; marketplaceAllowSelfApproval?: boolean; marketplaceEnabled?: boolean }): Promise<Organization>;
}
