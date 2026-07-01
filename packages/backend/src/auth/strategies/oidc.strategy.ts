import { Inject, Injectable, Logger, UnauthorizedException } from '@nestjs/common';
import { CACHE_MANAGER, type Cache } from '@nestjs/cache-manager';
import { ConfigService } from '@nestjs/config';
import * as client from 'openid-client';
import {
  OIDC_CONFIG_REPOSITORY,
  type IOidcConfigRepository,
  ORGANIZATION_REPOSITORY,
  type IOrganizationRepository,
  AUTH_TOKEN_REPOSITORY,
  type IAuthTokenRepository,
  USER_REPOSITORY,
  type IUserRepository,
  type OidcProviderConfig,
  type UpdateUserData,
  type User,
  isValidEmail,
} from '@skillspell/shared';
import type { AppConfig } from '../../config/configuration.js';
import { EncryptionService } from '../../common/services/encryption.service.js';

const OIDC_STATE_TTL_MS = 5 * 60 * 1000; // 5 minutes — matches SAML nonce window
const CONFIG_CACHE_TTL_MS = 5 * 60 * 1000; // 5 minutes — OIDC discovery refresh window

export interface OidcPendingState {
  code_verifier: string;
  cliRedirect?: string;
  expiresAt: number;
}

export interface OidcValidateResult {
  user: User;
  providerUserId: string;
  providerEmail: string;
  providerDisplayName: string;
}

@Injectable()
export class OidcAuthService {
  private readonly logger = new Logger(OidcAuthService.name);
  private readonly publicUrl: string;
  private readonly isProduction: boolean;

  constructor(
    @Inject(OIDC_CONFIG_REPOSITORY)
    private readonly oidcConfigRepo: IOidcConfigRepository,
    @Inject(ORGANIZATION_REPOSITORY)
    private readonly orgRepo: IOrganizationRepository,
    @Inject(AUTH_TOKEN_REPOSITORY)
    private readonly authTokenRepo: IAuthTokenRepository,
    @Inject(USER_REPOSITORY)
    private readonly userRepo: IUserRepository,
    private readonly encryptionService: EncryptionService,
    configService: ConfigService<AppConfig, true>,
    @Inject(CACHE_MANAGER) private readonly cacheManager: Cache,
  ) {
    this.publicUrl = configService.get('app.publicUrl', { infer: true }) || '';
    this.isProduction = configService.get('app.isProduction', { infer: true });

    // Validate publicUrl at startup to prevent open-redirect to an attacker-controlled
    // domain if APP_PUBLIC_URL is misconfigured. Fail fast in production.
    if (this.isProduction && !this.publicUrl.startsWith('https://')) {
      throw new Error(
        `APP_PUBLIC_URL must be an https:// URL in production, got: "${this.publicUrl}". ` +
        'Set APP_PUBLIC_URL to your deployment origin (e.g. https://app.example.com).',
      );
    }
  }

  // ─── State Map (PKCE + CSRF nonce store) ──────────────────────────────────

  async storeOidcState(state: string, entry: OidcPendingState): Promise<void> {
    await this.cacheManager.set(`oidc:state:${state}`, entry, OIDC_STATE_TTL_MS);
  }

  async consumeOidcState(state: string): Promise<OidcPendingState | null> {
    const entry = await this.cacheManager.get<OidcPendingState>(`oidc:state:${state}`);
    if (!entry || Date.now() > entry.expiresAt) {
      await this.cacheManager.del(`oidc:state:${state}`);
      return null;
    }
    await this.cacheManager.del(`oidc:state:${state}`); // single-use — prevents state replay
    return entry;
  }

  // ─── Helpers ──────────────────────────────────────────────────────────────

  /** Decrypt encryptedClientSecret; throws if decryption fails (corrupt/missing secret surfaces as an error). */
  private decryptSecret(encryptedClientSecret: string): string {
    return this.encryptionService.decrypt(encryptedClientSecret);
  }

