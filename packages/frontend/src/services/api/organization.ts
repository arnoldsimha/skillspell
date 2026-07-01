/**
 * Organization API client.
 *
 * Admin endpoints for managing the organization, SSO/SAML, and SMTP configuration.
 */

import { request, API_BASE } from './client.js';
import type { Organization, SmtpConfigResponse, SaveSmtpConfigRequest } from '@skillspell/shared';

const BASE = `${API_BASE}/admin/organization`;

// ─── Types ─────────────────────────────────────────────────────────────

export interface SamlProviderConfig {
  id: string;
  displayName: string;
  idpEntityId: string;
  idpSsoUrl: string;
  idpSloUrl?: string;
  idpCertificate: string;
  spEntityId: string;
  attributeMapping: {
    email: string;
    firstName: string;
    lastName: string;
  };
  autoProvision: boolean;
  defaultRole: 'user' | 'admin';
  iconUrl?: string;
  createdAt: string;
  updatedAt: string;
}

export interface OrganizationResponse {
  organization: Organization;
  samlConfig: SamlProviderConfig | null;
  oidcConfig: OidcProviderConfigResponse | null;
  smtpConfig: SmtpConfigResponse | null;
  acsUrl: string | null;
}

export interface SaveSamlConfigRequest {
  id: string;
  displayName: string;
  idpEntityId: string;
  idpSsoUrl: string;
  idpSloUrl?: string;
  idpCertificate: string;
  spEntityId: string;
  attributeMapping: {
    email: string;
    firstName: string;
    lastName: string;
  };
  autoProvision: boolean;
  defaultRole: 'user' | 'admin';
  iconUrl?: string;
}

export interface ImportMetadataResponse {
  idpEntityId: string;
  idpSsoUrl: string;
  idpSloUrl?: string;
  idpCertificate: string;
}

/** OIDC config response — clientSecret is never returned; use hasClientSecret. */
export interface OidcProviderConfigResponse {
  issuerUrl: string;
  clientId: string;
  hasClientSecret: boolean;
  scopes: string[];
  attributeMapping: { email: string; firstName: string; lastName: string };
  autoProvision: boolean;
  defaultRole: 'user' | 'admin';
  authorizationUrl?: string;
  tokenUrl?: string;
  jwksUri?: string;
  createdAt: string;
  updatedAt: string;
}

export interface SaveOidcConfigRequest {
  issuerUrl: string;
  clientId: string;
  clientSecret: string;
  scopes: string[];
  attributeMapping: { email: string; firstName: string; lastName: string };
  autoProvision: boolean;
  defaultRole: 'user' | 'admin';
  authorizationUrl?: string;
  tokenUrl?: string;
  jwksUri?: string;
}

// ─── Organization API ──────────────────────────────────────────────────

/** Get the organization details, SAML config, and ACS URL. */
export function getOrganization(): Promise<OrganizationResponse> {
  return request<OrganizationResponse>(BASE);
}

/** Update the organization settings (name and/or login modes). */
export function updateOrganization(data: {
  name?: string;
  passwordLoginEnabled?: boolean;
  ssoLoginEnabled?: boolean;
  defaultTimezone?: string;
  marketplaceEnabled?: boolean;
  marketplaceAllowSelfApproval?: boolean;
}): Promise<Organization> {
  return request<Organization>(BASE, {
    method: 'PATCH',
    body: JSON.stringify(data),
  });
}

// ─── SSO / SAML Config API ────────────────────────────────────────────

/** Save (create/update) the SAML configuration. */
export function saveSamlConfig(
  data: SaveSamlConfigRequest,
): Promise<{ config: SamlProviderConfig; acsUrl: string }> {
  return request<{ config: SamlProviderConfig; acsUrl: string }>(
    `${BASE}/sso`,
    {
      method: 'PUT',
      body: JSON.stringify(data),
    },
  );
}

/** Delete the SAML configuration. */
export function deleteSamlConfig(): Promise<{ message: string }> {
  return request<{ message: string }>(`${BASE}/sso`, {
    method: 'DELETE',
  });
}

/** Save (create/update) the OIDC configuration. */
export function saveOidcConfig(
  data: SaveOidcConfigRequest,
): Promise<{ config: OidcProviderConfigResponse }> {
  return request<{ config: OidcProviderConfigResponse }>(
    `${BASE}/oidc`,
    { method: 'PUT', body: JSON.stringify(data) },
  );
}

/** Delete the OIDC configuration. */
export function deleteOidcConfig(): Promise<{ message: string }> {
  return request<{ message: string }>(`${BASE}/oidc`, { method: 'DELETE' });
}

/** Fetch OIDC discovery metadata (admin "Fetch Configuration" button — D-03). */
export function discoverOidcEndpoints(
  issuerUrl: string,
): Promise<{ authorizationUrl: string; tokenUrl: string; jwksUri: string }> {
  return request<{ authorizationUrl: string; tokenUrl: string; jwksUri: string }>(
    `${BASE}/oidc/discover`,
    { method: 'POST', body: JSON.stringify({ issuerUrl }) },
  );
}

/** Set the active SSO protocol (D-07 radio selector handler). */
export function setActiveSsoProtocol(
  protocol: 'saml' | 'oidc' | null,
): Promise<Organization> {
  return request<Organization>(BASE, {
    method: 'PATCH',
    body: JSON.stringify({ activeSsoProtocol: protocol }),
  });
}

/** Import IdP metadata from XML string. */
export function importMetadata(
  metadataXml: string,
): Promise<ImportMetadataResponse> {
  return request<ImportMetadataResponse>(`${BASE}/sso/import-metadata`, {
    method: 'POST',
    body: JSON.stringify({ metadataXml }),
  });
}

/** Get SP metadata XML for configuring the IdP. */
export function getSpMetadata(): Promise<string> {
  return request<string>(`${BASE}/sso/sp-metadata`);
}

// ─── SMTP Config API ──────────────────────────────────────────────────

/** Get the SMTP configuration (password masked). */
export function getSmtpConfig(): Promise<SmtpConfigResponse | null> {
  return request<SmtpConfigResponse | null>(`${BASE}/smtp`);
}

/** Save (create/update) the SMTP configuration. */
export function saveSmtpConfig(
  data: SaveSmtpConfigRequest,
): Promise<SmtpConfigResponse> {
  return request<SmtpConfigResponse>(`${BASE}/smtp`, {
    method: 'PUT',
    body: JSON.stringify(data),
  });
}

/** Delete the SMTP configuration. */
export function deleteSmtpConfig(): Promise<{ message: string }> {
  return request<{ message: string }>(`${BASE}/smtp`, {
    method: 'DELETE',
  });
}

/** Test SMTP connectivity only (no email sent). Sends current form values so the connection can be tested before saving. */
export function testSmtpConnection(
  config: SaveSmtpConfigRequest,
): Promise<{ success: boolean; message: string }> {
  return request<{ success: boolean; message: string }>(
    `${BASE}/smtp/test-connection`,
    {
      method: 'POST',
      body: JSON.stringify(config),
    },
  );
}

/** Send a test email to verify the full SMTP pipeline. */
export function sendTestEmail(
  recipientEmail: string,
): Promise<{ success: boolean; message: string }> {
  return request<{ success: boolean; message: string }>(
    `${BASE}/smtp/test-email`,
    {
      method: 'POST',
      body: JSON.stringify({ recipientEmail }),
    },
  );
}
