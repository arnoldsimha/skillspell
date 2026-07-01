/**
 * Organization Settings page — admin-only.
 *
 * Layout mirrors the Profile page: left settings menu, right content panel.
 *
 * Sections:
 *   - General  — org name, org ID
 *   - SSO      — SAML/SSO configuration
 *   - SMTP     — email / SMTP configuration
 *   - Members  — user management table
 */

import { useCallback, useEffect, useMemo, useState } from 'react';
import { useNavigate } from 'react-router';
import { useAuth } from '../../hooks/useAuth.js';
import { useUserPreferences } from '../../hooks/useUserPreferences.js';
import { formatDateWithPrefs } from '../../utils/formatDate.js';
import { useToast } from '../common/ToastContext.js';
import Spinner from '../common/Spinner.js';
import ConfirmDialog from '../common/ConfirmDialog.js';
import { InfoTip } from '../common/InfoTip.js';
import InviteUsersDialog from './InviteUsersDialog.js';
import { Button } from '../common/Button.js';
import TaxonomySection from './TaxonomySection.js';
import MarketplaceSubmissionsSection from './MarketplaceSubmissionsSection.js';
import { MarketplaceSettingsSection } from './MarketplaceSettingsSection.js';
import AdminAnalyticsTab from './AdminAnalyticsTab.js';
import {
  getOrganization,
  updateOrganization,
  saveSamlConfig,
  deleteSamlConfig,
  importMetadata,
  saveOidcConfig,
  deleteOidcConfig,
  discoverOidcEndpoints,
  setActiveSsoProtocol,
  saveSmtpConfig,
  deleteSmtpConfig,
  testSmtpConnection,
  sendTestEmail,
  type OrganizationResponse,
  type SaveSamlConfigRequest,
  type OidcProviderConfigResponse,
  type SaveOidcConfigRequest,
} from '../../services/api/organization.js';
import {
  getUsers,
  updateUser,
  deleteUser,
  getInviteSmtpStatus,
  getPendingInvites,
  revokeInvite,
  resendInvite,
} from '../../services/api/users.js';
import type {
  User,
  UserRole,
  PendingInvite,
  SmtpSecurityMode,
  SmtpAuthMethod,
  SaveSmtpConfigRequest,
} from '@skillspell/shared';
// isAtLeast inlined to avoid importing a runtime value from the shared CJS dist (Vite requires ESM).
const _roleLevel = (r: string) => ({ owner: 3, admin: 2, user: 1 } as Record<string, number>)[r] ?? 0;
const isAtLeast = (userRole: string, required: string) => _roleLevel(userRole) >= _roleLevel(required);

// ─── Types ───────────────────────────────────────────────────────────────

interface OrganizationSettingsProps {
  onBack: () => void;
  /** Initial section to display (from deep link URL). */
  initialSection?: Section;
}

type Section =
  | 'general'
  | 'sso'
  | 'smtp'
  | 'members'
  | 'taxonomy'
  | 'marketplace-submissions'
  | 'marketplace-settings'
  | 'analytics';

interface MenuItem {
  key: Section;
  label: string;
  icon: React.ReactNode;
  /** If true, only render this item when the current user has role === 'admin'. */
  adminOnly?: boolean;
}

const MENU_ITEMS: MenuItem[] = [
  {
    key: 'general',
    label: 'General',
    icon: (
      <svg className="h-4 w-4" fill="none" viewBox="0 0 24 24" strokeWidth={1.5} stroke="currentColor">
        <path strokeLinecap="round" strokeLinejoin="round" d="M3.75 21h16.5M4.5 3h15M5.25 3v18m13.5-18v18M9 6.75h1.5m-1.5 3h1.5m-1.5 3h1.5m3-6H15m-1.5 3H15m-1.5 3H15M9 21v-3.375c0-.621.504-1.125 1.125-1.125h3.75c.621 0 1.125.504 1.125 1.125V21" />
      </svg>
    ),
  },
  {
    key: 'sso',
    label: 'SSO',
    icon: (
      <svg className="h-4 w-4" fill="none" viewBox="0 0 24 24" strokeWidth={1.5} stroke="currentColor">
        <path strokeLinecap="round" strokeLinejoin="round" d="M16.5 10.5V6.75a4.5 4.5 0 1 0-9 0v3.75m-.75 11.25h10.5a2.25 2.25 0 0 0 2.25-2.25v-6.75a2.25 2.25 0 0 0-2.25-2.25H6.75a2.25 2.25 0 0 0-2.25 2.25v6.75a2.25 2.25 0 0 0 2.25 2.25Z" />
      </svg>
    ),
  },
  {
    key: 'smtp',
    label: 'Email / SMTP',
    icon: (
      <svg className="h-4 w-4" fill="none" viewBox="0 0 24 24" strokeWidth={1.5} stroke="currentColor">
        <path strokeLinecap="round" strokeLinejoin="round" d="M21.75 6.75v10.5a2.25 2.25 0 0 1-2.25 2.25h-15a2.25 2.25 0 0 1-2.25-2.25V6.75m19.5 0A2.25 2.25 0 0 0 19.5 4.5h-15a2.25 2.25 0 0 0-2.25 2.25m19.5 0v.243a2.25 2.25 0 0 1-1.07 1.916l-7.5 4.615a2.25 2.25 0 0 1-2.36 0L3.32 8.91a2.25 2.25 0 0 1-1.07-1.916V6.75" />
      </svg>
    ),
  },
  {
    key: 'members',
    label: 'Members',
    icon: (
      <svg className="h-4 w-4" fill="none" viewBox="0 0 24 24" strokeWidth={1.5} stroke="currentColor">
        <path strokeLinecap="round" strokeLinejoin="round" d="M15 19.128a9.38 9.38 0 0 0 2.625.372 9.337 9.337 0 0 0 4.121-.952 4.125 4.125 0 0 0-7.533-2.493M15 19.128v-.003c0-1.113-.285-2.16-.786-3.07M15 19.128v.106A12.318 12.318 0 0 1 8.624 21c-2.331 0-4.512-.645-6.374-1.766l-.001-.109a6.375 6.375 0 0 1 11.964-3.07M12 6.375a3.375 3.375 0 1 1-6.75 0 3.375 3.375 0 0 1 6.75 0Zm8.25 2.25a2.625 2.625 0 1 1-5.25 0 2.625 2.625 0 0 1 5.25 0Z" />
      </svg>
    ),
  },
  {
    key: 'taxonomy' as const,
    label: 'Taxonomy',
    icon: (
      <svg className="h-4 w-4" fill="none" viewBox="0 0 24 24" strokeWidth={1.5} stroke="currentColor">
        <path strokeLinecap="round" strokeLinejoin="round" d="M9.568 3H5.25A2.25 2.25 0 0 0 3 5.25v4.318c0 .597.237 1.169.659 1.591l9.581 9.581c.699.699 1.78.872 2.607.33a18.095 18.095 0 0 0 5.223-5.223c.542-.827.369-1.908-.33-2.607L11.16 3.66A2.25 2.25 0 0 0 9.568 3Z" />
        <path strokeLinecap="round" strokeLinejoin="round" d="M6 6h.008v.008H6V6Z" />
      </svg>
    ),
  },
  {
    key: 'analytics' as Section,
    label: 'Analytics',
    adminOnly: true,
    icon: (
      <svg className="h-4 w-4" fill="none" viewBox="0 0 24 24" strokeWidth={1.5} stroke="currentColor">
        <path strokeLinecap="round" strokeLinejoin="round" d="M3 13.125C3 12.504 3.504 12 4.125 12h2.25c.621 0 1.125.504 1.125 1.125v6.75C7.5 20.496 6.996 21 6.375 21h-2.25A1.125 1.125 0 013 19.875v-6.75zM9.75 8.625c0-.621.504-1.125 1.125-1.125h2.25c.621 0 1.125.504 1.125 1.125v11.25c0 .621-.504 1.125-1.125 1.125h-2.25a1.125 1.125 0 01-1.125-1.125V8.625zM16.5 4.125c0-.621.504-1.125 1.125-1.125h2.25C20.496 3 21 3.504 21 4.125v15.75c0 .621-.504 1.125-1.125 1.125h-2.25a1.125 1.125 0 01-1.125-1.125V4.125z" />
      </svg>
    ),
  },
];

const DEFAULT_SMTP_FORM: SaveSmtpConfigRequest = {
  host: '',
  port: 587,
  security: 'starttls',
  authMethod: 'plain',
  username: '',
  password: '',
  fromEmail: '',
  fromName: '',
  replyToEmail: '',
  replyToName: '',
  enabled: false,
  rejectUnauthorized: true,
  connectionTimeoutMs: 10000,
  socketTimeoutMs: 30000,
  defaultBcc: '',
  defaultCc: '',
};

const DEFAULT_SSO_FORM: SaveSamlConfigRequest = {
  id: '',
  displayName: '',
  idpEntityId: '',
  idpSsoUrl: '',
  idpSloUrl: '',
  idpCertificate: '',
  spEntityId: '',
  attributeMapping: { email: 'email', firstName: 'firstName', lastName: 'lastName' },
  autoProvision: true,
  defaultRole: 'user',
  iconUrl: '',
};

// ─── Main Component ──────────────────────────────────────────────────────

