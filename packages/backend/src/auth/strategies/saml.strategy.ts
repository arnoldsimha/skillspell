import { Inject, Injectable, Logger } from '@nestjs/common';
import { CACHE_MANAGER, type Cache } from '@nestjs/cache-manager';
import { ConfigService } from '@nestjs/config';
import {
  SAML,
  ValidateInResponseTo,
  type CacheItem,
  type CacheProvider,
  type SamlConfig,
} from '@node-saml/node-saml';
import { createHmac, randomBytes, timingSafeEqual } from 'node:crypto';
import {
  SAML_CONFIG_REPOSITORY,
  type ISamlConfigRepository,
  ORGANIZATION_REPOSITORY,
  type IOrganizationRepository,
  AUTH_TOKEN_REPOSITORY,
  type IAuthTokenRepository,
  USER_REPOSITORY,
  type IUserRepository,
  type SamlProviderConfig,
  type User,
  isValidEmail,
} from '@skillspell/shared';
import type { AppConfig } from '../../config/configuration.js';

/**
 * Result of a successful SAML assertion validation.
 */
export interface SamlValidationResult {
  user: User;
  providerUserId: string;
  providerEmail: string;
  providerDisplayName: string;
}

/**
 * SAML authentication service.
 *
 * Uses `@node-saml/passport-saml`'s low-level SAML class directly
 * (rather than the Passport strategy) for full control over the flow.
 *
 * This allows DB-backed config loaded per-request rather than at startup.
 *
 * Flow:
 * 1. `getLoginRedirectUrl()` → generates AuthnRequest, returns IdP redirect URL
 * 2. IdP posts SAMLResponse to callback
 * 3. `validateCallback()` → verifies signature, extracts user data, creates/links user
 */
/** SAML RelayState CSRF nonce validity window (5 minutes). */
const SAML_NONCE_TTL_MS = 5 * 60 * 1000;

/**
 * How long an outstanding AuthnRequest ID stays valid for InResponseTo
 * matching. Must comfortably exceed the login window (RelayState TTL +
 * time spent at the IdP).
 */
const SAML_REQUEST_ID_TTL_MS = 10 * 60 * 1000;

/**
 * node-saml CacheProvider backed by the Nest cache manager.
 *
 * createSamlInstance() builds a fresh SAML object per request, so node-saml's
 * default in-memory cache would be discarded before the callback arrives —
 * request IDs must live in a store that outlives the instance (and, with a
 * Redis-backed cache manager, is shared across nodes). node-saml consumes the
 * ID on successful validation, which is what makes a replayed assertion fail.
 */
class SamlRequestIdCacheProvider implements CacheProvider {
  private static readonly PREFIX = 'saml:reqid:';

  constructor(private readonly cacheManager: Cache) {}

  async saveAsync(key: string, value: string): Promise<CacheItem | null> {
    const cacheKey = SamlRequestIdCacheProvider.PREFIX + key;
    const existing = await this.cacheManager.get<string>(cacheKey);
    if (existing != null) return null; // node-saml contract: never overwrite
    await this.cacheManager.set(cacheKey, value, SAML_REQUEST_ID_TTL_MS);
    return { value, createdAt: Date.now() };
  }

  async getAsync(key: string): Promise<string | null> {
    const value = await this.cacheManager.get<string>(SamlRequestIdCacheProvider.PREFIX + key);
    return value ?? null;
  }

  async removeAsync(key: string | null): Promise<string | null> {
    if (key == null) return null;
    const cacheKey = SamlRequestIdCacheProvider.PREFIX + key;
    const existing = await this.cacheManager.get<string>(cacheKey);
    if (existing == null) return null;
    await this.cacheManager.del(cacheKey);
    return key;
  }
}

@Injectable()
export class SamlAuthService {
  private readonly logger = new Logger(SamlAuthService.name);
  private readonly jwtSecret: string;
  private readonly publicUrl: string;
  /** Shared across all per-request SAML instances — see SamlRequestIdCacheProvider. */
  readonly requestIdCache: CacheProvider;

