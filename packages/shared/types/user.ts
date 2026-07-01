/**
 * User management types shared between frontend and backend.
 */

// ─── Core Enums / Unions ────────────────────────────────────────────────────

/** User roles in the system. */
export type UserRole = 'owner' | 'admin' | 'user';

/** Authentication provider types. */
export type AuthProvider = 'local' | 'saml' | 'oidc';

/** Skill visibility for ownership/marketplace. */
export type SkillVisibility = 'private' | 'public';

// ─── Organization Entity ────────────────────────────────────────────────────

/**
 * Organization entity — singleton per deployment.
 * All users belong to this organization. SSO/SAML config is scoped to it.
 */
export interface Organization {
  id: string;
  name: string;
  /** Whether email/password login is enabled for the organization. Default: true. */
  passwordLoginEnabled: boolean;
  /** Whether SSO login is enabled for the organization. Default: true. */
  ssoLoginEnabled: boolean;
  /** IANA timezone identifier for new users (e.g. "America/New_York"). */
  defaultTimezone?: string;
  /** Which SSO protocol is currently active for this organization. */
  activeSsoProtocol?: 'saml' | 'oidc' | null;
  /** When true, org admins may approve or reject their own marketplace submissions. Default: false. */
  marketplaceAllowSelfApproval: boolean;
  /** Whether the marketplace is enabled for this organization. Default: true. Disables all marketplace UI and API. */
  marketplaceEnabled: boolean;
  createdAt: string;
  updatedAt: string;
}

// ─── User Entity ────────────────────────────────────────────────────────────

/** User entity stored in the database. */
export interface User {
  id: string;
  /** Organization this user belongs to. */
  orgId: string;
  email: string;
  firstName: string;
  lastName: string;
  role: UserRole;
  isActive: boolean;
  /** Auth providers linked to this account. */
  authProviders: AuthProvider[];
  /** Whether the user has completed their profile setup. */
  profileComplete: boolean;
  /** 2FA enabled flag (for future use). */
  twoFactorEnabled: boolean;
  createdAt: string;
  updatedAt: string;
  lastLoginAt?: string;
  /** IANA timezone identifier, e.g. "America/New_York". Defaults to browser timezone if unset. */
  timezone?: string;
  /** Preferred date display format. Defaults to "DD/MM/YYYY" if unset. */
  dateFormat?: 'MM/DD/YYYY' | 'DD/MM/YYYY' | 'YYYY-MM-DD';
}

/** Public-safe user info (no sensitive fields). */
export interface UserProfile {
  id: string;
  firstName: string;
  lastName: string;
  role: UserRole;
  createdAt: string;
}

/**
 * displayName is a computed getter — NOT stored in the database.
 * Used wherever a full name string is needed (UI headers, JWT payload, etc.).
 */
export function getDisplayName(
  user: Pick<User, 'firstName' | 'lastName'>,
): string {
  return `${user.firstName} ${user.lastName}`.trim();
}

// ─── Credential / Token Entities ────────────────────────────────────────────

/** User credential for local auth (stored separately from User). */
export interface UserCredential {
  userId: string;
  /** bcrypt-hashed password. */
  passwordHash: string;
  /** Force password change on next login. */
  mustChangePassword: boolean;
  /** Failed login attempt count (for rate limiting). */
  failedAttempts: number;
  /** Lockout until timestamp (ISO 8601). */
  lockedUntil?: string;
  updatedAt: string;
}

/** SSO link connecting a user to an external identity provider. */
export interface SsoLink {
  userId: string;
  provider: AuthProvider;
  providerUserId: string;
  providerEmail: string;
  providerDisplayName?: string;
  /** Raw claims/profile from the provider (for debugging). */
  providerProfile?: Record<string, unknown>;
  linkedAt: string;
}

/** Refresh token record for JWT token rotation. */
export interface RefreshToken {
  id: string;
  userId: string;
  /** SHA-256 hash of the actual token (never store raw). */
  tokenHash: string;
  /** User-agent or device identifier. */
  deviceInfo?: string;
  expiresAt: string;
  createdAt: string;
  /** Set to true when rotated (prevents reuse). */
  revoked: boolean;
}