export default function OrganizationSettings({ onBack, initialSection }: OrganizationSettingsProps) {
  const { user } = useAuth();
  const { addToast } = useToast();
  const navigate = useNavigate();

  const normalizedInitialSection =
    (initialSection as string) === 'marketplace' ? 'marketplace-submissions' : initialSection;
  const [section, setSectionState] = useState<Section>(
    (normalizedInitialSection as Section) ?? 'general',
  );

  // Keep section in sync when navigating via browser back/forward
  useEffect(() => {
    if (initialSection) {
      const normalized =
        (initialSection as string) === 'marketplace' ? 'marketplace-submissions' : initialSection;
      setSectionState(normalized as Section);
    }
  }, [initialSection]);

  /** Update section state and push the deep-link URL via React Router. */
  const setSection = useCallback((s: Section) => {
    setSectionState(s);
    const path = s === 'general' ? '/admin/organization' : `/admin/organization/${s}`;
    navigate(path, { replace: true });
  }, [navigate]);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [orgData, setOrgData] = useState<OrganizationResponse | null>(null);

  // General state
  const [orgName, setOrgName] = useState('');
  const [passwordLoginEnabled, setPasswordLoginEnabled] = useState(true);
  const [ssoLoginEnabled, setSsoLoginEnabled] = useState(true);
  const [defaultTimezone, setDefaultTimezone] = useState('');

  // Confirm dialog for login mode toggles
  const [loginModeConfirm, setLoginModeConfirm] = useState<{
    title: string;
    message: string;
    onConfirm: () => void;
  } | null>(null);

  // SSO state
  const [ssoForm, setSsoForm] = useState<SaveSamlConfigRequest>({ ...DEFAULT_SSO_FORM });
  const [metadataXml, setMetadataXml] = useState('');
  const [importingMetadata, setImportingMetadata] = useState(false);

  // SSO protocol state
  const [activeSsoProtocol, setActiveSsoProtocolState] = useState<'saml' | 'oidc' | null>(null);
  const [protocolSaving, setProtocolSaving] = useState(false);
  const [activeTab, setActiveTab] = useState<'saml' | 'oidc'>('saml');
  const [pendingProtocol, setPendingProtocol] = useState<'saml' | 'oidc' | null>(null);
  const [showProtocolConfirmDialog, setShowProtocolConfirmDialog] = useState(false);
  const [oidcForm, setOidcForm] = useState<SaveOidcConfigRequest>({
    issuerUrl: '', clientId: '', clientSecret: '',
    scopes: ['openid', 'email', 'profile'],
    attributeMapping: { email: 'email', firstName: 'given_name', lastName: 'family_name' },
    autoProvision: true, defaultRole: 'user',
  });
  const [oidcSaving, setOidcSaving] = useState(false);
  const [showOidcOverrides, setShowOidcOverrides] = useState(false);
  const [discoverLoading, setDiscoverLoading] = useState(false);
  const [showDeleteOidcConfirm, setShowDeleteOidcConfirm] = useState(false);
  const [showDisableProtocolConfirm, setShowDisableProtocolConfirm] = useState(false);

  // SMTP state
  const [smtpForm, setSmtpForm] = useState<SaveSmtpConfigRequest>({ ...DEFAULT_SMTP_FORM });
  const [smtpHasPassword, setSmtpHasPassword] = useState(false);
  const [smtpConfigExists, setSmtpConfigExists] = useState(false);

  // ─── Load data ───────────────────────────────────────────────────────

  const loadData = useCallback(async () => {
    try {
      setLoading(true);
      const data = await getOrganization();
      setOrgData(data);
      setOrgName(data.organization.name ?? '');
      setPasswordLoginEnabled(data.organization.passwordLoginEnabled !== false);
      setSsoLoginEnabled(data.organization.ssoLoginEnabled !== false);
      setDefaultTimezone(data.organization.defaultTimezone ?? Intl.DateTimeFormat().resolvedOptions().timeZone);

      // Initialize active SSO protocol from org data
      const orgProtocol = (data.organization as unknown as { activeSsoProtocol?: 'saml' | 'oidc' | null }).activeSsoProtocol ?? null;
      setActiveSsoProtocolState(orgProtocol);
      if (orgProtocol === 'saml' || orgProtocol === 'oidc') setActiveTab(orgProtocol);

      // Initialize OIDC form from existing config
      if (data.oidcConfig) {
        setOidcForm({
          issuerUrl: data.oidcConfig.issuerUrl,
          clientId: data.oidcConfig.clientId,
          clientSecret: '', // never pre-fill secret
          scopes: data.oidcConfig.scopes,
          attributeMapping: data.oidcConfig.attributeMapping,
          autoProvision: data.oidcConfig.autoProvision,
          defaultRole: data.oidcConfig.defaultRole,
          authorizationUrl: data.oidcConfig.authorizationUrl,
          tokenUrl: data.oidcConfig.tokenUrl,
          jwksUri: data.oidcConfig.jwksUri,
        });
      }

      if (data.samlConfig) {
        setSsoForm({
          id: data.samlConfig.id,
          displayName: data.samlConfig.displayName,
          idpEntityId: data.samlConfig.idpEntityId,
          idpSsoUrl: data.samlConfig.idpSsoUrl,
          idpSloUrl: data.samlConfig.idpSloUrl ?? '',
          idpCertificate: data.samlConfig.idpCertificate,
          spEntityId: data.samlConfig.spEntityId,
          attributeMapping: data.samlConfig.attributeMapping,
          autoProvision: data.samlConfig.autoProvision,
          defaultRole: data.samlConfig.defaultRole,
          iconUrl: data.samlConfig.iconUrl ?? '',
        });
      }

      if (data.smtpConfig) {
        setSmtpConfigExists(true);
        setSmtpHasPassword(data.smtpConfig.hasPassword);
        setSmtpForm({
          host: data.smtpConfig.host,
          port: data.smtpConfig.port,
          security: data.smtpConfig.security,
          authMethod: data.smtpConfig.authMethod,
          username: data.smtpConfig.username,
          password: '', // never returned from API
          fromEmail: data.smtpConfig.fromEmail,
          fromName: data.smtpConfig.fromName,
          replyToEmail: data.smtpConfig.replyToEmail ?? '',
          replyToName: data.smtpConfig.replyToName ?? '',
          enabled: data.smtpConfig.enabled,
          rejectUnauthorized: data.smtpConfig.rejectUnauthorized,
          connectionTimeoutMs: data.smtpConfig.connectionTimeoutMs,
          socketTimeoutMs: data.smtpConfig.socketTimeoutMs,
          defaultBcc: data.smtpConfig.defaultBcc ?? '',
          defaultCc: data.smtpConfig.defaultCc ?? '',
        });
      } else {
        setSmtpConfigExists(false);
        setSmtpHasPassword(false);
        setSmtpForm({ ...DEFAULT_SMTP_FORM });
      }
    } catch (err) {
      addToast('error', err instanceof Error ? err.message : 'Failed to load organization settings');
    } finally {
      setLoading(false);
    }
  }, [addToast]);

  useEffect(() => {
    loadData();
  }, [loadData]);

  // ─── Handlers ────────────────────────────────────────────────────────

  const handleSaveGeneral = async () => {
    if (!orgName.trim()) return;
    setSaving(true);
    try {
      const updated = await updateOrganization({
        name: orgName.trim(),
        passwordLoginEnabled,
        ssoLoginEnabled,
        defaultTimezone: defaultTimezone || undefined,
      });
      setOrgData((prev) => (prev ? { ...prev, organization: updated } : prev));
      addToast('success', 'Organization settings updated');
    } catch (err) {
      addToast('error', err instanceof Error ? err.message : 'Failed to update organization');
    } finally {
      setSaving(false);
    }
  };

  const handleSaveSso = async () => {
    if (!ssoForm.id.trim() || !ssoForm.displayName.trim()) {
      addToast('error', 'Provider ID and display name are required');
      return;
    }
    setSaving(true);
    try {
      const { config, acsUrl } = await saveSamlConfig(ssoForm);
      setOrgData((prev) => (prev ? { ...prev, samlConfig: config, acsUrl } : prev));
      addToast('success', 'SSO configuration saved');
    } catch (err) {
      addToast('error', err instanceof Error ? err.message : 'Failed to save SSO configuration');
    } finally {
      setSaving(false);
    }
  };

  const handleDeleteSso = async () => {
    if (!confirm('Are you sure you want to delete the SSO configuration?')) return;
    setSaving(true);
    try {
      await deleteSamlConfig();
      setOrgData((prev) => (prev ? { ...prev, samlConfig: null, acsUrl: null } : prev));
      setSsoForm({ ...DEFAULT_SSO_FORM });
      addToast('success', 'SSO configuration deleted');
    } catch (err) {
      addToast('error', err instanceof Error ? err.message : 'Failed to delete SSO configuration');
    } finally {
      setSaving(false);
    }
  };

  const handleImportMetadata = async () => {
    if (!metadataXml.trim()) return;
    setImportingMetadata(true);
    try {
      const result = await importMetadata(metadataXml);
      setSsoForm((prev) => ({
        ...prev,
        idpEntityId: result.idpEntityId,
        idpSsoUrl: result.idpSsoUrl,
        idpSloUrl: result.idpSloUrl ?? '',
        idpCertificate: result.idpCertificate,
      }));
      setMetadataXml('');
      addToast('success', 'IdP metadata imported successfully');
    } catch (err) {
      addToast('error', err instanceof Error ? err.message : 'Failed to import metadata');
    } finally {
      setImportingMetadata(false);
    }
  };

  const updateSsoField = (field: keyof SaveSamlConfigRequest, value: unknown) => {
    setSsoForm((prev) => ({ ...prev, [field]: value }));
  };

  // ─── OIDC / Protocol handlers ──────────────────────────────────────

  // Stage a protocol change — syncs tab immediately but waits for user confirmation before calling API
  const handleStageProtocol = (protocol: 'saml' | 'oidc' | null) => {
    setPendingProtocol(protocol);
    if (protocol === 'saml' || protocol === 'oidc') setActiveTab(protocol);
    if (protocol === null) {
      setShowDisableProtocolConfirm(true);
    } else {
      setShowProtocolConfirmDialog(true);
    }
  };

  const handleConfirmProtocol = async () => {
    setShowProtocolConfirmDialog(false);
    if (pendingProtocol === null) return;
    const prev = activeSsoProtocol;
    setActiveSsoProtocolState(pendingProtocol);
    setProtocolSaving(true);
    try {
      await setActiveSsoProtocol(pendingProtocol);
      addToast('success', 'Active SSO protocol updated');
    } catch {
      setActiveSsoProtocolState(prev);
      if (prev === 'saml' || prev === 'oidc') setActiveTab(prev);
      addToast('error', 'Failed to update active protocol');
    } finally {
      setProtocolSaving(false);
      setPendingProtocol(null);
    }
  };

  const handleCancelProtocol = () => {
    setShowProtocolConfirmDialog(false);
    // Revert tab to the confirmed protocol
    if (activeSsoProtocol === 'saml' || activeSsoProtocol === 'oidc') setActiveTab(activeSsoProtocol);
    setPendingProtocol(null);
  };

  const handleDiscoverOidc = async () => {
    setDiscoverLoading(true);
    try {
      const meta = await discoverOidcEndpoints(oidcForm.issuerUrl);
      setOidcForm((f) => ({
        ...f,
        authorizationUrl: meta.authorizationUrl,
        tokenUrl: meta.tokenUrl,
        jwksUri: meta.jwksUri,
      }));
      setShowOidcOverrides(true);
      addToast('success', 'IdP configuration loaded from discovery URL');
    } catch {
      addToast('error', 'Failed to load IdP configuration. Check the discovery URL and try again.');
    } finally {
      setDiscoverLoading(false);
    }
  };

  const handleSaveOidc = async () => {
    setOidcSaving(true);
    try {
      const result = await saveOidcConfig(oidcForm);
      setOrgData((prev) => (prev ? { ...prev, oidcConfig: result.config } : prev));
      addToast('success', 'OIDC configuration saved');
    } catch {
      addToast('error', 'Failed to save OIDC configuration.');
    } finally {
      setOidcSaving(false);
    }
  };

  const handleDeleteOidc = async () => {
    setOidcSaving(true);
    try {
      await deleteOidcConfig();
      setOrgData((prev) => (prev ? { ...prev, oidcConfig: null } : prev));
      setOidcForm({
        issuerUrl: '', clientId: '', clientSecret: '',
        scopes: ['openid', 'email', 'profile'],
        attributeMapping: { email: 'email', firstName: 'given_name', lastName: 'family_name' },
        autoProvision: true, defaultRole: 'user',
      });
      addToast('success', 'OIDC configuration deleted');
    } catch {
      addToast('error', 'Failed to delete OIDC configuration.');
    } finally {
      setOidcSaving(false);
      setShowDeleteOidcConfirm(false);
    }
  };

  // ─── SMTP handlers ─────────────────────────────────────────────────

  const handleSaveSmtp = async () => {
    setSaving(true);
    try {
      // Build payload — omit password if empty and config already has one
      const payload: SaveSmtpConfigRequest = { ...smtpForm };
      if (!payload.password && smtpHasPassword) {
        delete payload.password;
      }
      const updated = await saveSmtpConfig(payload);
      setSmtpConfigExists(true);
      setSmtpHasPassword(updated.hasPassword);
      setOrgData((prev) => (prev ? { ...prev, smtpConfig: updated } : prev));
      addToast('success', 'SMTP configuration saved');
    } catch (err) {
      addToast('error', err instanceof Error ? err.message : 'Failed to save SMTP configuration');
    } finally {
      setSaving(false);
    }
  };

  const handleDeleteSmtp = async () => {
    if (!confirm('Are you sure you want to delete the SMTP configuration?')) return;
    setSaving(true);
    try {
      await deleteSmtpConfig();
      setOrgData((prev) => (prev ? { ...prev, smtpConfig: null } : prev));
      setSmtpConfigExists(false);
      setSmtpHasPassword(false);
      setSmtpForm({ ...DEFAULT_SMTP_FORM });
      addToast('success', 'SMTP configuration deleted');
    } catch (err) {
      addToast('error', err instanceof Error ? err.message : 'Failed to delete SMTP configuration');
    } finally {
      setSaving(false);
    }
  };

  const updateSmtpField = <K extends keyof SaveSmtpConfigRequest>(field: K, value: SaveSmtpConfigRequest[K]) => {
    setSmtpForm((prev) => ({ ...prev, [field]: value }));
  };

  // ─── Guards ──────────────────────────────────────────────────────────

  if (!user || !isAtLeast(user.role, 'admin')) {
    return (
      <div className="flex h-full items-center justify-center">
        <p className="text-slate-500">Admin access required</p>
      </div>
    );
  }

  if (loading) {
    return (
      <div className="flex h-full items-center justify-center">
        <Spinner size="md" />
      </div>
    );
  }

  // ─── Render ──────────────────────────────────────────────────────────

  return (
    <div className="flex h-full animate-fade-in-up">
      {/* ─── Left Settings Menu ─────────────────────────────────── */}
      <aside className="w-60 shrink-0 border-r border-slate-200/80 bg-white px-3 py-6">
        {/* Back button + title */}
        <div className="mb-6 flex items-center gap-2 px-2">
          <button
            onClick={onBack}
            className="flex h-7 w-7 items-center justify-center rounded-lg text-slate-400 hover:bg-slate-100 hover:text-slate-600 transition-colors"
            aria-label="Go back"
          >
            <svg className="h-4 w-4" fill="none" viewBox="0 0 24 24" strokeWidth={2.5} stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" d="M15.75 19.5 8.25 12l7.5-7.5" />
            </svg>
          </button>
          <h2 className="text-sm font-semibold text-slate-800">Organization</h2>
        </div>

        {/* Menu items */}
        <nav className="space-y-0.5">
          {MENU_ITEMS.filter((item) => !item.adminOnly || isAtLeast(user.role, 'admin')).map((item) => {
            const isActive = section === item.key;
            return (
              <button
                key={item.key}
                onClick={() => setSection(item.key)}
                className={`flex w-full items-center gap-2.5 rounded-lg px-3 py-2 text-sm font-medium transition-all duration-150 ${
                  isActive
                    ? 'bg-indigo-50 text-indigo-700'
                    : 'text-slate-600 hover:bg-slate-50 hover:text-slate-800'
                }`}
              >
                <span className={isActive ? 'text-indigo-500' : 'text-slate-400'}>
                  {item.icon}
                </span>
                {item.label}
              </button>
            );
          })}
          {/* Marketplace nested group */}
          {isAtLeast(user.role, 'admin') && (
            <div>
              <div className="flex w-full items-center gap-2.5 rounded-lg px-3 py-2 text-sm font-medium text-slate-600">
                <span className="text-slate-400">
                  <svg className="h-4 w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5}>
                    <path strokeLinecap="round" strokeLinejoin="round" d="M13.5 21v-7.5a.75.75 0 0 1 .75-.75h3a.75.75 0 0 1 .75.75V21m-4.5 0H2.36m11.14 0H18m0 0h3.64m-1.39 0V9.349M3.75 21V9.349m0 0a3.001 3.001 0 0 0 3.75-.615A2.993 2.993 0 0 0 9.75 9.75c.896 0 1.7-.393 2.25-1.016a2.993 2.993 0 0 0 2.25 1.016c.896 0 1.7-.393 2.25-1.015a3.001 3.001 0 0 0 3.75.614m-16.5 0a3.004 3.004 0 0 1-.621-4.72l1.189-1.19A1.5 1.5 0 0 1 5.378 3h13.243a1.5 1.5 0 0 1 1.06.44l1.19 1.189a3 3 0 0 1-.621 4.72M6.75 18h3.75a.75.75 0 0 0 .75-.75V13.5a.75.75 0 0 0-.75-.75H6.75a.75.75 0 0 0-.75.75v3.75c0 .414.336.75.75.75Z" />
                  </svg>
                </span>
                Marketplace
              </div>
              <button
                onClick={() => setSection('marketplace-submissions')}
                className={`flex w-full items-center gap-2.5 rounded-lg pl-9 pr-3 py-2 text-sm font-medium transition-all duration-150 ${
                  section === 'marketplace-submissions'
                    ? 'bg-indigo-50 text-indigo-700'
                    : 'text-slate-600 hover:bg-slate-50 hover:text-slate-800'
                }`}
              >
                Submissions
              </button>
              <button
                onClick={() => setSection('marketplace-settings')}
                className={`flex w-full items-center gap-2.5 rounded-lg pl-9 pr-3 py-2 text-sm font-medium transition-all duration-150 ${
                  section === 'marketplace-settings'
                    ? 'bg-indigo-50 text-indigo-700'
                    : 'text-slate-600 hover:bg-slate-50 hover:text-slate-800'
                }`}
              >
                Settings
              </button>
            </div>
          )}
        </nav>
      </aside>

      {/* ─── Right Content Panel ────────────────────────────────── */}
      <div className="flex-1 overflow-y-auto px-8 py-6">
        <div className={`mx-auto ${section === 'members' || section === 'marketplace-submissions' || section === 'analytics' ? 'max-w-5xl' : 'max-w-2xl'}`}>
          {section === 'general' && (
            <GeneralSection
              orgData={orgData}
              orgName={orgName}
              onOrgNameChange={setOrgName}
              passwordLoginEnabled={passwordLoginEnabled}
              ssoLoginEnabled={ssoLoginEnabled}
              defaultTimezone={defaultTimezone}
              onDefaultTimezoneChange={setDefaultTimezone}
              onPasswordLoginToggle={(enabled) => {
                const doToggle = async (newVal: boolean) => {
                  setSaving(true);
                  try {
                    const updated = await updateOrganization({
                      name: orgName.trim(),
                      passwordLoginEnabled: newVal,
                      ssoLoginEnabled,
                    });
                    setPasswordLoginEnabled(newVal);
                    setOrgData((prev) => (prev ? { ...prev, organization: updated } : prev));
                    addToast('success', `Email & password login ${newVal ? 'enabled' : 'disabled'}`);
                  } catch (err) {
                    addToast('error', err instanceof Error ? err.message : 'Failed to update login settings');
                  } finally {
                    setSaving(false);
                  }
                };
                if (!enabled) {
                  setLoginModeConfirm({
                    title: 'Disable Email & Password Login',
                    message: 'Users who currently sign in with email and password will no longer be able to log in using those credentials. Only SSO login will be available. Are you sure?',
                    onConfirm: () => {
                      setLoginModeConfirm(null);
                      doToggle(false);
                    },
                  });
                } else {
                  doToggle(true);
                }
              }}
              onSsoLoginToggle={(enabled) => {
                const doToggle = async (newVal: boolean) => {
                  setSaving(true);
                  try {
                    const updated = await updateOrganization({
                      name: orgName.trim(),
                      passwordLoginEnabled,
                      ssoLoginEnabled: newVal,
                    });
                    setSsoLoginEnabled(newVal);
                    setOrgData((prev) => (prev ? { ...prev, organization: updated } : prev));
                    addToast('success', `SSO login ${newVal ? 'enabled' : 'disabled'}`);
                  } catch (err) {
                    addToast('error', err instanceof Error ? err.message : 'Failed to update login settings');
                  } finally {
                    setSaving(false);
                  }
                };
                if (!enabled) {
                  setLoginModeConfirm({
                    title: 'Disable SSO Login',
                    message: 'Users who currently sign in with SSO will no longer be able to log in through their identity provider. Only email and password login will be available. Are you sure?',
                    onConfirm: () => {
                      setLoginModeConfirm(null);
                      doToggle(false);
                    },
                  });
                } else {
                  doToggle(true);
                }
              }}
              saving={saving}
              onSave={handleSaveGeneral}
            />
          )}
          {section === 'sso' && (
            <SsoSection
              orgData={orgData}
              ssoForm={ssoForm}
              setSsoForm={setSsoForm}
              updateSsoField={updateSsoField}
              metadataXml={metadataXml}
              setMetadataXml={setMetadataXml}
              importingMetadata={importingMetadata}
              saving={saving}
              onImportMetadata={handleImportMetadata}
              onSave={handleSaveSso}
              onDelete={handleDeleteSso}
              activeSsoProtocol={activeSsoProtocol}
              protocolSaving={protocolSaving}
              onSetActiveProtocol={handleStageProtocol}
              activeTab={activeTab}
              oidcConfig={orgData?.oidcConfig ?? null}
              oidcForm={oidcForm}
              setOidcForm={setOidcForm}
              oidcSaving={oidcSaving}
              showOidcOverrides={showOidcOverrides}
              setShowOidcOverrides={setShowOidcOverrides}
              discoverLoading={discoverLoading}
              onDiscoverOidc={handleDiscoverOidc}
              onSaveOidc={handleSaveOidc}
              onDeleteOidc={() => setShowDeleteOidcConfirm(true)}
            />
          )}
          {section === 'smtp' && (
            <SmtpSection
              smtpForm={smtpForm}
              smtpHasPassword={smtpHasPassword}
              smtpConfigExists={smtpConfigExists}
              updateSmtpField={updateSmtpField}
              saving={saving}
              onSave={handleSaveSmtp}
              onDelete={handleDeleteSmtp}
            />
          )}
          {section === 'members' && (
            <MembersSection currentUserId={user?.id ?? ''} currentUserRole={user?.role ?? 'user'} />
          )}
          {section === 'taxonomy' && <TaxonomySection />}
          {section === 'marketplace-submissions' && <MarketplaceSubmissionsSection />}
          {section === 'marketplace-settings' && orgData && (
            <MarketplaceSettingsSection
              org={orgData.organization}
              onOrgUpdate={(updated) =>
                setOrgData((prev) => (prev ? { ...prev, organization: updated } : prev))
              }
            />
          )}
          {section === 'analytics' && <AdminAnalyticsTab />}
        </div>
      </div>

      {/* Login Mode Confirm Dialog */}
      <ConfirmDialog
        open={!!loginModeConfirm}
        title={loginModeConfirm?.title ?? ''}
        confirmLabel="Disable"
        variant="danger"
        onConfirm={() => loginModeConfirm?.onConfirm()}
        onCancel={() => setLoginModeConfirm(null)}
      >
        <p>{loginModeConfirm?.message}</p>
      </ConfirmDialog>

      {/* Delete OIDC Config Confirm Dialog */}
      <ConfirmDialog
        open={showDeleteOidcConfirm}
        title="Delete OIDC Configuration"
        confirmLabel="Delete Configuration"
        variant="danger"
        onConfirm={handleDeleteOidc}
        onCancel={() => setShowDeleteOidcConfirm(false)}
      >
        <p>This will remove the OIDC configuration. If OIDC is currently the active protocol, SSO login will be disabled.</p>
      </ConfirmDialog>

      {/* Switch Active Protocol Confirm Dialog */}
      <ConfirmDialog
        open={showProtocolConfirmDialog}
        title={`Switch to ${pendingProtocol === 'oidc' ? 'OIDC' : 'SAML'}`}
        confirmLabel="Switch Protocol"
        variant="primary"
        onConfirm={handleConfirmProtocol}
        onCancel={handleCancelProtocol}
      >
        <p>
          This will change the active SSO protocol to <strong>{pendingProtocol === 'oidc' ? 'OIDC' : 'SAML'}</strong>.
          The login page SSO button will immediately route users through {pendingProtocol === 'oidc' ? 'OIDC' : 'SAML'}.
          Your {pendingProtocol === 'oidc' ? 'SAML' : 'OIDC'} configuration is preserved and can be reactivated at any time.
        </p>
      </ConfirmDialog>

      {/* Disable SSO Protocol Confirm Dialog */}
      <ConfirmDialog
        open={showDisableProtocolConfirm}
        title="Disable SSO"
        confirmLabel="Disable"
        variant="danger"
        onConfirm={() => {
          setShowDisableProtocolConfirm(false);
          void (async () => {
            setActiveSsoProtocolState(null);
            setProtocolSaving(true);
            try {
              await setActiveSsoProtocol(null);
              addToast('success', 'SSO disabled');
            } catch {
              setActiveSsoProtocolState(activeSsoProtocol);
              addToast('error', 'Failed to disable SSO');
            } finally {
              setProtocolSaving(false);
              setPendingProtocol(null);
            }
          })();
        }}
        onCancel={() => { setShowDisableProtocolConfirm(false); setPendingProtocol(null); }}
      >
        <p>Setting the active protocol to None will hide the SSO login button. Users who only have SSO access will not be able to log in until a protocol is reactivated.</p>
      </ConfirmDialog>
    </div>
  );
}