  constructor(
    @Inject(SAML_CONFIG_REPOSITORY)
    private readonly samlConfigRepo: ISamlConfigRepository,
    @Inject(ORGANIZATION_REPOSITORY)
    private readonly orgRepo: IOrganizationRepository,
    @Inject(AUTH_TOKEN_REPOSITORY)
    private readonly authTokenRepo: IAuthTokenRepository,
    @Inject(USER_REPOSITORY)
    private readonly userRepo: IUserRepository,
    configService: ConfigService<AppConfig, true>,
    @Inject(CACHE_MANAGER) cacheManager: Cache,
  ) {
    this.jwtSecret = configService.get('auth.jwtSecret', { infer: true });
    this.publicUrl = configService.get('app.publicUrl', { infer: true }) || '';
    this.requestIdCache = new SamlRequestIdCacheProvider(cacheManager);
  }

  /**
   * Load SAML config from DB and create a SAML instance.
   * Returns null if SSO is not configured or disabled.
   */
  private async createSamlInstance(): Promise<{
    saml: SAML;
    config: SamlProviderConfig;
  } | null> {
    const org = await this.orgRepo.findSingleton();
    if (!org) return null;

    const config = await this.samlConfigRepo.getSamlConfig(org.id);
    if (!config) {
      return null;
    }

    const samlConfig: SamlConfig = {
      idpCert: config.idpCertificate,
      callbackUrl: `${this.publicUrl}/api/auth/saml/callback`,
      entryPoint: config.idpSsoUrl,
      issuer: config.spEntityId,
      wantAssertionsSigned: true,
      wantAuthnResponseSigned: false,
      idpIssuer: config.idpEntityId,
      logoutUrl: config.idpSloUrl || undefined,
      // Replay protection (security finding #2): every response must answer an
      // AuthnRequest we issued; the request ID is consumed on first validation,
      // so a captured assertion cannot be accepted twice. Also rejects
      // IdP-initiated responses, which the app does not support.
      validateInResponseTo: ValidateInResponseTo.always,
      requestIdExpirationPeriodMs: SAML_REQUEST_ID_TTL_MS,
      cacheProvider: this.requestIdCache,
    };

    return { saml: new SAML(samlConfig), config };
  }

  /**
   * Generate the SAML AuthnRequest and return the IdP redirect URL.
   */
  async getLoginRedirectUrl(
    relayState?: string,
  ): Promise<string> {
    const instance = await this.createSamlInstance();
    if (!instance) {
      throw new Error('SAML SSO is not configured or is disabled');
    }

    const url = await instance.saml.getAuthorizeUrlAsync(
      relayState ?? '',
      undefined,
      {},
    );

    return url;
  }