/** Personal access token for CLI / API access (future). */
export interface ApiToken {
  id: string;
  userId: string;
  /** Human-readable name for the token. */
  name: string;
  /** SHA-256 hash of the token (prefix stored for identification). */
  tokenHash: string;
  /** First 8 chars of the token for display (e.g., "sksp_abc1***"). */
  tokenPrefix: string;
  /** Scopes granted to this token. */
  scopes: string[];
  expiresAt?: string;
  lastUsedAt?: string;
  createdAt: string;
  revoked: boolean;
}

/**
 * Personal access token for CLI / API authentication.
 *
 * Created via POST /api/auth/tokens. The raw token is returned once at creation
 * only — only the SHA-256 hash is stored in the database (D-02, D-04).
 *
 * The `prefix` field stores the first 8 characters after `sksp_` for display
 * in the Token Management UI without exposing the full token (D-02).
 */
export interface PersonalAccessToken {
  id: string;
  userId: string;
  /** Human-readable label provided by the user (e.g. "My CLI token"). */
  name: string;
  /** First 8 chars after `sksp_` — for display only (e.g. "sksp_abc1"). */
  prefix: string;
  /** SHA-256 hash of the raw token — never the raw token itself. */
  tokenHash: string;
  /** Expiry datetime as ISO 8601 string. NOT NULL per D-03. */
  expiresAt: string;
  /** Set when revoked via DELETE /api/auth/tokens/:id. Null if active. */
  revokedAt: string | null;
  /** Updated non-blocking on each successful PAT authentication. */
  lastUsedAt: string | null;
  createdAt: string;
}

/** Email change request entity. Stored at PK=USER#<userId> / SK=EMAIL_CHANGE. */
export interface EmailChangeRequest {
  userId: string;
  /** The new email address requested. */
  newEmail: string;
  /** SHA-256 hash of the verification token. */
  tokenHash: string;
  /** TTL — token is considered expired after 24 hours. */
  ttl: number;
  createdAt: string;
}

// ─── Setup State ────────────────────────────────────────────────────────────

/** First-run setup state stored in the auth table. */
export interface SetupState {
  /** Whether initial setup has been completed. */
  setupComplete: boolean;
  /** Admin user ID created during setup. */
  adminUserId: string;
  /** Organization ID created during setup. */
  orgId: string;
  /** When setup was completed. */
  completedAt: string;
}

// ─── SAML Configuration ────────────────────────────────────────────────────

/**
 * SAML Identity Provider configuration.
 * Stored in auth DB at PK=ORG#<orgId> / SK=SAML_CONFIG.
 */
export interface SamlProviderConfig {
  /** Unique provider ID — slug format, e.g. 'google-workspace', 'azure-ad'. */
  id: string;
  /** Display name shown on login page, e.g. 'Google Workspace', 'Microsoft'. */
  displayName: string;
  /** IdP Entity ID — from IdP metadata. */
  idpEntityId: string;
  /** IdP SSO URL — where to redirect for login. */
  idpSsoUrl: string;
  /** IdP SLO URL — where to redirect for logout (optional). */
  idpSloUrl?: string;
  /** IdP X.509 certificate — for signature validation. */
  idpCertificate: string;
  /** SP Entity ID — our identifier, e.g. 'https://skillspell.example.com'. */
  spEntityId: string;
  /** Attribute mapping — map IdP SAML claim names to our system attributes. */
  attributeMapping: {
    /** SAML claim name for the user's email address. */
    email: string;
    /** SAML claim name for the user's first name. */
    firstName: string;
    /** SAML claim name for the user's last name. */
    lastName: string;
  };
  /** Whether to auto-provision users on first SAML login. */
  autoProvision: boolean;
  /** Default role for auto-provisioned users. */
  defaultRole: UserRole;
  /** Optional icon URL for the login button. */
  iconUrl?: string;
  createdAt: string;
  updatedAt: string;
}

// ─── OIDC Configuration ────────────────────────────────────────────────────