// ─── General Section ─────────────────────────────────────────────────────

interface GeneralSectionProps {
  orgData: OrganizationResponse | null;
  orgName: string;
  onOrgNameChange: (name: string) => void;
  passwordLoginEnabled: boolean;
  ssoLoginEnabled: boolean;
  onPasswordLoginToggle: (enabled: boolean) => void;
  onSsoLoginToggle: (enabled: boolean) => void;
  defaultTimezone: string;
  onDefaultTimezoneChange: (tz: string) => void;
  saving: boolean;
  onSave: () => void;
}

function GeneralSection({
  orgData,
  orgName,
  onOrgNameChange,
  passwordLoginEnabled,
  ssoLoginEnabled,
  onPasswordLoginToggle,
  onSsoLoginToggle,
  defaultTimezone,
  onDefaultTimezoneChange,
  saving,
  onSave,
}: GeneralSectionProps) {
  const { prefs } = useUserPreferences();
  // Cannot disable the last remaining login method
  const canDisablePassword = ssoLoginEnabled;
  const canDisableSso = passwordLoginEnabled;

  return (
    <>
      <h1 className="mb-6 text-xl font-bold text-slate-800">General</h1>

      <div className="rounded-xl border border-slate-200/80 bg-white p-6 shadow-sm">
        <div className="space-y-5">
          {/* Organization ID (read-only) */}
          <div>
            <dt className="text-xs font-medium uppercase tracking-wider text-slate-400">
              Organization ID
            </dt>
            <dd className="mt-1.5 text-sm font-mono text-slate-600">
              {orgData?.organization.id ?? '—'}
            </dd>
          </div>

          {/* Organization Name */}
          <div>
            <label
              htmlFor="orgName"
              className="mb-1 block text-sm font-medium text-slate-700"
            >
              Organization Name
            </label>
            <input
              id="orgName"
              type="text"
              value={orgName}
              onChange={(e) => onOrgNameChange(e.target.value)}
              className="w-full rounded-lg border border-slate-300 px-3 py-2 text-sm text-slate-800 placeholder:text-slate-400 focus:border-indigo-500 focus:outline-none focus:ring-1 focus:ring-indigo-500"
              placeholder="Enter organization name"
            />
          </div>

          {/* Default Timezone */}
          <div>
            <label
              htmlFor="defaultTimezone"
              className="mb-1 block text-sm font-medium text-slate-700"
            >
              Default Timezone for New Users
            </label>
            <select
              id="defaultTimezone"
              value={defaultTimezone}
              onChange={(e) => onDefaultTimezoneChange(e.target.value)}
              className="w-full rounded-lg border border-slate-300 px-3 py-2 text-sm text-slate-800 focus:border-indigo-500 focus:outline-none focus:ring-1 focus:ring-indigo-500"
            >
              {(Intl as unknown as { supportedValuesOf: (key: string) => string[] }).supportedValuesOf('timeZone').map((tz) => (
                <option key={tz} value={tz}>{tz}</option>
              ))}
            </select>
            <p className="mt-1 text-xs text-slate-500">
              Applied automatically when users join via invite or SSO.
            </p>
          </div>

          {/* Created / Updated */}
          {orgData?.organization && (
            <div className="grid grid-cols-2 gap-6">
              <div>
                <dt className="text-xs font-medium uppercase tracking-wider text-slate-400">
                  Created
                </dt>
                <dd className="mt-1.5 text-sm font-medium text-slate-800">
                  {formatDateWithPrefs(orgData.organization.createdAt, prefs)}
                </dd>
              </div>
              <div>
                <dt className="text-xs font-medium uppercase tracking-wider text-slate-400">
                  Last Updated
                </dt>
                <dd className="mt-1.5 text-sm font-medium text-slate-800">
                  {formatDateWithPrefs(orgData.organization.updatedAt, prefs)}
                </dd>
              </div>
            </div>
          )}
        </div>

        <div className="mt-6 flex justify-end border-t border-slate-100 pt-4">
          <Button
            onClick={onSave}
            disabled={saving || !orgName.trim()}
            variant="primary"
            size="md"
          >
            {saving ? 'Saving…' : 'Save Changes'}
          </Button>
        </div>
      </div>

      {/* ─── Authentication Methods ─────────────────────────────── */}
      <div className="mt-6 rounded-xl border border-slate-200/80 bg-white p-6 shadow-sm">
        <h2 className="mb-1 text-sm font-semibold text-slate-800">Authentication Methods</h2>
        <p className="mb-4 text-xs text-slate-500">
          Control which login methods are available for your organization. At least one method must remain enabled.
        </p>

        <div className="space-y-4">
          {/* Email & Password toggle */}
          <label className={`flex items-center gap-3 ${!canDisablePassword && passwordLoginEnabled ? 'cursor-not-allowed' : 'cursor-pointer'}`}>
            <input
              type="checkbox"
              checked={passwordLoginEnabled}
              onChange={(e) => onPasswordLoginToggle(e.target.checked)}
              disabled={!canDisablePassword && passwordLoginEnabled}
              className="h-4 w-4 rounded border-slate-300 text-indigo-600 focus:ring-indigo-500 disabled:opacity-50"
            />
            <div>
              <span className="text-sm font-medium text-slate-700">Email & Password Login</span>
              <p className="text-xs text-slate-500">Allow users to sign in with their email address and password.</p>
            </div>
          </label>

          {/* SSO toggle */}
          <label className={`flex items-center gap-3 ${!canDisableSso && ssoLoginEnabled ? 'cursor-not-allowed' : 'cursor-pointer'}`}>
            <input
              type="checkbox"
              checked={ssoLoginEnabled}
              onChange={(e) => onSsoLoginToggle(e.target.checked)}
              disabled={!canDisableSso && ssoLoginEnabled}
              className="h-4 w-4 rounded border-slate-300 text-indigo-600 focus:ring-indigo-500 disabled:opacity-50"
            />
            <div>
              <span className="text-sm font-medium text-slate-700">SSO Login</span>
              <p className="text-xs text-slate-500">Allow users to sign in through the configured identity provider (SAML).</p>
            </div>
          </label>
        </div>

        {/* Warning when only one mode is active */}
        {(!passwordLoginEnabled || !ssoLoginEnabled) && (
          <div className="mt-4 flex items-center gap-2 rounded-lg border border-amber-200 bg-amber-50 px-3 py-2 text-xs text-amber-800">
            <svg className="h-3.5 w-3.5 shrink-0" fill="none" viewBox="0 0 24 24" strokeWidth={2} stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" d="M12 9v3.75m-9.303 3.376c-.866 1.5.217 3.374 1.948 3.374h14.71c1.73 0 2.813-1.874 1.948-3.374L13.949 3.378c-.866-1.5-3.032-1.5-3.898 0L2.697 16.126ZM12 15.75h.007v.008H12v-.008Z" />
            </svg>
            Only one login method is enabled. At least one must remain active.
          </div>
        )}
      </div>
    </>
  );
}

// ─── SSO Section ─────────────────────────────────────────────────────────

interface SsoSectionProps {
  orgData: OrganizationResponse | null;
  ssoForm: SaveSamlConfigRequest;
  setSsoForm: React.Dispatch<React.SetStateAction<SaveSamlConfigRequest>>;
  updateSsoField: (field: keyof SaveSamlConfigRequest, value: unknown) => void;
  metadataXml: string;
  setMetadataXml: (v: string) => void;
  importingMetadata: boolean;
  saving: boolean;
  onImportMetadata: () => void;
  onSave: () => void;
  onDelete: () => void;
  // OIDC / Protocol props
  activeSsoProtocol: 'saml' | 'oidc' | null;
  protocolSaving: boolean;
  onSetActiveProtocol: (protocol: 'saml' | 'oidc' | null) => void;
  activeTab: 'saml' | 'oidc';
  oidcConfig: OidcProviderConfigResponse | null;
  oidcForm: SaveOidcConfigRequest;
  setOidcForm: React.Dispatch<React.SetStateAction<SaveOidcConfigRequest>>;
  oidcSaving: boolean;
  showOidcOverrides: boolean;
  setShowOidcOverrides: (v: boolean) => void;
  discoverLoading: boolean;
  onDiscoverOidc: () => void;
  onSaveOidc: () => void;
  onDeleteOidc: () => void;
}