  /**
   * Validate a SAML callback response.
   *
   * Parses the SAMLResponse, validates the XML signature against the
   * IdP certificate, extracts user attributes, and creates/links the user.
   */
  async validateCallback(
    body: { SAMLResponse: string; RelayState?: string },
  ): Promise<SamlValidationResult> {
    const instance = await this.createSamlInstance();
    if (!instance) {
      throw new Error('SAML SSO is not configured or is disabled');
    }

    const { saml, config } = instance;

    // Get the org for user auto-provisioning
    const org = await this.orgRepo.findSingleton();
    if (!org) {
      throw new Error('Organization not found');
    }

    // Validate the SAML response
    const { profile } = await saml.validatePostResponseAsync(body);

    if (!profile) {
      this.logger.debug('SAML validateCallback: no profile returned from assertion');
      throw new Error('SAML assertion validation failed — no profile returned');
    }

    // Log only attribute keys — full profile contains PII
    this.logger.debug(
      `SAML profile keys: ${Object.keys(profile).join(', ')} (content redacted for privacy)`,
    );

    // Extract attributes using configured mapping
    const emailAttr = config.attributeMapping.email || 'email';
    const firstNameAttr = config.attributeMapping.firstName || 'firstName';
    const lastNameAttr = config.attributeMapping.lastName || 'lastName';

    this.logger.debug(
      `SAML attribute mapping: email="${emailAttr}", firstName="${firstNameAttr}", lastName="${lastNameAttr}"`,
    );

    const rawEmail = (
      this.getProfileAttribute(profile, emailAttr) ||
      profile.nameID
    )?.toLowerCase()?.trim();

    if (!rawEmail) {
      this.logger.debug('SAML: could not extract email from profile');
      throw new Error('SAML assertion missing email attribute');
    }

    // Validate email format to prevent malformed/malicious values from the IdP
    if (!isValidEmail(rawEmail)) {
      this.logger.warn(`SAML: invalid email format received from IdP: "${rawEmail.substring(0, 100)}"`);
      throw new Error('SAML assertion contains an invalid email address');
    }
    const email = rawEmail;

    const firstName =
      this.getProfileAttribute(profile, firstNameAttr) || '';
    const lastName =
      this.getProfileAttribute(profile, lastNameAttr) || '';
    const providerUserId = profile.nameID;

    this.logger.debug(
      `SAML extracted: email="${email}", firstName="${firstName}", lastName="${lastName}", nameID="${providerUserId}"`,
    );

    // Look up or create user
    let user = await this.userRepo.findByEmail(email);

    if (user) {
      this.logger.log(
        `SAML login for existing user ${user.id} (${email})`,
      );
      // Apply org default timezone on first login if user has none yet
      if (org.defaultTimezone && !user.timezone) {
        await this.userRepo.update(user.id, { timezone: org.defaultTimezone });
        user = { ...user, timezone: org.defaultTimezone };
      }
    } else if (config.autoProvision) {
      // Auto-provision new user
      user = await this.userRepo.create({
        orgId: org.id,
        email,
        firstName: firstName || email.split('@')[0],
        lastName,
        role: config.defaultRole,
      });

      this.logger.log(
        `Auto-provisioned user ${user.id} (${email}) from SAML SSO`,
      );

      if (org.defaultTimezone) {
        await this.userRepo.update(user.id, { timezone: org.defaultTimezone });
        user = { ...user, timezone: org.defaultTimezone };
      }
    } else {
      throw new Error(
        `No account found for ${email}. Contact your administrator to create an account.`,
      );
    }

    // Compute display name from firstName + lastName
    const displayName = [firstName, lastName].filter(Boolean).join(' ') || email;

    // Save/update SSO link
    await this.authTokenRepo.saveSsoLink({
      userId: user.id,
      provider: 'saml',
      providerUserId,
      providerEmail: email,
      providerDisplayName: displayName,
      linkedAt: new Date().toISOString(),
    });

    // Persist authProviders + lastLoginAt in one call
    const needsSamlProvider = !user.authProviders.includes('saml');
    const updateData: import('@skillspell/shared').UpdateUserData = {
      lastLoginAt: new Date().toISOString(),
    };
    if (needsSamlProvider) {
      updateData.authProviders = [...user.authProviders, 'saml'];
    }
    user = await this.userRepo.update(user.id, updateData);

    return {
      user,
      providerUserId,
      providerEmail: email,
      providerDisplayName: displayName,
    };
  }

  /**
   * Get the current SAML config from the database.
   * Public accessor so the auth controller can check SSO status.
   */
  async getSamlConfig(): Promise<SamlProviderConfig | null> {
    const org = await this.orgRepo.findSingleton();
    if (!org) return null;
    return this.samlConfigRepo.getSamlConfig(org.id);
  }

  /**
   * Generate SP metadata XML for IdP configuration.
   */
  async getSpMetadataXml(): Promise<string> {
    const instance = await this.createSamlInstance();
    if (!instance) {
      throw new Error('SAML SSO is not configured');
    }

    return instance.saml.generateServiceProviderMetadata(null, null);
  }

  /**
   * Generate an HMAC-signed CSRF nonce for SAML RelayState.
   *
   * Format: `base64url(JSON).hmac` where JSON payload is:
   *   { n: "<32-hex-nonce>", t: <timestamp-ms>, r?: "<cli_redirect>", s?: "<cli_state>" }
   * HMAC is computed over the base64url string (not raw JSON).
   *
   * The `r` and `s` fields are only present for CLI-initiated flows. `s` is the
   * CLI-generated state nonce echoed back on the localhost redirect so the CLI
   * callback server can reject injected codes.
   */
  generateRelayState(cliRedirect?: string, cliState?: string): string {
    const nonce = randomBytes(16).toString('hex');
    const payload: Record<string, unknown> = { n: nonce, t: Date.now() };
    if (cliRedirect) payload.r = cliRedirect;
    if (cliState) payload.s = cliState;
    const encoded = Buffer.from(JSON.stringify(payload)).toString('base64url');
    const hmac = createHmac('sha256', this.jwtSecret).update(encoded).digest('hex');
    return `${encoded}.${hmac}`;
  }