/**
 * OIDC Identity Provider configuration.
 * Stored in oidc_configs table, scoped per organization (D-05).
 * clientSecret is stored encrypted (AES-256-GCM) — CR-03 mirrors SmtpConfig.encryptedPassword.
 * The plaintext secret is NEVER returned to the frontend.
 */
export interface OidcProviderConfig {
  /** OIDC issuer URL — used for discovery (appended with /.well-known/openid-configuration). */
  issuerUrl: string;
  /** OAuth2 client ID registered with the IdP. */
  clientId: string;
  /**
   * AES-256-GCM encrypted OAuth2 client secret.
   * Format: base64(iv):base64(authTag):base64(ciphertext).
   * OrganizationService encrypts before saving and decrypts before passing to OidcAuthService.
   * NEVER returned to the frontend — use OidcProviderConfigResponse.hasClientSecret.
   */
  encryptedClientSecret: string;
  /** OAuth2 scopes to request. Default: ['openid', 'email', 'profile']. */
  scopes: string[];
  /** Attribute mapping — map OIDC claim names to system attributes (D-04). */
  attributeMapping: {
    email: string;
    firstName: string;
    lastName: string;
  };
  /** Whether to auto-provision users on first OIDC login. */
  autoProvision: boolean;
  /** Default role for auto-provisioned users. */
  defaultRole: UserRole;
  /** Optional override for the authorization endpoint (skip discovery). */
  authorizationUrl?: string;
  /** Optional override for the token endpoint (skip discovery). */
  tokenUrl?: string;
  /** Optional override for the JWKS URI (skip discovery). */
  jwksUri?: string;
  createdAt: string;
  updatedAt: string;
}

/**
 * OidcProviderConfig as returned to the frontend — encryptedClientSecret is NEVER included.
 * hasClientSecret mirrors SmtpConfigResponse.hasPassword pattern.
 */
export interface OidcProviderConfigResponse extends Omit<OidcProviderConfig, 'encryptedClientSecret'> {
  /** True if a clientSecret is saved; false otherwise. */
  hasClientSecret: boolean;
}

// ─── SMTP Configuration ────────────────────────────────────────────────────

/**
 * SMTP connection security mode.
 * - 'none'     — No encryption (port 25). NOT recommended.
 * - 'starttls' — Connect plaintext, then upgrade via STARTTLS (port 587).
 * - 'tls'      — Implicit TLS from the start (port 465).
 */
export type SmtpSecurityMode = 'none' | 'starttls' | 'tls';

/**
 * SMTP authentication method.
 * - 'none'   — No authentication (open relay / internal relay).
 * - 'plain'  — Username + password (PLAIN/LOGIN mechanisms).
 * - 'oauth2' — OAuth2 bearer token (future use).
 */
export type SmtpAuthMethod = 'none' | 'plain' | 'oauth2';

/**
 * SMTP mail server configuration.
 * Stored per organization at PK=ORG#<orgId> / SK=SMTP_CONFIG.
 * Password is encrypted at rest using AES-256-GCM.
 */
export interface SmtpConfig {
  // ─── 1. Connection Fields ─────────────────────────────────────────
  /** SMTP server hostname, e.g. smtp.gmail.com */
  host: string;
  /** SMTP server port. Common: 587 (STARTTLS), 465 (SSL/TLS), 25 (unencrypted), 2525 (alt). */
  port: number;
  /** Connection security mode: none (port 25), starttls (port 587), or tls (port 465). */
  security: SmtpSecurityMode;

  // ─── 2. Authentication Fields ─────────────────────────────────────
  /** Authentication method: none (open relay), plain (username+password), oauth2 (future). */
  authMethod: SmtpAuthMethod;
  /** SMTP auth username (usually full email). Required when authMethod is 'plain'. */
  username: string;
  /**
   * Encrypted SMTP auth password (or App Password for 2FA accounts).
   * Stored as AES-256-GCM ciphertext. Never exposed to the frontend.
   * Only present when authMethod is 'plain'.
   */
  encryptedPassword: string;

  // ─── 3. Sender Information Fields ─────────────────────────────────
  /** Sender email address shown in the From field, e.g. noreply@company.com */
  fromEmail: string;
  /** Sender display name shown in the From field, e.g. SkillSpell */
  fromName: string;
  /** Optional Reply-To email address (if different from fromEmail). */
  replyToEmail?: string;
  /** Optional Reply-To display name. */
  replyToName?: string;