function SsoSection({
  orgData,
  ssoForm,
  setSsoForm,
  updateSsoField,
  metadataXml,
  setMetadataXml,
  importingMetadata,
  saving,
  onImportMetadata,
  onSave,
  onDelete,
  activeSsoProtocol,
  protocolSaving,
  onSetActiveProtocol,
  activeTab,
  oidcConfig,
  oidcForm,
  setOidcForm,
  oidcSaving,
  showOidcOverrides,
  setShowOidcOverrides,
  discoverLoading,
  onDiscoverOidc,
  onSaveOidc,
  onDeleteOidc,
}: SsoSectionProps) {
  return (
    <>
      <h1 className="mb-6 text-xl font-semibold text-slate-800">SSO</h1>

      {/* ─── Active Protocol Selector Card ───────────────────────── */}
      <div className="rounded-xl border border-slate-200/80 bg-white p-6 shadow-sm mb-6">
        <h2 className="mb-1 text-sm font-semibold text-slate-800">Active Protocol</h2>
        <p className="mb-4 text-xs text-slate-500">
          Select which SSO protocol is active. Only one protocol can handle logins at a time. Both configurations are preserved independently — switching back does not require re-entering credentials.
        </p>
        <div className="flex items-center gap-6">
          {(['saml', 'oidc', 'none'] as const).map((value) => (
            <label key={value} className="flex items-center gap-2 cursor-pointer">
              <input
                type="radio"
                name="activeSsoProtocol"
                value={value}
                checked={activeSsoProtocol === (value === 'none' ? null : value)}
                onChange={() => onSetActiveProtocol(value === 'none' ? null : value)}
                disabled={protocolSaving}
                className="h-4 w-4 border-slate-300 text-indigo-600 focus:ring-indigo-500"
              />
              <span className="text-sm font-normal text-slate-700">
                {value === 'saml' ? 'SAML' : value === 'oidc' ? 'OIDC' : 'None (disabled)'}
              </span>
            </label>
          ))}
          {protocolSaving && (
            <span className="ml-2">
              <Spinner size="sm" />
            </span>
          )}
        </div>
      </div>

      {/* ─── Protocol Tab Bar (display only — driven by radio selection) ── */}
      <div className="mb-4 flex items-center gap-1 border-b border-slate-200">
        {(['saml', 'oidc'] as const).map((tab) => (
          <div
            key={tab}
            className={`relative px-4 py-2.5 text-sm font-semibold select-none ${
              activeTab === tab ? 'text-indigo-600' : 'text-slate-400'
            }`}
          >
            {tab === 'saml' ? 'SAML' : 'OIDC'}
            {activeTab === tab && (
              <span className="absolute inset-x-0 -bottom-px h-0.5 rounded-full bg-indigo-600" />
            )}
          </div>
        ))}
      </div>

      {/* ─── Tab Content ─────────────────────────────────────────── */}
      {activeTab === 'saml' && (
        <>

      {/* Import metadata card */}
      <div className="mb-6 rounded-xl border border-slate-200/80 bg-white p-6 shadow-sm">
        <h2 className="mb-1 text-sm font-semibold text-slate-800">Import IdP Metadata</h2>
        <p className="mb-3 text-xs text-slate-500">
          Paste your Identity Provider's metadata XML to auto-fill configuration fields.
        </p>
        <textarea
          value={metadataXml}
          onChange={(e) => setMetadataXml(e.target.value)}
          rows={3}
          className="w-full rounded-lg border border-slate-300 px-3 py-2 text-xs font-mono text-slate-700 placeholder:text-slate-400 focus:border-indigo-500 focus:outline-none focus:ring-1 focus:ring-indigo-500"
          placeholder="Paste IdP metadata XML here..."
        />
        <div className="mt-2 flex justify-end">
          <Button
            onClick={onImportMetadata}
            disabled={importingMetadata || !metadataXml.trim()}
            variant="primary"
            size="sm"
          >
            {importingMetadata ? 'Importing…' : 'Import'}
          </Button>
        </div>
      </div>

      {/* SAML Configuration card */}
      <div className="rounded-xl border border-slate-200/80 bg-white p-6 shadow-sm">
        <h2 className="mb-4 text-sm font-semibold text-slate-800">SAML Configuration</h2>

        <div className="space-y-4">
          {/* Provider ID + Display Name */}
          <div className="grid grid-cols-2 gap-4">
            <SsoField label="Provider ID" value={ssoForm.id} onChange={(v) => updateSsoField('id', v)} placeholder="e.g. azure-ad" tooltip="A unique identifier for this SSO provider. Use a short slug like 'azure-ad' or 'okta'. This is used internally and in callback URLs." />
            <SsoField label="Display Name" value={ssoForm.displayName} onChange={(v) => updateSsoField('displayName', v)} placeholder="e.g. Microsoft Entra ID" tooltip="The name shown on the SSO login button, e.g. 'Microsoft Entra ID' or 'Okta'." />
          </div>

          {/* IdP fields */}
          <SsoField label="IdP Entity ID" value={ssoForm.idpEntityId} onChange={(v) => updateSsoField('idpEntityId', v)} placeholder="https://login.microsoftonline.com/..." tooltip="The unique identifier of your Identity Provider (IdP). You can find this in your IdP's SAML metadata or SSO configuration page. Also known as 'Issuer'." />
          <SsoField label="IdP SSO URL" value={ssoForm.idpSsoUrl} onChange={(v) => updateSsoField('idpSsoUrl', v)} placeholder="https://login.microsoftonline.com/.../saml2" tooltip="The URL where users are redirected to authenticate. Your IdP provides this as the 'Single Sign-On URL' or 'SAML 2.0 Endpoint'." />
          <SsoField label="IdP SLO URL" value={ssoForm.idpSloUrl ?? ''} onChange={(v) => updateSsoField('idpSloUrl', v)} placeholder="https://..." optional tooltip="The URL for Single Logout. When set, logging out of this app will also sign the user out of the IdP. Optional — not all IdPs support SLO." />

          {/* IdP Certificate */}
          <div>
            <label className="mb-1 flex items-center gap-1.5 text-sm font-medium text-slate-700">
              IdP X.509 Certificate
              <InfoTip text="The public X.509 certificate from your IdP, used to verify the signature on SAML assertions. Copy the certificate value (without BEGIN/END headers) from your IdP's metadata or SSO settings." />
            </label>
            <textarea
              value={ssoForm.idpCertificate}
              onChange={(e) => updateSsoField('idpCertificate', e.target.value)}
              rows={3}
              className="w-full rounded-lg border border-slate-300 px-3 py-2 text-xs font-mono focus:border-indigo-500 focus:outline-none focus:ring-1 focus:ring-indigo-500"
              placeholder="MIIDxTCCA..."
            />
          </div>

          {/* SP Entity ID */}
          <SsoField label="SP Entity ID (Your App URL)" value={ssoForm.spEntityId} onChange={(v) => updateSsoField('spEntityId', v)} placeholder="https://skillspell.example.com" tooltip="Your application's unique identifier as registered with the IdP. Typically your app's base URL. Enter this same value in your IdP's 'SP Entity ID' or 'Audience URI' field." />

          {/* ACS URL (read-only, with copy button) — derived from SP Entity ID */}
          <AcsUrlDisplay acsUrl={
            orgData?.acsUrl
              ? orgData.acsUrl
              : ssoForm.spEntityId.trim()
                ? `${ssoForm.spEntityId.trim().replace(/\/+$/, '')}/api/auth/saml/callback`
                : null
          } />

          {/* Attribute Mapping */}
          <div className="border-t border-slate-100 pt-4">
            <h3 className="mb-1 flex items-center gap-1.5 text-sm font-semibold text-slate-700">
              Attribute Mapping
              <InfoTip text="Maps SAML assertion attributes from your IdP to local user fields. Use the claim names configured in your IdP (e.g., 'email', 'givenName', 'sn'). Display Name is automatically derived from First Name + Last Name." />
            </h3>
            <p className="mb-3 text-xs text-slate-500">
              Map SAML claim names from your IdP to system attributes.
              Display Name is derived from First Name + Last Name.
            </p>
            <div className="space-y-2">
              {(
                [
                  { key: 'email', label: 'Email', placeholder: 'e.g. email, mail' },
                  { key: 'firstName', label: 'First Name', placeholder: 'e.g. givenName' },
                  { key: 'lastName', label: 'Last Name', placeholder: 'e.g. sn, surname' },
                ] as const
              ).map(({ key, label, placeholder }) => (
                <div key={key} className="flex items-center gap-3">
                  <span className="w-24 shrink-0 text-xs font-medium text-slate-600">{label}</span>
                  <span className="text-slate-300">→</span>
                  <input
                    type="text"
                    aria-label={`SAML claim for ${label}`}
                    placeholder={placeholder}
                    value={ssoForm.attributeMapping[key]}
                    onChange={(e) =>
                      setSsoForm((prev) => ({
                        ...prev,
                        attributeMapping: { ...prev.attributeMapping, [key]: e.target.value },
                      }))
                    }
                    className="flex-1 rounded-lg border border-slate-300 px-3 py-1.5 text-sm focus:border-indigo-500 focus:outline-none focus:ring-1 focus:ring-indigo-500"
                  />
                </div>
              ))}
            </div>
          </div>

          {/* Auto-provision + Default Role */}
          <div className="border-t border-slate-100 pt-4">
            <div className="grid grid-cols-2 gap-4">
              <div>
                <label className="flex items-center gap-3">
                  <input
                    type="checkbox"
                    checked={ssoForm.autoProvision}
                    onChange={(e) => updateSsoField('autoProvision', e.target.checked)}
                    className="h-4 w-4 rounded border-slate-300 text-indigo-600 focus:ring-indigo-500"
                  />
                  <span className="text-sm font-medium text-slate-700">Auto-provision users</span>
                  <InfoTip text="When enabled, a local user account is automatically created the first time someone logs in via SSO. If disabled, an admin must manually create user accounts before they can log in with SSO." />
                </label>
                <p className="mt-1 ml-7 text-xs text-slate-500">
                  Automatically create a local account on first SSO login
                </p>
              </div>
              <div>
                <label className="mb-1 flex items-center gap-1.5 text-sm font-medium text-slate-700" htmlFor="defaultRole">
                  Default Role
                  <InfoTip text="The role assigned to auto-provisioned users on first SSO login. 'User' has standard access; 'Admin' has full administrative privileges." />
                </label>
                <select
                  id="defaultRole"
                  value={ssoForm.defaultRole}
                  onChange={(e) => updateSsoField('defaultRole', e.target.value as 'user' | 'admin')}
                  className="w-full rounded-lg border border-slate-300 px-3 py-2 text-sm focus:border-indigo-500 focus:outline-none focus:ring-1 focus:ring-indigo-500"
                >
                  <option value="user">User</option>
                  <option value="admin">Admin</option>
                </select>
              </div>
            </div>
          </div>

          {/* Icon URL (optional) */}
          <SsoField
            label="Login Button Icon URL"
            value={ssoForm.iconUrl ?? ''}
            onChange={(v) => updateSsoField('iconUrl', v)}
            placeholder="https://..."
            optional
            tooltip="URL of an icon/logo displayed on the SSO login button. Use a small square image (e.g. 24×24px) in PNG or SVG format."
          />
        </div>

        {/* Action buttons */}
        <div className="mt-6 flex items-center justify-between border-t border-slate-100 pt-4">
          {orgData?.samlConfig ? (
            <Button
              onClick={onDelete}
              disabled={saving}
              variant="destructive-outline"
              size="sm"
            >
              Delete SSO Config
            </Button>
          ) : (
            <div />
          )}
          <Button
            onClick={onSave}
            disabled={saving}
            variant="primary"
            size="md"
          >
            {saving ? 'Saving…' : 'Save SSO Configuration'}
          </Button>
        </div>
      </div>
      </>
      )}

      {activeTab === 'oidc' && (
        <OidcConfigSection
          oidcConfig={oidcConfig}
          oidcForm={oidcForm}
          setOidcForm={setOidcForm}
          oidcSaving={oidcSaving}
          showOidcOverrides={showOidcOverrides}
          setShowOidcOverrides={setShowOidcOverrides}
          discoverLoading={discoverLoading}
          onDiscoverOidc={onDiscoverOidc}
          onSaveOidc={onSaveOidc}
          onDeleteOidc={onDeleteOidc}
        />
      )}
    </>
  );
}

// ─── OIDC Config Section ─────────────────────────────────────────────────

interface OidcConfigSectionProps {
  oidcConfig: OidcProviderConfigResponse | null;
  oidcForm: SaveOidcConfigRequest;
  setOidcForm: React.Dispatch<React.SetStateAction<SaveOidcConfigRequest>>;
  oidcSaving: boolean;
  showOidcOverrides: boolean;
  setShowOidcOverrides: (v: boolean) => void;
  discoverLoading: boolean;
  onDiscoverOidc: () => void;
  onSaveOidc: () => void;
  onDeleteOidc: () => void;
}