  // ─── Discovery (with in-process cache) ────────────────────────────────────

  private get devDiscoveryOptions(): client.DiscoveryRequestOptions | undefined {
    // execute: [allowInsecureRequests] both permits HTTP for the discovery request
    // AND configures the returned Configuration for all subsequent HTTP calls (token exchange, userinfo)
    return !this.isProduction ? { execute: [client.allowInsecureRequests] } : undefined;
  }

  async getDiscoveryConfig(oidcConfig: OidcProviderConfig): Promise<client.Configuration> {
    const cacheKey = `oidc:config:${oidcConfig.issuerUrl}`;
    const clientSecret = this.decryptSecret(oidcConfig.encryptedClientSecret);

    // Cache only the plain server metadata (JSON-safe). Reconstruct Configuration on each hit
    // because client.Configuration is a class instance that loses its identity through JSON serialization.
    const cachedMeta = await this.cacheManager.get<client.ServerMetadata>(cacheKey);
    if (cachedMeta) {
      const config = new client.Configuration(cachedMeta, oidcConfig.clientId, clientSecret);
      // Mirror devDiscoveryOptions: permit HTTP token exchange in non-prod environments
      if (!this.isProduction) client.allowInsecureRequests(config);
      return config;
    }

    const config = await client.discovery(
      new URL(oidcConfig.issuerUrl),
      oidcConfig.clientId,
      clientSecret,
      undefined,
      this.devDiscoveryOptions,
    );
    await this.cacheManager.set(cacheKey, config.serverMetadata(), CONFIG_CACHE_TTL_MS);
    return config;
  }

  async fetchDiscoveryMetadata(
    issuerUrl: string,
    clientId: string,
    clientSecret: string,
  ): Promise<{ authorizationUrl: string; tokenUrl: string; jwksUri: string }> {
    const config = await client.discovery(
      new URL(issuerUrl),
      clientId,
      clientSecret,
      undefined,
      this.devDiscoveryOptions,
    );
    const serverMeta = config.serverMetadata();
    return {
      authorizationUrl: serverMeta.authorization_endpoint ?? '',
      tokenUrl: serverMeta.token_endpoint ?? '',
      jwksUri: serverMeta.jwks_uri ?? '',
    };
  }

  // ─── Login Redirect ────────────────────────────────────────────────────────

  async getLoginRedirectUrl(
    cliRedirect?: string,
    cliCodeVerifier?: string,
  ): Promise<{ redirectUrl: string; state: string }> {
    const org = await this.orgRepo.findSingleton();
    if (!org) throw new UnauthorizedException('Organization not found');

    const oidcConfig = await this.oidcConfigRepo.getOidcConfig(org.id);
    if (!oidcConfig) throw new UnauthorizedException('OIDC SSO is not configured');

    const callbackUrl = `${this.publicUrl}/api/auth/oidc/callback`;

    let serverConfig: client.Configuration;
    try {
      serverConfig = await this.getDiscoveryConfig(oidcConfig);
    } catch (err) {
      this.logger.error(`OIDC discovery failed: ${err instanceof Error ? err.message : err}`);
      throw new UnauthorizedException('OIDC provider is not reachable');
    }

    // CLI sends its own code_verifier; use it. Otherwise generate server-side.
    const code_verifier = cliCodeVerifier ?? client.randomPKCECodeVerifier();
    const code_challenge = await client.calculatePKCECodeChallenge(code_verifier);
    const state = client.randomState();

    await this.storeOidcState(state, {
      code_verifier,
      cliRedirect,
      expiresAt: Date.now() + OIDC_STATE_TTL_MS,
    });

    const redirectUrl = client.buildAuthorizationUrl(serverConfig, {
      redirect_uri: callbackUrl,
      scope: oidcConfig.scopes.join(' '),
      code_challenge,
      code_challenge_method: 'S256',
      state,
    });

    return { redirectUrl: redirectUrl.href, state };
  }

  // ─── Callback Validation ───────────────────────────────────────────────────