  // ─── 4. Advanced/Optional Fields ──────────────────────────────────
  /** Whether SMTP is enabled for sending emails. Master on/off switch. */
  enabled: boolean;
  /** TLS: reject unauthorized certificates. Default true. Set false for self-signed certs. */
  rejectUnauthorized: boolean;
  /** Connection timeout in milliseconds. Default 10000 (10s). */
  connectionTimeoutMs: number;
  /** Socket timeout in milliseconds. Default 30000 (30s). */
  socketTimeoutMs: number;
  /** Optional BCC address added to every outgoing email (e.g. for audit/compliance). */
  defaultBcc?: string;
  /** Optional CC address added to every outgoing email. */
  defaultCc?: string;

  createdAt: string;
  updatedAt: string;
}

/**
 * SmtpConfig as returned to the frontend — password is NEVER included.
 * This is the only shape that leaves the backend API.
 */
export interface SmtpConfigResponse {
  // ─── Connection ───────────────────────────────────────────────────
  host: string;
  port: number;
  security: SmtpSecurityMode;
  // ─── Authentication ───────────────────────────────────────────────
  authMethod: SmtpAuthMethod;
  username: string;
  /** Masked indicator: true if a password is set, false otherwise. */
  hasPassword: boolean;
  // ─── Sender Information ───────────────────────────────────────────
  fromEmail: string;
  fromName: string;
  replyToEmail?: string;
  replyToName?: string;
  // ─── Advanced ─────────────────────────────────────────────────────
  enabled: boolean;
  rejectUnauthorized: boolean;
  connectionTimeoutMs: number;
  socketTimeoutMs: number;
  defaultBcc?: string;
  defaultCc?: string;
  createdAt: string;
  updatedAt: string;
}

/** Request body for saving SMTP configuration (frontend → backend). */
export interface SaveSmtpConfigRequest {
  host: string;
  port: number;
  security: SmtpSecurityMode;
  authMethod: SmtpAuthMethod;
  username?: string;
  password?: string;
  fromEmail: string;
  fromName: string;
  replyToEmail?: string;
  replyToName?: string;
  enabled: boolean;
  rejectUnauthorized?: boolean;
  connectionTimeoutMs?: number;
  socketTimeoutMs?: number;
  defaultBcc?: string;
  defaultCc?: string;
}

// ─── JWT Payload ────────────────────────────────────────────────────────────

/** JWT access token payload. */
export interface JwtPayload {
  /** userId */
  sub: string;
  email: string;
  role: UserRole;
  firstName: string;
  lastName: string;
  /** Issued at (epoch seconds). */
  iat: number;
  /** Expiration (epoch seconds). */
  exp: number;
  /** Set to true if 2FA is pending (future). */
  twoFactorPending?: boolean;
}

/** Lightweight user info decoded from the JWT payload. */
export interface AuthUser {
  id: string;
  email: string;
  firstName: string;
  lastName: string;
  role: UserRole;
  /** Auth methods the user has configured (from /auth/me full response). */
  authProviders?: AuthProvider[];
  /** Account creation timestamp (from /auth/me full response). */
  createdAt?: string;
  /** IANA timezone identifier (from /auth/me full response). */
  timezone?: string;
  /** User's preferred date format (from /auth/me full response). */
  dateFormat?: 'MM/DD/YYYY' | 'DD/MM/YYYY' | 'YYYY-MM-DD';
}

// ─── API Request / Response Types ───────────────────────────────────────────

/** Fields the user can update on their own profile. */
export interface UpdateProfileRequest {
  firstName?: string;
  lastName?: string;
  timezone?: string;
  dateFormat?: 'MM/DD/YYYY' | 'DD/MM/YYYY' | 'YYYY-MM-DD';
}

/** Request to change email (local-only users). */
export interface ChangeEmailRequest {
  newEmail: string;
  /** Current password required for re-authentication. */
  currentPassword: string;
}

/** Confirm email change via token from verification email. */
export interface VerifyEmailRequest {
  token: string;
}