function OidcConfigSection({
  oidcConfig,
  oidcForm,
  setOidcForm,
  oidcSaving,
  showOidcOverrides,
  setShowOidcOverrides,
  discoverLoading,
  onDiscoverOidc,
  onSaveOidc,
  onDeleteOidc,
}: OidcConfigSectionProps) {
  const [showClientSecret, setShowClientSecret] = useState(false);

  const inputClass = 'w-full rounded-lg border border-slate-300 px-3 py-2 text-sm text-slate-800 placeholder:text-slate-400 focus:border-indigo-500 focus:outline-none focus:ring-1 focus:ring-indigo-500';
  const labelClass = 'mb-1 block text-sm font-normal text-slate-700';

  return (
    <>
      {/* ─── Discover IdP Card ───────────────────────────────────── */}
      <div className="mb-6 rounded-xl border border-slate-200/80 bg-white p-6 shadow-sm">
        <h2 className="mb-4 text-sm font-semibold text-slate-800">Discover IdP</h2>
        <div>
          <label htmlFor="oidcDiscoveryUrl" className={labelClass}>
            Discovery URL
            <InfoTip text="Your IdP's OpenID Connect issuer URL. Configuration is fetched from {issuerUrl}/.well-known/openid-configuration." />
          </label>
          <div className="flex gap-2">
            <input
              id="oidcDiscoveryUrl"
              type="text"
              value={oidcForm.issuerUrl}
              onChange={(e) => setOidcForm((f) => ({ ...f, issuerUrl: e.target.value }))}
              placeholder="https://accounts.google.com"
              className={inputClass}
            />
            <Button
              type="button"
              onClick={onDiscoverOidc}
              disabled={discoverLoading || !oidcForm.issuerUrl.trim()}
              variant="primary"
              size="sm"
              className="shrink-0"
            >
              {discoverLoading ? 'Fetching...' : 'Fetch Configuration'}
            </Button>
          </div>
        </div>
      </div>

      {/* ─── OIDC Configuration Card ─────────────────────────────── */}
      <div className="rounded-xl border border-slate-200/80 bg-white p-6 shadow-sm">
        <h2 className="mb-4 text-sm font-semibold text-slate-800">OIDC Configuration</h2>

        <div className="space-y-4">
          {/* Client ID */}
          <div>
            <label htmlFor="oidcClientId" className={labelClass}>Client ID</label>
            <input
              id="oidcClientId"
              type="text"
              value={oidcForm.clientId}
              onChange={(e) => setOidcForm((f) => ({ ...f, clientId: e.target.value }))}
              placeholder="your-client-id"
              className={inputClass}
            />
          </div>

          {/* Client Secret */}
          <div>
            <label htmlFor="oidcClientSecret" className="mb-1 flex items-center gap-2 text-sm font-normal text-slate-700">
              Client Secret
              {oidcConfig?.hasClientSecret && !oidcForm.clientSecret && (
                <span className="rounded bg-slate-100 px-1.5 py-0.5 text-xs text-slate-500">Configured</span>
              )}
            </label>
            <div className="relative">
              <input
                id="oidcClientSecret"
                type={showClientSecret ? 'text' : 'password'}
                value={oidcForm.clientSecret}
                onChange={(e) => setOidcForm((f) => ({ ...f, clientSecret: e.target.value }))}
                placeholder="Enter new client secret"
                className={`${inputClass} pr-10`}
              />
              <button
                type="button"
                onClick={() => setShowClientSecret((v) => !v)}
                aria-label={showClientSecret ? 'Hide client secret' : 'Show client secret'}
                className="absolute right-2 top-1/2 -translate-y-1/2 text-slate-400 hover:text-slate-600"
              >
                {showClientSecret ? (
                  <svg className="h-4 w-4" fill="none" viewBox="0 0 24 24" strokeWidth={1.5} stroke="currentColor">
                    <path strokeLinecap="round" strokeLinejoin="round" d="M3.98 8.223A10.477 10.477 0 0 0 1.934 12C3.226 16.338 7.244 19.5 12 19.5c.993 0 1.953-.138 2.863-.395M6.228 6.228A10.451 10.451 0 0 1 12 4.5c4.756 0 8.773 3.162 10.065 7.498a10.522 10.522 0 0 1-4.293 5.774M6.228 6.228 3 3m3.228 3.228 3.65 3.65m7.894 7.894L21 21m-3.228-3.228-3.65-3.65m0 0a3 3 0 1 0-4.243-4.243m4.242 4.242L9.88 9.88" />
                  </svg>
                ) : (
                  <svg className="h-4 w-4" fill="none" viewBox="0 0 24 24" strokeWidth={1.5} stroke="currentColor">
                    <path strokeLinecap="round" strokeLinejoin="round" d="M2.036 12.322a1.012 1.012 0 0 1 0-.639C3.423 7.51 7.36 4.5 12 4.5c4.638 0 8.573 3.007 9.963 7.178.07.207.07.431 0 .639C20.577 16.49 16.64 19.5 12 19.5c-4.638 0-8.573-3.007-9.963-7.178Z" />
                    <path strokeLinecap="round" strokeLinejoin="round" d="M15 12a3 3 0 1 1-6 0 3 3 0 0 1 6 0Z" />
                  </svg>
                )}
              </button>
            </div>
          </div>

          {/* Scopes */}
          <div>
            <label htmlFor="oidcScopes" className={labelClass}>
              Scopes (space-separated)
            </label>
            <input
              id="oidcScopes"
              type="text"
              value={oidcForm.scopes.join(' ')}
              onChange={(e) => setOidcForm((f) => ({ ...f, scopes: e.target.value.split(' ').filter(Boolean) }))}
              placeholder="openid email profile"
              className={inputClass}
            />
            <p className="mt-1 text-xs text-slate-500">Space-separated list of scopes to request. Defaults: openid email profile</p>
          </div>

          {/* Attribute Mapping */}
          <div className="border-t border-slate-100 pt-4">
            <h3 className="mb-1 flex items-center gap-1.5 text-sm font-semibold text-slate-700">
              Attribute Mapping
              <InfoTip text="Maps OIDC claim names from your IdP to local user fields." />
            </h3>
            <p className="mb-3 text-xs text-slate-500">
              Map OIDC claim names from your IdP to system attributes.
            </p>
            <div className="space-y-2">
              {(
                [
                  { key: 'email', label: 'Email', placeholder: 'e.g. email' },
                  { key: 'firstName', label: 'First Name', placeholder: 'e.g. given_name' },
                  { key: 'lastName', label: 'Last Name', placeholder: 'e.g. family_name' },
                ] as const
              ).map(({ key, label, placeholder }) => (
                <div key={key} className="flex items-center gap-3">
                  <span className="w-24 shrink-0 text-xs font-medium text-slate-600">{label}</span>
                  <span className="text-slate-300">→</span>
                  <input
                    type="text"
                    aria-label={`OIDC claim for ${label}`}
                    placeholder={placeholder}
                    value={oidcForm.attributeMapping[key]}
                    onChange={(e) =>
                      setOidcForm((f) => ({
                        ...f,
                        attributeMapping: { ...f.attributeMapping, [key]: e.target.value },
                      }))
                    }
                    className="flex-1 rounded-lg border border-slate-300 px-3 py-1.5 text-sm focus:border-indigo-500 focus:outline-none focus:ring-1 focus:ring-indigo-500"
                  />
                </div>
              ))}
            </div>
          </div>

          {/* Auto-provision + Default Role */}
          <div className="border-t border-slate-100 pt-4">
            <div className="grid grid-cols-2 gap-4">
              <div>
                <label className="flex items-center gap-3">
                  <input
                    type="checkbox"
                    checked={oidcForm.autoProvision}
                    onChange={(e) => setOidcForm((f) => ({ ...f, autoProvision: e.target.checked }))}
                    className="h-4 w-4 rounded border-slate-300 text-indigo-600 focus:ring-indigo-500"
                  />
                  <span className="text-sm font-medium text-slate-700">Auto-provision users</span>
                  <InfoTip text="When enabled, a local user account is automatically created the first time someone logs in via OIDC." />
                </label>
                <p className="mt-1 ml-7 text-xs text-slate-500">
                  Automatically create a local account on first OIDC login
                </p>
              </div>
              <div>
                <label className="mb-1 flex items-center gap-1.5 text-sm font-normal text-slate-700" htmlFor="oidcDefaultRole">
                  Default Role
                  <InfoTip text="The role assigned to auto-provisioned users on first OIDC login." />
                </label>
                <select
                  id="oidcDefaultRole"
                  value={oidcForm.defaultRole}
                  onChange={(e) => setOidcForm((f) => ({ ...f, defaultRole: e.target.value as 'user' | 'admin' }))}
                  className="w-full rounded-lg border border-slate-300 px-3 py-2 text-sm focus:border-indigo-500 focus:outline-none focus:ring-1 focus:ring-indigo-500"
                >
                  <option value="user">User</option>
                  <option value="admin">Admin</option>
                </select>
              </div>
            </div>
          </div>

          {/* Optional Overrides disclosure */}
          <div className="border-t border-slate-100 pt-4">
            <Button
              type="button"
              onClick={() => setShowOidcOverrides(!showOidcOverrides)}
              variant="ghost"
              size="xs"
              leftIcon={
                <svg
                  className={`h-3.5 w-3.5 transition-transform ${showOidcOverrides ? 'rotate-90' : ''}`}
                  fill="none"
                  viewBox="0 0 24 24"
                  strokeWidth={2}
                  stroke="currentColor"
                >
                  <path strokeLinecap="round" strokeLinejoin="round" d="M8.25 4.5l7.5 7.5-7.5 7.5" />
                </svg>
              }
            >
              Endpoint Overrides
            </Button>

            {showOidcOverrides && (
              <div className="mt-3 space-y-3">
                <p className="text-xs text-slate-500">
                  Leave blank to use values from discovery. Override only if your IdP requires non-standard endpoints.
                </p>
                <div>
                  <label htmlFor="oidcAuthUrl" className={`${labelClass} flex items-center gap-1`}>
                    Authorization URL
                    <span className="ml-1 text-xs text-slate-400">(optional)</span>
                  </label>
                  <input
                    id="oidcAuthUrl"
                    type="text"
                    value={oidcForm.authorizationUrl ?? ''}
                    onChange={(e) => setOidcForm((f) => ({ ...f, authorizationUrl: e.target.value || undefined }))}
                    placeholder="https://..."
                    className={inputClass}
                  />
                </div>
                <div>
                  <label htmlFor="oidcTokenUrl" className={`${labelClass} flex items-center gap-1`}>
                    Token URL
                    <span className="ml-1 text-xs text-slate-400">(optional)</span>
                  </label>
                  <input
                    id="oidcTokenUrl"
                    type="text"
                    value={oidcForm.tokenUrl ?? ''}
                    onChange={(e) => setOidcForm((f) => ({ ...f, tokenUrl: e.target.value || undefined }))}
                    placeholder="https://..."
                    className={inputClass}
                  />
                </div>
                <div>
                  <label htmlFor="oidcJwksUri" className={`${labelClass} flex items-center gap-1`}>
                    JWKS URI
                    <span className="ml-1 text-xs text-slate-400">(optional)</span>
                  </label>
                  <input
                    id="oidcJwksUri"
                    type="text"
                    value={oidcForm.jwksUri ?? ''}
                    onChange={(e) => setOidcForm((f) => ({ ...f, jwksUri: e.target.value || undefined }))}
                    placeholder="https://..."
                    className={inputClass}
                  />
                </div>
              </div>
            )}
          </div>
        </div>

        {/* Action buttons */}
        <div className="mt-6 flex items-center justify-between border-t border-slate-100 pt-4">
          {oidcConfig ? (
            <Button
              type="button"
              onClick={onDeleteOidc}
              disabled={oidcSaving}
              variant="destructive-outline"
              size="sm"
            >
              Delete OIDC Config
            </Button>
          ) : (
            <div />
          )}
          <Button
            type="button"
            onClick={onSaveOidc}
            disabled={oidcSaving}
            variant="primary"
            size="md"
          >
            {oidcSaving ? 'Saving…' : 'Save OIDC Configuration'}
          </Button>
        </div>
      </div>
    </>
  );
}

// ─── SMTP Section ────────────────────────────────────────────────────────

interface SmtpSectionProps {
  smtpForm: SaveSmtpConfigRequest;
  smtpHasPassword: boolean;
  smtpConfigExists: boolean;
  updateSmtpField: <K extends keyof SaveSmtpConfigRequest>(field: K, value: SaveSmtpConfigRequest[K]) => void;
  saving: boolean;
  onSave: () => void;
  onDelete: () => void;
}

/** Inline field error — declared at module scope to avoid re-creation during render. */
function SmtpFieldError({
  field,
  touched,
  fieldErrors,
}: {
  field: string;
  touched: Record<string, boolean>;
  fieldErrors: Record<string, string | undefined>;
}) {
  const msg = touched[field] && fieldErrors[field];
  if (!msg) return null;
  return <p className="mt-1 text-xs text-red-500">{msg}</p>;
}