  async validateCallback(
    callbackFullUrl: string,
    pendingState: OidcPendingState,
  ): Promise<OidcValidateResult> {
    const org = await this.orgRepo.findSingleton();
    if (!org) throw new UnauthorizedException('Organization not found');

    const oidcConfig = await this.oidcConfigRepo.getOidcConfig(org.id);
    if (!oidcConfig) throw new UnauthorizedException('OIDC SSO is not configured');

    let serverConfig: client.Configuration;
    try {
      serverConfig = await this.getDiscoveryConfig(oidcConfig);
    } catch (err) {
      this.logger.error(`OIDC discovery failed on callback: ${err instanceof Error ? err.message : err}`);
      throw new UnauthorizedException('OIDC provider is not reachable');
    }

    // Ensure HTTP is allowed on the cached config for token exchange (required for non-prod HTTP IdPs)
    if (!this.isProduction) client.allowInsecureRequests(serverConfig);

    const tokens = await client.authorizationCodeGrant(
      serverConfig,
      new URL(callbackFullUrl),
      {
        pkceCodeVerifier: pendingState.code_verifier,
        idTokenExpected: true,
        // State already validated via pendingStateMap above — tell openid-client to skip its own check
        expectedState: client.skipStateCheck,
      },
    );

    const claims = tokens.claims()!;
    let userInfo: Record<string, unknown> = {};
    try {
      const ui = await client.fetchUserInfo(serverConfig, tokens.access_token, claims.sub);
      userInfo = ui as Record<string, unknown>;
    } catch {
      // userInfo is optional — fall back to ID token claims
    }

    // Extract attributes using admin-configured mapping
    const mapping = oidcConfig.attributeMapping;
    const email = ((userInfo[mapping.email] ?? claims[mapping.email] ?? claims.email ?? claims.sub) as string);
    const firstName = ((userInfo[mapping.firstName] ?? claims[mapping.firstName] ?? '') as string);
    const lastName = ((userInfo[mapping.lastName] ?? claims[mapping.lastName] ?? '') as string);

    if (!email || !isValidEmail(email)) {
      throw new UnauthorizedException(`OIDC claim '${mapping.email}' did not return a valid email`);
    }

    // User provisioning — mirrors saml.strategy.ts user lookup pattern
    let user = await this.userRepo.findByEmail(email);
    if (!user) {
      if (!oidcConfig.autoProvision) {
        throw new UnauthorizedException(
          `User ${email} does not have an account. Contact your administrator.`,
        );
      }
      user = await this.userRepo.create({
        orgId: org.id,
        email,
        firstName: firstName || email.split('@')[0],
        lastName: lastName || '',
        role: oidcConfig.defaultRole,
      });
    }

    // Save SSO link (provider: 'oidc')
    await this.authTokenRepo.saveSsoLink({
      userId: user.id,
      provider: 'oidc',
      providerUserId: claims.sub,
      providerEmail: email,
      linkedAt: new Date().toISOString(),
    });

    // Persist authProviders + lastLoginAt in one call — mirrors saml.strategy.ts pattern
    const needsOidcProvider = !user.authProviders?.includes('oidc');
    const updateData: UpdateUserData = {
      lastLoginAt: new Date().toISOString(),
    };
    if (needsOidcProvider) {
      updateData.authProviders = [...(user.authProviders ?? []), 'oidc'];
    }
    user = await this.userRepo.update(user.id, updateData);

    return {
      user,
      providerUserId: claims.sub,
      providerEmail: email,
      providerDisplayName: [firstName, lastName].filter(Boolean).join(' ') || email,
    };
  }

  // ─── Frontend redirect helper ──────────────────────────────────────────────

  getFrontendRedirectUrl(): string {
    return this.publicUrl.replace(/\/+$/, '');
  }

  getCallbackUrl(): string {
    return `${this.publicUrl.replace(/\/+$/, '')}/api/auth/oidc/callback`;
  }
}