export interface LoginRequest {
  email: string;
  password: string;
}

export interface LoginResponse {
  accessToken: string;
  /** @deprecated Refresh token is now stored in an httpOnly cookie. This field may be absent in API responses. */
  refreshToken?: string;
  user: User;
}

export interface RefreshTokenRequest {
  /** @deprecated Refresh token is now sent via httpOnly cookie. */
  refreshToken?: string;
}

export interface RefreshTokenResponse {
  accessToken: string;
  /** @deprecated Refresh token is now stored in an httpOnly cookie. This field may be absent in API responses. */
  refreshToken?: string;
}

export interface SetupRequest {
  email: string;
  password: string;
  firstName: string;
  lastName: string;
  /** Organization name for the single-tenant org. */
  orgName: string;
  /** IANA timezone identifier, e.g. "America/New_York". Required at setup time. */
  timezone: string;
}

export interface SetupStatusResponse {
  setupComplete: boolean;
}

// ─── Marketplace Types ──────────────────────────────────────────────────────

export interface SkillRating {
  skillId: string;
  userId: string;
  rating: 1 | 2 | 3 | 4 | 5;
  review?: string;
  createdAt: string;
  updatedAt: string;
}

/** Stored at PK=SKILL#<forkedSkillId> / SK=FORK_ORIGIN. */
export interface SkillForkOrigin {
  skillId: string;
  originalSkillId: string;
  originalName: string;
  originalOwnerId: string;
  forkedAtVersion: number;
  forkedAt: string;
}

/** Stored at PK=FORKS#<originalSkillId> / SK=FORK#<forkedSkillId>. */
export interface ForkRecord {
  originalSkillId: string;
  forkedSkillId: string;
  forkedByUserId: string;
  forkedByDisplayName: string;
  forkedAtVersion: number;
  forkedAt: string;
}

/** Stored at PK=DOWNLOADS#<skillId> / SK=DL#<userId>#<timestamp>. */
export interface DownloadLog {
  skillId: string;
  userId: string;
  downloadedAt: string;
  format: string;
}

// ─── User CRUD (admin) ─────────────────────────────────────────────────────

export interface CreateUserData {
  /** Organization ID the user belongs to. */
  orgId: string;
  email: string;
  firstName: string;
  lastName: string;
  role: UserRole;
  /** Password for local auth (optional if SSO-only). */
  password?: string;
}

export interface UpdateUserData {
  firstName?: string;
  lastName?: string;
  role?: UserRole;
  isActive?: boolean;
  lastLoginAt?: string;
  authProviders?: AuthProvider[];
  timezone?: string;
  dateFormat?: 'MM/DD/YYYY' | 'DD/MM/YYYY' | 'YYYY-MM-DD';
}

// ─── Invite Token ───────────────────────────────────────────────────────────

/** Invitation token for user onboarding via email. */
export interface InviteToken {
  id: string;
  /** Organization the invite belongs to. */
  orgId: string;
  /** Email address the invite was sent to. */
  email: string;
  /** SHA-256 hash of the invite token (never store raw). */
  tokenHash: string;
  /** Admin user who created the invite. */
  invitedBy: string;
  /** Role assigned to the user upon registration. */
  role: UserRole;
  /** ISO 8601 expiration timestamp (1 hour from creation). */
  expiresAt: string;
  /** Whether the invite has been used to complete registration. */
  consumed: boolean;
  /** User ID created from this invite (set on consumption). */
  consumedByUserId?: string;
  /** ISO 8601 timestamp when the invite was consumed. */
  consumedAt?: string;
  createdAt: string;
}

/** Per-email result returned from the invite endpoint. */
export interface InviteResult {
  email: string;
  success: boolean;
  /** Error reason if success is false (e.g. 'Email already registered'). */
  error?: string;
}

/** Pending invite shown in the members list. */
export interface PendingInvite {
  id: string;
  email: string;
  role: UserRole;
  invitedBy: string;
  inviterName: string;
  expiresAt: string;
  createdAt: string;
  /** Whether the invite has expired (past expiresAt). */
  expired: boolean;
}