function SmtpSection({
  smtpForm,
  smtpHasPassword,
  smtpConfigExists,
  updateSmtpField,
  saving,
  onSave,
  onDelete,
}: SmtpSectionProps) {
  const { addToast } = useToast();

  // Test connection state (inline — no dialog)
  const [testConnLoading, setTestConnLoading] = useState(false);
  const [testConnResult, setTestConnResult] = useState<{ success: boolean; message: string } | null>(null);

  // Send test email dialog state
  const [showTestEmailDialog, setShowTestEmailDialog] = useState(false);
  const [testEmailLoading, setTestEmailLoading] = useState(false);
  const [testEmailRecipient, setTestEmailRecipient] = useState('');
  const [testEmailResult, setTestEmailResult] = useState<{ success: boolean; message: string } | null>(null);

  // Track which fields have been touched (for showing validation on blur)
  const [touched, setTouched] = useState<Record<string, boolean>>({});
  const markTouched = (field: string) => setTouched((prev) => ({ ...prev, [field]: true }));

  const authDisabled = smtpForm.authMethod === 'none';

  // ─── Validation helpers ─────────────────────────────────────────────
  const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

  const fieldErrors: Record<string, string | undefined> = {
    host: !smtpForm.host.trim() ? 'SMTP host is required' : undefined,
    port:
      !smtpForm.port || smtpForm.port < 1 || smtpForm.port > 65535
        ? 'Port must be between 1 and 65535'
        : undefined,
    fromEmail: !smtpForm.fromEmail.trim()
      ? 'From email is required'
      : !EMAIL_RE.test(smtpForm.fromEmail.trim())
        ? 'Invalid email address'
        : undefined,
    fromName: !smtpForm.fromName.trim() ? 'From name is required' : undefined,
    replyToEmail:
      smtpForm.replyToEmail && smtpForm.replyToEmail.trim() && !EMAIL_RE.test(smtpForm.replyToEmail.trim())
        ? 'Invalid email address'
        : undefined,
    defaultBcc:
      smtpForm.defaultBcc && smtpForm.defaultBcc.trim() && !EMAIL_RE.test(smtpForm.defaultBcc.trim())
        ? 'Invalid email address'
        : undefined,
    defaultCc:
      smtpForm.defaultCc && smtpForm.defaultCc.trim() && !EMAIL_RE.test(smtpForm.defaultCc.trim())
        ? 'Invalid email address'
        : undefined,
  };

  const hasErrors = Object.values(fieldErrors).some(Boolean);

  /** Border class that turns red when the touched field has an error. */
  const borderClass = (field: string) =>
    touched[field] && fieldErrors[field]
      ? 'border-red-400 focus:border-red-500 focus:ring-red-500'
      : 'border-slate-300 focus:border-indigo-500 focus:ring-indigo-500';

  // ─── Handlers ───────────────────────────────────────────────────────
  const handleTestConnection = async () => {
    // Validate connection-required fields
    if (!smtpForm.host.trim()) {
      addToast('error', 'SMTP host is required to test the connection');
      return;
    }
    if (!smtpForm.port || smtpForm.port < 1 || smtpForm.port > 65535) {
      addToast('error', 'A valid port is required to test the connection');
      return;
    }

    setTestConnLoading(true);
    setTestConnResult(null);
    try {
      const result = await testSmtpConnection(smtpForm);
      setTestConnResult(result);
    } catch (err) {
      setTestConnResult({
        success: false,
        message: err instanceof Error ? err.message : 'Connection test failed',
      });
    } finally {
      setTestConnLoading(false);
    }
  };

  const handleSendTestEmail = async () => {
    if (!testEmailRecipient.trim()) return;
    setTestEmailLoading(true);
    setTestEmailResult(null);
    try {
      const result = await sendTestEmail(testEmailRecipient.trim());
      setTestEmailResult(result);
    } catch (err) {
      setTestEmailResult({
        success: false,
        message: err instanceof Error ? err.message : 'Failed to send test email',
      });
    } finally {
      setTestEmailLoading(false);
    }
  };

  return (
    <>
      <h1 className="mb-6 text-xl font-bold text-slate-800">Email / SMTP</h1>

      {/* ─── Section 1: Connection ───────────────────────────────── */}
      <div className="mb-6 rounded-xl border border-slate-200/80 bg-white p-6 shadow-sm">
        <h2 className="mb-4 text-sm font-semibold text-slate-800">Connection</h2>
        <div className="space-y-4">
          <div>
            <SmtpField
              label="SMTP Host"
              value={smtpForm.host}
              onChange={(v) => updateSmtpField('host', v)}
              onBlur={() => markTouched('host')}
              placeholder="smtp.example.com"
              tooltip="The hostname or IP address of your SMTP server."
              error={touched.host ? fieldErrors.host : undefined}
            />
          </div>

          <div className="grid grid-cols-2 gap-4">
            <div>
              <label className="mb-1 flex items-center gap-1.5 text-sm font-medium text-slate-700">
                Port
                <InfoTip text="Common ports: 587 (STARTTLS), 465 (TLS/SSL), 25 (unencrypted), 2525 (alternate)." />
              </label>
              <input
                type="number"
                aria-label="SMTP port"
                value={smtpForm.port}
                onChange={(e) => updateSmtpField('port', parseInt(e.target.value, 10) || 0)}
                onBlur={() => markTouched('port')}
                className={`w-full rounded-lg border px-3 py-2 text-sm focus:outline-none focus:ring-1 ${borderClass('port')}`}
                min={1}
                max={65535}
              />
              <SmtpFieldError field="port" touched={touched} fieldErrors={fieldErrors} />
              {!fieldErrors.port && (
                <p className="mt-1 text-xs text-slate-400">Common: 587 / 465 / 25 / 2525</p>
              )}
            </div>
            <div>
              <label className="mb-1 flex items-center gap-1.5 text-sm font-medium text-slate-700">
                Security
                <InfoTip text="None = no encryption. STARTTLS = upgrade to TLS after connecting. TLS = connect over TLS (implicit SSL)." />
              </label>
              <select
                aria-label="Security mode"
                value={smtpForm.security}
                onChange={(e) => updateSmtpField('security', e.target.value as SmtpSecurityMode)}
                className="w-full rounded-lg border border-slate-300 px-3 py-2 text-sm focus:border-indigo-500 focus:outline-none focus:ring-1 focus:ring-indigo-500"
              >
                <option value="none">None</option>
                <option value="starttls">STARTTLS</option>
                <option value="tls">TLS (implicit SSL)</option>
              </select>
            </div>
          </div>
        </div>
      </div>

      {/* ─── Section 2: Authentication ──────────────────────────── */}
      <div className="mb-6 rounded-xl border border-slate-200/80 bg-white p-6 shadow-sm">
        <h2 className="mb-4 text-sm font-semibold text-slate-800">Authentication</h2>
        <div className="space-y-4">
          <div>
            <label className="mb-1 flex items-center gap-1.5 text-sm font-medium text-slate-700">
              Auth Method
              <InfoTip text="None = anonymous relay (no credentials). Password = username + password authentication. OAuth2 = token-based auth." />
            </label>
            <select
              aria-label="Authentication method"
              value={smtpForm.authMethod}
              onChange={(e) => updateSmtpField('authMethod', e.target.value as SmtpAuthMethod)}
              className="w-full rounded-lg border border-slate-300 px-3 py-2 text-sm focus:border-indigo-500 focus:outline-none focus:ring-1 focus:ring-indigo-500"
            >
              <option value="none">None (anonymous relay)</option>
              <option value="plain">Password</option>
              <option value="oauth2">OAuth2</option>
            </select>
          </div>

          <SmtpField
            label="Username"
            value={smtpForm.username ?? ''}
            onChange={(v) => updateSmtpField('username', v)}
            placeholder="user@example.com"
            disabled={authDisabled}
            tooltip="The SMTP username (often your email address)."
          />

          <div>
            <label className="mb-1 flex items-center gap-1.5 text-sm font-medium text-slate-700">
              Password
              <InfoTip text="The SMTP password or app-specific password. Stored encrypted at rest (AES-256-GCM). Leave blank to keep the existing password." />
            </label>
            <input
              type="password"
              value={smtpForm.password ?? ''}
              onChange={(e) => updateSmtpField('password', e.target.value)}
              disabled={authDisabled}
              className="w-full rounded-lg border border-slate-300 px-3 py-2 text-sm focus:border-indigo-500 focus:outline-none focus:ring-1 focus:ring-indigo-500 disabled:bg-slate-50 disabled:text-slate-400"
              placeholder={authDisabled ? '' : smtpHasPassword ? '••••••••  (leave blank to keep)' : 'Enter password'}
            />
            {smtpHasPassword && !authDisabled && (
              <p className="mt-1 text-xs text-slate-400">
                A password is saved. Leave blank to keep it, or enter a new one to replace it.
              </p>
            )}
          </div>
        </div>
      </div>

      {/* ─── Section 3: Sender Information ──────────────────────── */}
      <div className="mb-6 rounded-xl border border-slate-200/80 bg-white p-6 shadow-sm">
        <h2 className="mb-4 text-sm font-semibold text-slate-800">Sender Information</h2>
        <div className="space-y-4">
          <div className="grid grid-cols-2 gap-4">
            <SmtpField
              label="From Email"
              value={smtpForm.fromEmail}
              onChange={(v) => updateSmtpField('fromEmail', v)}
              onBlur={() => markTouched('fromEmail')}
              placeholder="noreply@example.com"
              tooltip="The email address shown in the 'From' field of outgoing emails."
              error={touched.fromEmail ? fieldErrors.fromEmail : undefined}
            />
            <SmtpField
              label="From Name"
              value={smtpForm.fromName}
              onChange={(v) => updateSmtpField('fromName', v)}
              onBlur={() => markTouched('fromName')}
              placeholder="SkillSpell"
              tooltip="The display name shown alongside the from email address."
              error={touched.fromName ? fieldErrors.fromName : undefined}
            />
          </div>
          <div className="grid grid-cols-2 gap-4">
            <SmtpField
              label="Reply-To Email"
              value={smtpForm.replyToEmail ?? ''}
              onChange={(v) => updateSmtpField('replyToEmail', v)}
              onBlur={() => markTouched('replyToEmail')}
              placeholder="support@example.com"
              optional
              tooltip="If set, replies will be directed to this address instead of the from address."
              error={touched.replyToEmail ? fieldErrors.replyToEmail : undefined}
            />
            <SmtpField
              label="Reply-To Name"
              value={smtpForm.replyToName ?? ''}
              onChange={(v) => updateSmtpField('replyToName', v)}
              placeholder="Support Team"
              optional
              tooltip="Display name for the reply-to address."
            />
          </div>
        </div>
      </div>

      {/* ─── Section 4: Advanced ────────────────────────────────── */}
      <div className="mb-6 rounded-xl border border-slate-200/80 bg-white p-6 shadow-sm">
        <h2 className="mb-4 text-sm font-semibold text-slate-800">Advanced</h2>
        <div className="space-y-4">
          {/* Enable toggle */}
          <label className="flex items-center gap-3">
            <input
              type="checkbox"
              checked={smtpForm.enabled}
              onChange={(e) => updateSmtpField('enabled', e.target.checked)}
              className="h-4 w-4 rounded border-slate-300 text-indigo-600 focus:ring-indigo-500"
            />
            <span className="text-sm font-medium text-slate-700">Enable SMTP</span>
            <InfoTip text="When enabled, the application will use this SMTP configuration to send emails. Disable to stop sending without deleting the config." />
          </label>

          {/* Reject Unauthorized */}
          <label className="flex items-center gap-3">
            <input
              type="checkbox"
              checked={smtpForm.rejectUnauthorized ?? true}
              onChange={(e) => updateSmtpField('rejectUnauthorized', e.target.checked)}
              className="h-4 w-4 rounded border-slate-300 text-indigo-600 focus:ring-indigo-500"
            />
            <span className="text-sm font-medium text-slate-700">Verify TLS certificates</span>
            <InfoTip text="When enabled, the connection will fail if the SMTP server presents an invalid or self-signed certificate. Disable only for development or internal servers." />
          </label>

          <div className="grid grid-cols-2 gap-4">
            <div>
              <label className="mb-1 flex items-center gap-1.5 text-sm font-medium text-slate-700">
                Connection Timeout (ms)
                <InfoTip text="Maximum milliseconds to wait when establishing the TCP connection to the SMTP server." />
              </label>
              <input
                type="number"
                aria-label="Connection timeout in milliseconds"
                value={smtpForm.connectionTimeoutMs ?? 10000}
                onChange={(e) => updateSmtpField('connectionTimeoutMs', parseInt(e.target.value, 10) || 10000)}
                className="w-full rounded-lg border border-slate-300 px-3 py-2 text-sm focus:border-indigo-500 focus:outline-none focus:ring-1 focus:ring-indigo-500"
                min={1000}
                step={1000}
              />
            </div>
            <div>
              <label className="mb-1 flex items-center gap-1.5 text-sm font-medium text-slate-700">
                Socket Timeout (ms)
                <InfoTip text="Maximum milliseconds to wait for data on an idle socket during the SMTP conversation." />
              </label>
              <input
                type="number"
                aria-label="Socket timeout in milliseconds"
                value={smtpForm.socketTimeoutMs ?? 30000}
                onChange={(e) => updateSmtpField('socketTimeoutMs', parseInt(e.target.value, 10) || 30000)}
                className="w-full rounded-lg border border-slate-300 px-3 py-2 text-sm focus:border-indigo-500 focus:outline-none focus:ring-1 focus:ring-indigo-500"
                min={1000}
                step={1000}
              />
            </div>
          </div>

          <div className="grid grid-cols-2 gap-4">
            <SmtpField
              label="Default BCC"
              value={smtpForm.defaultBcc ?? ''}
              onChange={(v) => updateSmtpField('defaultBcc', v)}
              onBlur={() => markTouched('defaultBcc')}
              placeholder="archive@example.com"
              optional
              tooltip="If set, this address will be BCC'd on every outgoing email."
              error={touched.defaultBcc ? fieldErrors.defaultBcc : undefined}
            />
            <SmtpField
              label="Default CC"
              value={smtpForm.defaultCc ?? ''}
              onChange={(v) => updateSmtpField('defaultCc', v)}
              onBlur={() => markTouched('defaultCc')}
              placeholder=""
              optional
              tooltip="If set, this address will be CC'd on every outgoing email."
              error={touched.defaultCc ? fieldErrors.defaultCc : undefined}
            />
          </div>
        </div>
      </div>

      {/* ─── Action Buttons ──────────────────────────────────────── */}
      <div className="rounded-xl border border-slate-200/80 bg-white p-6 shadow-sm">
        <div className="flex flex-wrap items-center gap-3">
          <Button
            onClick={() => {
              // Touch all required fields to surface errors
              setTouched({ host: true, port: true, fromEmail: true, fromName: true });
              if (hasErrors) {
                addToast('error', 'Please fix the validation errors before saving');
                return;
              }
              onSave();
            }}
            disabled={saving}
            variant="primary"
            size="md"
          >
            {saving ? 'Saving…' : 'Save SMTP Configuration'}
          </Button>

          <Button
            onClick={handleTestConnection}
            disabled={saving || testConnLoading || !smtpForm.host.trim()}
            variant="secondary"
            size="md"
            loading={testConnLoading}
            loadingText="Testing…"
          >
            Test Connection
          </Button>

          {smtpConfigExists && (
            <Button
              onClick={() => {
                setTestEmailResult(null);
                setTestEmailRecipient('');
                setShowTestEmailDialog(true);
              }}
              disabled={saving}
              variant="secondary"
              size="md"
            >
              Send Test Email
            </Button>
          )}

          <div className="flex-1" />

          {smtpConfigExists && (
            <Button
              onClick={onDelete}
              disabled={saving}
              variant="destructive-outline"
              size="sm"
            >
              Delete SMTP Config
            </Button>
          )}
        </div>

        {/* Inline test connection result */}
        {testConnResult && (
          <div className="mt-3">
            <TestResultBanner success={testConnResult.success} message={testConnResult.message} />
          </div>
        )}
      </div>

      {/* ─── Send Test Email Dialog ─────────────────────────────── */}
      {showTestEmailDialog && (
        <SmtpDialog
          title="Send Test Email"
          onClose={() => setShowTestEmailDialog(false)}
        >
          <div className="mb-4">
            <label className="mb-1 block text-sm font-medium text-slate-700">
              Recipient Email Address
            </label>
            <input
              type="email"
              value={testEmailRecipient}
              onChange={(e) => setTestEmailRecipient(e.target.value)}
              placeholder="recipient@example.com"
              className="w-full rounded-lg border border-slate-300 px-3 py-2 text-sm focus:border-indigo-500 focus:outline-none focus:ring-1 focus:ring-indigo-500"
              onKeyDown={(e) => {
                if (e.key === 'Enter' && testEmailRecipient.trim()) {
                  handleSendTestEmail();
                }
              }}
            />
          </div>
          {testEmailResult && (
            <TestResultBanner success={testEmailResult.success} message={testEmailResult.message} />
          )}
          <div className="mt-4 flex justify-end gap-2">
            <Button
              onClick={() => setShowTestEmailDialog(false)}
              variant="secondary"
              size="sm"
            >
              Close
            </Button>
            <Button
              onClick={handleSendTestEmail}
              disabled={testEmailLoading || !testEmailRecipient.trim()}
              variant="primary"
              size="md"
              loading={testEmailLoading}
              loadingText="Sending…"
            >
              Send Test Email
            </Button>
          </div>
        </SmtpDialog>
      )}
    </>
  );
}

// ─── SMTP Helpers ────────────────────────────────────────────────────────

interface SmtpFieldProps {
  label: string;
  value: string;
  onChange: (v: string) => void;
  onBlur?: () => void;
  placeholder?: string;
  optional?: boolean;
  disabled?: boolean;
  tooltip?: string;
  /** Inline validation error message — shown below the input. */
  error?: string;
}

function SmtpField({ label, value, onChange, onBlur, placeholder, optional, disabled, tooltip, error }: SmtpFieldProps) {
  return (
    <div>
      <label className="mb-1 flex items-center gap-1.5 text-sm font-medium text-slate-700">
        {label}
        {optional && <span className="text-slate-400">(optional)</span>}
        {tooltip && <InfoTip text={tooltip} />}
      </label>
      <input
        type="text"
        value={value}
        onChange={(e) => onChange(e.target.value)}
        onBlur={onBlur}
        disabled={disabled}
        className={`w-full rounded-lg border px-3 py-2 text-sm focus:outline-none focus:ring-1 disabled:bg-slate-50 disabled:text-slate-400 ${
          error
            ? 'border-red-400 focus:border-red-500 focus:ring-red-500'
            : 'border-slate-300 focus:border-indigo-500 focus:ring-indigo-500'
        }`}
        placeholder={placeholder}
      />
      {error && <p className="mt-1 text-xs text-red-500">{error}</p>}
    </div>
  );
}

/** Modal dialog wrapper for SMTP test dialogs. */
function SmtpDialog({ title, onClose, children }: { title: string; onClose: () => void; children: React.ReactNode }) {
  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center">
      {/* Backdrop */}
      <div className="absolute inset-0 bg-black/40" onClick={onClose} />
      {/* Dialog */}
      <div className="relative w-full max-w-md rounded-xl border border-slate-200 bg-white p-6 shadow-xl">
        <div className="mb-4 flex items-center justify-between">
          <h3 className="text-lg font-semibold text-slate-800">{title}</h3>
          <button
            onClick={onClose}
            className="flex h-7 w-7 items-center justify-center rounded-lg text-slate-400 hover:bg-slate-100 hover:text-slate-600 transition-colors"
            aria-label="Close dialog"
          >
            <svg className="h-4 w-4" fill="none" viewBox="0 0 24 24" strokeWidth={2} stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" d="M6 18 18 6M6 6l12 12" />
            </svg>
          </button>
        </div>
        {children}
      </div>
    </div>
  );
}

/** Success/error banner for test results. */
function TestResultBanner({ success, message }: { success: boolean; message: string }) {
  return (
    <div
      className={`rounded-lg border px-4 py-3 text-sm ${
        success
          ? 'border-emerald-200 bg-emerald-50 text-emerald-800'
          : 'border-red-200 bg-red-50 text-red-800'
      }`}
    >
      <div className="flex items-start gap-2">
        {success ? (
          <svg className="mt-0.5 h-4 w-4 shrink-0 text-emerald-600" fill="none" viewBox="0 0 24 24" strokeWidth={2} stroke="currentColor">
            <path strokeLinecap="round" strokeLinejoin="round" d="m4.5 12.75 6 6 9-13.5" />
          </svg>
        ) : (
          <svg className="mt-0.5 h-4 w-4 shrink-0 text-red-600" fill="none" viewBox="0 0 24 24" strokeWidth={2} stroke="currentColor">
            <path strokeLinecap="round" strokeLinejoin="round" d="M6 18 18 6M6 6l12 12" />
          </svg>
        )}
        <span>{message}</span>
      </div>
    </div>
  );
}

// ─── Helpers ─────────────────────────────────────────────────────────────

interface SsoFieldProps {
  label: string;
  value: string;
  onChange: (v: string) => void;
  placeholder?: string;
  optional?: boolean;
  tooltip?: string;
}