  /**
   * Verify a SAML RelayState nonce.
   *
   * New format: `<base64url(JSON)>.<hmac>` — uses lastIndexOf('.') to split.
   * Checks: HMAC signature (timingSafeEqual), nonce field exists, timestamp TTL.
   * Old `nonce.timestamp.hmac` format is rejected (clean cutover — 5-min window).
   */
  verifyRelayState(relayState?: string): boolean {
    if (!relayState) return false;

    // Use lastIndexOf to handle base64url which may contain '.'
    const dotIdx = relayState.lastIndexOf('.');
    if (dotIdx === -1) return false;

    const encoded = relayState.slice(0, dotIdx);
    const providedHmac = relayState.slice(dotIdx + 1);
    if (!encoded || !providedHmac) return false;

    // Verify HMAC signature using constant-time comparison
    const expectedHmac = createHmac('sha256', this.jwtSecret).update(encoded).digest('hex');
    try {
      const expected = Buffer.from(expectedHmac, 'hex');
      const provided = Buffer.from(providedHmac, 'hex');
      // timingSafeEqual throws TypeError if buffers have different lengths.
      // Explicit length check here so the catch only handles truly unexpected errors.
      if (expected.length !== provided.length) return false;
      if (!timingSafeEqual(expected, provided)) return false;
    } catch {
      return false;
    }

    // Decode and validate payload
    let payload: Record<string, unknown>;
    try {
      payload = JSON.parse(Buffer.from(encoded, 'base64url').toString('utf8')) as Record<string, unknown>;
    } catch {
      return false; // not valid base64url JSON — old format or tampered
    }

    // Validate nonce field exists
    if (typeof payload.n !== 'string' || payload.n.length === 0) return false;

    // Validate timestamp TTL
    if (typeof payload.t !== 'number' || isNaN(payload.t)) return false;
    const age = Date.now() - payload.t;
    if (age < 0 || age > SAML_NONCE_TTL_MS) return false;

    return true;
  }

  /**
   * Extract the cli_redirect from a RelayState payload.
   *
   * MUST be called AFTER verifyRelayState() passes — no re-verification here.
   * Returns the cli_redirect URL if present, or null for browser-flow RelayState.
   * Returns null if RelayState is not in the new base64url JSON format.
   */
  extractCliRedirect(relayState: string): string | null {
    return this.extractPayloadField(relayState, 'r');
  }

  /**
   * Extract the CLI state nonce from a RelayState payload.
   *
   * MUST be called AFTER verifyRelayState() passes — no re-verification here.
   * Returns null for browser-flow RelayState or corrupt input.
   */
  extractCliState(relayState: string): string | null {
    return this.extractPayloadField(relayState, 's');
  }

  private extractPayloadField(relayState: string, field: string): string | null {
    const dotIdx = relayState.lastIndexOf('.');
    if (dotIdx === -1) return null;
    const encoded = relayState.slice(0, dotIdx);
    try {
      const payload = JSON.parse(Buffer.from(encoded, 'base64url').toString('utf8')) as Record<string, unknown>;
      const value = payload[field];
      return typeof value === 'string' ? value : null;
    } catch {
      return null; // old format or corrupt — field absent
    }
  }

  /**
   * Extract an attribute from the SAML profile.
   */
  private getProfileAttribute(
    profile: Record<string, unknown>,
    attributeName: string,
  ): string | undefined {
    // Check direct profile properties
    const directValue = profile[attributeName];
    if (typeof directValue === 'string') return directValue;

    // Check nested attributes
    const attrs = profile['attributes'] as Record<string, unknown> | undefined;
    if (attrs) {
      const attrValue = attrs[attributeName];
      if (typeof attrValue === 'string') return attrValue;
      if (Array.isArray(attrValue) && typeof attrValue[0] === 'string') {
        return attrValue[0];
      }
    }

    return undefined;
  }

  /**
   * Return the frontend base URL for SAML callback redirects.
   *
   * Uses the trusted `APP_PUBLIC_URL` environment variable directly,
   * avoiding reliance on DB-sourced values (like `spEntityId`) that
   * could be compromised. Falls back to empty string (relative redirect)
   * if not configured.
   */
  getFrontendRedirectUrl(): string {
    return this.publicUrl.replace(/\/+$/, '');
  }
}