function SsoField({ label, value, onChange, placeholder, optional, tooltip }: SsoFieldProps) {
  return (
    <div>
      <label className="mb-1 flex items-center gap-1.5 text-sm font-medium text-slate-700">
        {label}
        {optional && <span className="text-slate-400">(optional)</span>}
        {tooltip && <InfoTip text={tooltip} />}
      </label>
      <input
        type="text"
        value={value}
        onChange={(e) => onChange(e.target.value)}
        className="w-full rounded-lg border border-slate-300 px-3 py-2 text-sm focus:border-indigo-500 focus:outline-none focus:ring-1 focus:ring-indigo-500"
        placeholder={placeholder}
      />
    </div>
  );
}

/**
 * Read-only ACS URL display with copy-to-clipboard button.
 * Provide this URL to your Identity Provider as the Reply / ACS URL.
 */
function AcsUrlDisplay({ acsUrl }: { acsUrl: string | null }) {
  const [copied, setCopied] = useState(false);

  if (!acsUrl) return null;

  const handleCopy = async () => {
    try {
      await navigator.clipboard.writeText(acsUrl);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    } catch {
      // Fallback for older browsers
      const textarea = document.createElement('textarea');
      textarea.value = acsUrl;
      document.body.appendChild(textarea);
      textarea.select();
      document.execCommand('copy');
      document.body.removeChild(textarea);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    }
  };

  return (
    <div>
      <dt className="mb-1.5 flex items-center gap-1.5 text-xs font-medium uppercase tracking-wider text-slate-400">
        ACS URL (Assertion Consumer Service)
        <InfoTip text="The ACS (Assertion Consumer Service) URL is the endpoint on this application where your IdP sends the SAML response after authenticating a user. Copy this URL and paste it into your IdP's 'Reply URL' or 'ACS URL' field." />
      </dt>
      <dd className="flex items-center gap-2">
        <div className="flex-1 rounded-lg border border-slate-200 bg-slate-50 px-3 py-2 text-xs font-mono text-slate-600 select-all">
          {acsUrl}
        </div>
        <button
          type="button"
          onClick={handleCopy}
          className={`flex h-8 w-8 shrink-0 items-center justify-center rounded-lg border transition-all duration-150 ${
            copied
              ? 'border-emerald-300 bg-emerald-50 text-emerald-600'
              : 'border-slate-300 bg-white text-slate-500 hover:bg-slate-50 hover:text-slate-700'
          }`}
          title={copied ? 'Copied!' : 'Copy ACS URL'}
          aria-label={copied ? 'Copied!' : 'Copy ACS URL'}
        >
          {copied ? (
            <svg className="h-4 w-4" fill="none" viewBox="0 0 24 24" strokeWidth={2} stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" d="m4.5 12.75 6 6 9-13.5" />
            </svg>
          ) : (
            <svg className="h-4 w-4" fill="none" viewBox="0 0 24 24" strokeWidth={2} stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" d="M15.666 3.888A2.25 2.25 0 0 0 13.5 2.25h-3c-1.03 0-1.9.693-2.166 1.638m7.332 0c.055.194.084.4.084.612v0a.75.75 0 0 1-.75.75H9.75a.75.75 0 0 1-.75-.75v0c0-.212.03-.418.084-.612m7.332 0c.646.049 1.288.11 1.927.184 1.1.128 1.907 1.077 1.907 2.185V19.5a2.25 2.25 0 0 1-2.25 2.25H6.75A2.25 2.25 0 0 1 4.5 19.5V6.257c0-1.108.806-2.057 1.907-2.185a48.208 48.208 0 0 1 1.927-.184" />
            </svg>
          )}
        </button>
      </dd>
    </div>
  );
}

// ─── Members Section ─────────────────────────────────────────────────────

const MEMBERS_PAGE_SIZE = 10;

interface MembersSectionProps {
  currentUserId: string;
  currentUserRole: UserRole;
}

function MembersSection({ currentUserId, currentUserRole }: MembersSectionProps) {
  const { prefs } = useUserPreferences();
  const { addToast } = useToast();

  const [users, setUsers] = useState<User[]>([]);
  const [pendingInvites, setPendingInvites] = useState<PendingInvite[]>([]);
  const [loading, setLoading] = useState(true);
  const [actionInProgress, setActionInProgress] = useState<string | null>(null);
  const [showInviteDialog, setShowInviteDialog] = useState(false);
  const [smtpConfigured, setSmtpConfigured] = useState<boolean | null>(null);

  // Confirm dialog state
  const [confirmDlg, setConfirmDlg] = useState<{
    title: string;
    message: string;
    confirmLabel: string;
    variant: 'danger' | 'primary';
    onConfirm: () => void;
  } | null>(null);

  // Tab state
  const [membersTab, setMembersTab] = useState<'active' | 'pending'>('active');

  // Search & pagination
  const [search, setSearch] = useState('');
  const [page, setPage] = useState(1);

  // ─── Load users ─────────────────────────────────────────────────────

  const loadUsers = useCallback(async () => {
    try {
      setLoading(true);
      const [usersData, invitesData] = await Promise.all([
        getUsers(),
        getPendingInvites().catch(() => [] as PendingInvite[]),
      ]);
      setUsers(usersData);
      setPendingInvites(invitesData);
    } catch (err) {
      addToast('error', err instanceof Error ? err.message : 'Failed to load users');
    } finally {
      setLoading(false);
    }
  }, [addToast]);

  useEffect(() => {
    loadUsers();
  }, [loadUsers]);

  // ─── Check SMTP status ─────────────────────────────────────────────

  useEffect(() => {
    getInviteSmtpStatus()
      .then(({ configured }) => setSmtpConfigured(configured))
      .catch(() => setSmtpConfigured(false));
  }, []);

  // ─── Filtered & paginated users ─────────────────────────────────────

  const filteredUsers = useMemo(() => {
    if (!search.trim()) return users;
    const q = search.toLowerCase();
    return users.filter(
      (u) =>
        `${u.firstName} ${u.lastName}`.toLowerCase().includes(q) ||
        u.email.toLowerCase().includes(q),
    );
  }, [users, search]);

  const totalPages = Math.max(1, Math.ceil(filteredUsers.length / MEMBERS_PAGE_SIZE));
  const paginatedUsers = useMemo(() => {
    const start = (page - 1) * MEMBERS_PAGE_SIZE;
    return filteredUsers.slice(start, start + MEMBERS_PAGE_SIZE);
  }, [filteredUsers, page]);

  // Reset to page 1 when search changes
  useEffect(() => {
    setPage(1);
  }, [search]);

  // ─── Handlers ───────────────────────────────────────────────────────

  const executeToggleBlock = async (u: User) => {
    setActionInProgress(u.id);
    try {
      const updated = await updateUser(u.id, { isActive: !u.isActive });
      setUsers((prev) => prev.map((x) => (x.id === updated.id ? updated : x)));
      addToast('success', `${updated.firstName} ${updated.lastName} ${updated.isActive ? 'unblocked' : 'blocked'}`);
    } catch (err) {
      addToast('error', err instanceof Error ? err.message : 'Failed to update user');
    } finally {
      setActionInProgress(null);
    }
  };

  const handleToggleBlock = (u: User) => {
    const action = u.isActive ? 'block' : 'unblock';
    setConfirmDlg({
      title: `${action.charAt(0).toUpperCase() + action.slice(1)} User`,
      message: `Are you sure you want to ${action} ${u.firstName} ${u.lastName}?`,
      confirmLabel: action.charAt(0).toUpperCase() + action.slice(1),
      variant: u.isActive ? 'danger' : 'primary',
      onConfirm: () => { setConfirmDlg(null); executeToggleBlock(u); },
    });
  };

  const executeChangeRole = async (u: User, newRole: UserRole, confirmOwnerTransfer?: boolean) => {
    setActionInProgress(u.id);
    try {
      const updated = await updateUser(u.id, { role: newRole, ...(confirmOwnerTransfer ? { confirmOwnerTransfer: true } : {}) });
      setUsers((prev) => prev.map((x) => (x.id === updated.id ? updated : x)));
      addToast('success', `${updated.firstName} ${updated.lastName} role changed to ${newRole}`);
    } catch (err) {
      addToast('error', err instanceof Error ? err.message : 'Failed to change role');
    } finally {
      setActionInProgress(null);
    }
  };

  const handleChangeRole = (u: User, newRole: UserRole) => {
    if (newRole === u.role) return;

    // Owner transfer requires confirmation dialog
    // eslint-disable-next-line no-restricted-syntax -- checking target role identity, not hierarchy
    if (newRole === 'owner') {
      setConfirmDlg({
        title: 'Transfer Ownership',
        message: `Are you sure you want to make ${u.firstName} ${u.lastName} an owner? This will give them full control over the organization, including the ability to manage other owners.`,
        confirmLabel: 'Transfer Ownership',
        variant: 'danger',
        onConfirm: () => { setConfirmDlg(null); executeChangeRole(u, newRole, true); },
      });
      return;
    }

    executeChangeRole(u, newRole);
  };

  const executeRemove = async (u: User) => {
    setActionInProgress(u.id);
    try {
      await deleteUser(u.id);
      setUsers((prev) => prev.filter((x) => x.id !== u.id));
      addToast('success', `${u.firstName} ${u.lastName} removed`);
    } catch (err) {
      addToast('error', err instanceof Error ? err.message : 'Failed to remove user');
    } finally {
      setActionInProgress(null);
    }
  };

  const handleRemove = (u: User) => {
    setConfirmDlg({
      title: 'Remove User',
      message: `Are you sure you want to remove ${u.firstName} ${u.lastName}? This will deactivate their account and revoke all sessions.`,
      confirmLabel: 'Remove',
      variant: 'danger',
      onConfirm: () => { setConfirmDlg(null); executeRemove(u); },
    });
  };

  const executeRevokeInvite = async (invite: PendingInvite) => {
    setActionInProgress(invite.id);
    try {
      await revokeInvite(invite.id);
      setPendingInvites((prev) => prev.filter((inv) => inv.id !== invite.id));
      addToast('success', `Invitation for ${invite.email} revoked`);
    } catch (err) {
      addToast('error', err instanceof Error ? err.message : 'Failed to revoke invite');
    } finally {
      setActionInProgress(null);
    }
  };

  const handleRevokeInvite = (invite: PendingInvite) => {
    setConfirmDlg({
      title: 'Revoke Invitation',
      message: `Are you sure you want to revoke the invitation for ${invite.email}?`,
      confirmLabel: 'Revoke',
      variant: 'danger',
      onConfirm: () => { setConfirmDlg(null); executeRevokeInvite(invite); },
    });
  };

  const executeResendInvite = async (invite: PendingInvite) => {
    setActionInProgress(invite.id);
    try {
      const { renewed } = await resendInvite(invite.id);
      if (renewed) {
        await loadUsers();
        addToast('success', `Invitation for ${invite.email} renewed and resent (new link generated)`);
      } else {
        addToast('success', `Invitation resent to ${invite.email}`);
        await loadUsers();
      }
    } catch (err) {
      addToast('error', err instanceof Error ? err.message : 'Failed to resend invite');
    } finally {
      setActionInProgress(null);
    }
  };

  const handleResendInvite = (invite: PendingInvite) => {
    setConfirmDlg({
      title: 'Resend Invitation',
      message: `Resend the invitation email to ${invite.email}?`,
      confirmLabel: 'Resend',
      variant: 'primary',
      onConfirm: () => { setConfirmDlg(null); executeResendInvite(invite); },
    });
  };

  // ─── Render ─────────────────────────────────────────────────────────

  return (
    <>
      {/* Header with Invite button */}
      <div className="mb-5 flex items-center justify-between">
        <h1 className="text-xl font-bold text-slate-800">Members</h1>
        <Button
          onClick={() => setShowInviteDialog(true)}
          disabled={smtpConfigured !== true}
          title={smtpConfigured === false ? 'SMTP must be configured before inviting users' : undefined}
          variant="primary"
          size="sm"
          leftIcon={
            <svg className="h-4 w-4" fill="none" viewBox="0 0 24 24" strokeWidth={2} stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" d="M21.75 6.75v10.5a2.25 2.25 0 0 1-2.25 2.25h-15a2.25 2.25 0 0 1-2.25-2.25V6.75m19.5 0A2.25 2.25 0 0 0 19.5 4.5h-15a2.25 2.25 0 0 0-2.25 2.25m19.5 0v.243a2.25 2.25 0 0 1-1.07 1.916l-7.5 4.615a2.25 2.25 0 0 1-2.36 0L3.32 8.91a2.25 2.25 0 0 1-1.07-1.916V6.75" />
            </svg>
          }
        >
          Invite Users
        </Button>
      </div>

      {/* SMTP not configured warning */}
      {smtpConfigured === false && (
        <div className="mb-4 flex items-center gap-2 rounded-lg border border-amber-200 bg-amber-50 px-4 py-2.5 text-sm text-amber-800">
          <svg className="h-4 w-4 shrink-0" fill="none" viewBox="0 0 24 24" strokeWidth={2} stroke="currentColor">
            <path strokeLinecap="round" strokeLinejoin="round" d="M12 9v3.75m-9.303 3.376c-.866 1.5.217 3.374 1.948 3.374h14.71c1.73 0 2.813-1.874 1.948-3.374L13.949 3.378c-.866-1.5-3.032-1.5-3.898 0L2.697 16.126ZM12 15.75h.007v.008H12v-.008Z" />
          </svg>
          <span>
            SMTP is not configured. Configure email settings in the{' '}
            <strong>SMTP</strong> section to enable user invitations.
          </span>
        </div>
      )}

      {/* Tabs: Active Users / Pending */}
      <div className="mb-4 flex items-center gap-1 border-b border-slate-200">
        <button
          onClick={() => setMembersTab('active')}
          className={`relative px-4 py-2.5 text-sm font-medium transition-colors ${
            membersTab === 'active'
              ? 'text-indigo-600'
              : 'text-slate-500 hover:text-slate-700'
          }`}
        >
          Active Users
          <span className="ml-1.5 text-xs text-slate-400">({users.length})</span>
          {membersTab === 'active' && (
            <span className="absolute inset-x-0 -bottom-px h-0.5 bg-indigo-600 rounded-full" />
          )}
        </button>
        <button
          onClick={() => setMembersTab('pending')}
          className={`relative px-4 py-2.5 text-sm font-medium transition-colors ${
            membersTab === 'pending'
              ? 'text-indigo-600'
              : 'text-slate-500 hover:text-slate-700'
          }`}
        >
          Pending
          {pendingInvites.length > 0 && (
            <span className={`ml-1.5 inline-flex items-center rounded-full px-1.5 py-0.5 text-[10px] font-semibold ${
              membersTab === 'pending'
                ? 'bg-indigo-100 text-indigo-600'
                : 'bg-amber-100 text-amber-700'
            }`}>
              {pendingInvites.length}
            </span>
          )}
          {pendingInvites.length === 0 && (
            <span className="ml-1.5 text-xs text-slate-400">(0)</span>
          )}
          {membersTab === 'pending' && (
            <span className="absolute inset-x-0 -bottom-px h-0.5 bg-indigo-600 rounded-full" />
          )}
        </button>
      </div>

      {/* ─── Pending Invites Tab ──────────────────────────────────────── */}
      {membersTab === 'pending' && (
        <div>
          {loading ? (
            <div className="flex items-center justify-center py-12">
              <Spinner size="md" />
            </div>
          ) : pendingInvites.length === 0 ? (
            <div className="flex flex-col items-center justify-center py-12 text-slate-400">
              <svg className="mb-2 h-8 w-8" fill="none" viewBox="0 0 24 24" strokeWidth={1.5} stroke="currentColor">
                <path strokeLinecap="round" strokeLinejoin="round" d="M21.75 6.75v10.5a2.25 2.25 0 0 1-2.25 2.25h-15a2.25 2.25 0 0 1-2.25-2.25V6.75m19.5 0A2.25 2.25 0 0 0 19.5 4.5h-15a2.25 2.25 0 0 0-2.25 2.25m19.5 0v.243a2.25 2.25 0 0 1-1.07 1.916l-7.5 4.615a2.25 2.25 0 0 1-2.36 0L3.32 8.91a2.25 2.25 0 0 1-1.07-1.916V6.75" />
              </svg>
              <p className="text-sm">No pending invitations</p>
            </div>
          ) : (
            <div className="rounded-xl border border-slate-200/80 bg-white shadow-sm overflow-hidden">
              <table className="w-full text-left text-sm">
                <thead>
                  <tr className="border-b border-slate-100 bg-slate-50/50">
                    <th className="px-4 py-3 font-medium text-slate-500">Email</th>
                    <th className="px-4 py-3 font-medium text-slate-500">Role</th>
                    <th className="px-4 py-3 font-medium text-slate-500">Status</th>
                    <th className="px-4 py-3 font-medium text-slate-500">Invited By</th>
                    <th className="px-4 py-3 font-medium text-slate-500">Expires</th>
                    <th className="px-4 py-3 text-right font-medium text-slate-500">Actions</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-100">
                  {pendingInvites.map((inv) => {
                    const busy = actionInProgress === inv.id;
                    const expiresDate = new Date(inv.expiresAt);
                    // eslint-disable-next-line react-hooks/purity
                    const isExpiringSoon = !inv.expired && expiresDate.getTime() - Date.now() < 15 * 60 * 1000;
                    return (
                      <tr key={inv.id} className={`transition-colors ${busy ? 'opacity-60' : 'hover:bg-slate-50/50'} ${inv.expired ? 'bg-slate-50/30' : ''}`}>
                        <td className="px-4 py-3 font-medium text-slate-700">{inv.email}</td>
                        <td className="px-4 py-3">
                          <RoleBadge role={inv.role} />
                        </td>
                        <td className="px-4 py-3">
                          {inv.expired ? (
                            <span className="inline-flex items-center gap-1 rounded-full bg-red-50 px-2 py-0.5 text-xs font-semibold text-red-600">
                              <span className="h-1.5 w-1.5 rounded-full bg-red-400" />
                              Expired
                            </span>
                          ) : isExpiringSoon ? (
                            <span className="inline-flex items-center gap-1 rounded-full bg-amber-50 px-2 py-0.5 text-xs font-semibold text-amber-600">
                              <span className="h-1.5 w-1.5 rounded-full bg-amber-400" />
                              Expiring soon
                            </span>
                          ) : (
                            <span className="inline-flex items-center gap-1 rounded-full bg-emerald-50 px-2 py-0.5 text-xs font-semibold text-emerald-700">
                              <span className="h-1.5 w-1.5 rounded-full bg-emerald-500" />
                              Pending
                            </span>
                          )}
                        </td>
                        <td className="px-4 py-3 text-slate-500">{inv.inviterName}</td>
                        <td className="px-4 py-3">
                          <span className={`text-xs ${inv.expired ? 'text-red-500 font-medium' : isExpiringSoon ? 'text-amber-500 font-medium' : 'text-slate-500'}`}>
                            {formatDateWithPrefs(expiresDate.toISOString(), prefs)}
                          </span>
                        </td>
                        <td className="px-4 py-3 text-right">
                          <div className="flex items-center justify-end gap-2">
                            <Button
                              onClick={() => handleResendInvite(inv)}
                              disabled={busy}
                              variant="ghost"
                              size="xs"
                              className="text-indigo-600 hover:bg-indigo-50"
                            >
                              Resend
                            </Button>
                            {!inv.expired && (
                              <Button
                                onClick={() => handleRevokeInvite(inv)}
                                disabled={busy}
                                variant="destructive-outline"
                                size="xs"
                              >
                                Revoke
                              </Button>
                            )}
                          </div>
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          )}
        </div>
      )}

      {/* ─── Active Users Tab ─────────────────────────────────────────── */}
      {membersTab === 'active' && (
        <>
      {/* Search bar */}
      <div className="mb-4">
        <div className="relative">
          <svg
            className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-400"
            fill="none"
            viewBox="0 0 24 24"
            strokeWidth={2}
            stroke="currentColor"
          >
            <path strokeLinecap="round" strokeLinejoin="round" d="m21 21-5.197-5.197m0 0A7.5 7.5 0 1 0 5.196 5.196a7.5 7.5 0 0 0 10.607 10.607Z" />
          </svg>
          <input
            type="text"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder="Search by name or email…"
            className="w-full rounded-lg border border-slate-300 py-2 pl-10 pr-3 text-sm text-slate-800 placeholder:text-slate-400 focus:border-indigo-500 focus:outline-none focus:ring-1 focus:ring-indigo-500"
          />
        </div>
      </div>

      {/* Users table */}
      <div className="rounded-xl border border-slate-200/80 bg-white shadow-sm overflow-hidden">
        {loading ? (
          <div className="flex items-center justify-center py-12">
            <Spinner size="md" />
          </div>
        ) : paginatedUsers.length === 0 ? (
          <div className="flex flex-col items-center justify-center py-12 text-slate-400">
            <svg className="mb-2 h-8 w-8" fill="none" viewBox="0 0 24 24" strokeWidth={1.5} stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" d="M15.75 6a3.75 3.75 0 1 1-7.5 0 3.75 3.75 0 0 1 7.5 0ZM4.501 20.118a7.5 7.5 0 0 1 14.998 0A17.933 17.933 0 0 1 12 21.75c-2.676 0-5.216-.584-7.499-1.632Z" />
            </svg>
            <p className="text-sm">{search ? 'No users match your search' : 'No users found'}</p>
          </div>
        ) : (
          <table className="w-full text-left text-sm">
            <thead>
              <tr className="border-b border-slate-100 bg-slate-50/50">
                <th className="px-4 py-3 font-medium text-slate-500">Full Name</th>
                <th className="px-4 py-3 font-medium text-slate-500">Email</th>
                <th className="px-4 py-3 font-medium text-slate-500">Last Login</th>
                <th className="px-4 py-3 font-medium text-slate-500">Role</th>
                <th className="px-4 py-3 font-medium text-slate-500">Status</th>
                <th className="px-4 py-3 text-right font-medium text-slate-500">Actions</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100">
              {paginatedUsers.map((u) => {
                const isSelf = u.id === currentUserId;
                const busy = actionInProgress === u.id;
                // Permission check: can the current user edit this user?
                // Owner can edit anyone; admin can only edit 'user' role
                /* eslint-disable no-restricted-syntax -- intentional exact-role checks:
                   owner and admin are separate branches mirroring canModifyUser from @skillspell/shared.
                   isAtLeast is not appropriate here because each role has different edit permissions. */
                const canEditUser = !isSelf && (
                  currentUserRole === 'owner' ||
                  (currentUserRole === 'admin' && u.role === 'user')
                );
                /* eslint-enable no-restricted-syntax */
                return (
                  <tr key={u.id} className={`transition-colors ${busy ? 'opacity-60' : 'hover:bg-slate-50/50'}`}>
                    {/* Full Name */}
                    <td className="px-4 py-3 font-medium text-slate-800">
                      {u.firstName} {u.lastName}
                      {isSelf && (
                        <span className="ml-1.5 inline-flex items-center rounded-full bg-indigo-50 px-1.5 py-0.5 text-[10px] font-semibold text-indigo-600">
                          You
                        </span>
                      )}
                    </td>

                    {/* Email */}
                    <td className="px-4 py-3 text-slate-600">{u.email}</td>

                    {/* Last Login */}
                    <td className="px-4 py-3 text-slate-500">
                      {u.lastLoginAt
                        ? formatDateWithPrefs(u.lastLoginAt, prefs)
                        : <span className="text-slate-300">Never</span>}
                    </td>

                    {/* Role */}
                    <td className="px-4 py-3">
                      {isSelf || !canEditUser ? (
                        <RoleBadge role={u.role} />
                      ) : (
                        <select
                          value={u.role}
                          onChange={(e) => handleChangeRole(u, e.target.value as UserRole)}
                          disabled={busy}
                          aria-label={`Role for ${u.firstName} ${u.lastName}`}
                          className="rounded-md border border-slate-200 bg-white px-2 py-1 text-xs font-medium text-slate-700 focus:border-indigo-500 focus:outline-none focus:ring-1 focus:ring-indigo-500 disabled:opacity-50"
                        >
                          <option value="user">User</option>
                          <option value="admin">Admin</option>
                          {/* eslint-disable-next-line no-restricted-syntax -- exact check: only owners can promote others to owner */}
                          {currentUserRole === 'owner' && <option value="owner">Owner</option>}
                        </select>
                      )}
                    </td>

                    {/* Status */}
                    <td className="px-4 py-3">
                      <StatusBadge isActive={u.isActive} />
                    </td>

                    {/* Actions */}
                    <td className="px-4 py-3 text-right">
                      <div className="flex items-center justify-end gap-1.5">
                        {/* Block / Unlock */}
                        {canEditUser && (
                          <button
                            onClick={() => handleToggleBlock(u)}
                            disabled={busy}
                            title={u.isActive ? 'Block user' : 'Unlock user'}
                            className={`rounded-lg p-1.5 text-xs font-medium transition-colors disabled:opacity-50 ${
                              u.isActive
                                ? 'text-amber-600 hover:bg-amber-50'
                                : 'text-emerald-600 hover:bg-emerald-50'
                            }`}
                          >
                            {u.isActive ? (
                              <svg className="h-4 w-4" fill="none" viewBox="0 0 24 24" strokeWidth={1.5} stroke="currentColor">
                                <path strokeLinecap="round" strokeLinejoin="round" d="M18.364 18.364A9 9 0 0 0 5.636 5.636m12.728 12.728A9 9 0 0 1 5.636 5.636m12.728 12.728L5.636 5.636" />
                              </svg>
                            ) : (
                              <svg className="h-4 w-4" fill="none" viewBox="0 0 24 24" strokeWidth={1.5} stroke="currentColor">
                                <path strokeLinecap="round" strokeLinejoin="round" d="M13.5 10.5V6.75a4.5 4.5 0 1 1 9 0v3.75M3.75 21.75h10.5a2.25 2.25 0 0 0 2.25-2.25v-6.75a2.25 2.25 0 0 0-2.25-2.25H3.75a2.25 2.25 0 0 0-2.25 2.25v6.75a2.25 2.25 0 0 0 2.25 2.25Z" />
                              </svg>
                            )}
                          </button>
                        )}

                        {/* Remove */}
                        {canEditUser && (
                          <button
                            onClick={() => handleRemove(u)}
                            disabled={busy}
                            title="Remove user"
                            className="rounded-lg p-1.5 text-red-500 transition-colors hover:bg-red-50 disabled:opacity-50"
                          >
                            <svg className="h-4 w-4" fill="none" viewBox="0 0 24 24" strokeWidth={1.5} stroke="currentColor">
                              <path strokeLinecap="round" strokeLinejoin="round" d="m14.74 9-.346 9m-4.788 0L9.26 9m9.968-3.21c.342.052.682.107 1.022.166m-1.022-.165L18.16 19.673a2.25 2.25 0 0 1-2.244 2.077H8.084a2.25 2.25 0 0 1-2.244-2.077L4.772 5.79m14.456 0a48.108 48.108 0 0 0-3.478-.397m-12 .562c.34-.059.68-.114 1.022-.165m0 0a48.11 48.11 0 0 1 3.478-.397m7.5 0v-.916c0-1.18-.91-2.164-2.09-2.201a51.964 51.964 0 0 0-3.32 0c-1.18.037-2.09 1.022-2.09 2.201v.916m7.5 0a48.667 48.667 0 0 0-7.5 0" />
                            </svg>
                          </button>
                        )}

                        {/* Self or insufficient permissions — no actions */}
                        {(isSelf || !canEditUser) && (
                          <span className="px-1.5 text-xs text-slate-300">—</span>
                        )}
                      </div>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        )}

        {/* Pagination */}
        {!loading && totalPages > 1 && (
          <div className="flex items-center justify-between border-t border-slate-100 px-4 py-3">
            <p className="text-xs text-slate-500">
              Page {page} of {totalPages}
            </p>
            <div className="flex gap-1">
              <Button
                onClick={() => setPage((p) => Math.max(1, p - 1))}
                disabled={page <= 1}
                variant="secondary"
                size="xs"
              >
                Previous
              </Button>
              <Button
                onClick={() => setPage((p) => Math.min(totalPages, p + 1))}
                disabled={page >= totalPages}
                variant="secondary"
                size="xs"
              >
                Next
              </Button>
            </div>
          </div>
        )}
      </div>
        </>
      )}

      {/* Confirm Dialog */}
      <ConfirmDialog
        open={!!confirmDlg}
        title={confirmDlg?.title ?? ''}
        confirmLabel={confirmDlg?.confirmLabel}
        variant={confirmDlg?.variant}
        onConfirm={() => confirmDlg?.onConfirm()}
        onCancel={() => setConfirmDlg(null)}
      >
        <p>{confirmDlg?.message}</p>
      </ConfirmDialog>

      {/* Invite Users Dialog */}
      {showInviteDialog && (
        <InviteUsersDialog
          onClose={() => setShowInviteDialog(false)}
          onInvitesSent={() => loadUsers()}
        />
      )}
    </>
  );
}

// ─── Badge Helpers ───────────────────────────────────────────────────────

function RoleBadge({ role }: { role: UserRole }) {
  const colorMap: Record<UserRole, string> = {
    owner: 'bg-amber-50 text-amber-700',
    admin: 'bg-purple-50 text-purple-700',
    user: 'bg-slate-100 text-slate-600',
  };
  const labelMap: Record<UserRole, string> = {
    owner: 'Owner',
    admin: 'Admin',
    user: 'User',
  };
  return (
    <span
      className={`inline-flex items-center rounded-full px-2 py-0.5 text-xs font-semibold ${colorMap[role] ?? colorMap.user}`}
    >
      {labelMap[role] ?? role}
    </span>
  );
}

function StatusBadge({ isActive }: { isActive: boolean }) {
  return (
    <span
      className={`inline-flex items-center gap-1 rounded-full px-2 py-0.5 text-xs font-semibold ${
        isActive
          ? 'bg-emerald-50 text-emerald-700'
          : 'bg-red-50 text-red-600'
      }`}
    >
      <span className={`h-1.5 w-1.5 rounded-full ${isActive ? 'bg-emerald-500' : 'bg-red-400'}`} />
      {isActive ? 'Active' : 'Blocked'}
    </span>
  );
}
