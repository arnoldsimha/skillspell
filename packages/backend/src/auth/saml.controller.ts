import {
  BadRequestException,
  Body,
  Controller,
  Get,
  HttpCode,
  HttpStatus,
  Inject,
  Logger,
  Post,
  Query,
  Req,
  Res,
  UnauthorizedException,
} from '@nestjs/common';
import type { Request, Response } from 'express';
import { randomBytes } from 'node:crypto';
import { ConfigService } from '@nestjs/config';
import {
  ORGANIZATION_REPOSITORY,
  type IOrganizationRepository,
  type LoginResponse,
} from '@skillspell/shared';
import type { AppConfig } from '../config/configuration.js';
import { TokenService } from './token.service.js';
import { SamlAuthService } from './strategies/saml.strategy.js';
import { CliAuthService } from './cli-auth.service.js';
import { Public } from './decorators/public.decorator.js';
import { setRefreshTokenCookie } from './cookie.utils.js';

/**
 * SAML SSO controller.
 *
 * Handles SAML login redirect, callback, and SSO status check.
 * All endpoints are prefixed with /api/auth (via global prefix + controller prefix).
 *
 * Separated from the main AuthController to keep SAML concerns isolated.
 */
@Controller('auth')
export class SamlController {
  private readonly logger = new Logger(SamlController.name);
  private readonly refreshTokenExpiry: string;
  private readonly isProduction: boolean;

  constructor(
    private readonly tokenService: TokenService,
    private readonly samlAuthService: SamlAuthService,
    private readonly cliAuthService: CliAuthService,
    @Inject(ORGANIZATION_REPOSITORY)
    private readonly orgRepo: IOrganizationRepository,
    configService: ConfigService<AppConfig, true>,
  ) {
    this.refreshTokenExpiry = configService.get('auth.refreshTokenExpiry', { infer: true });
    this.isProduction = configService.get('app.isProduction', { infer: true });
  }

  /**
   * Initiate SAML SSO login.
   *
   * Redirects the user to the configured IdP with an AuthnRequest.
   *
   * A short-lived HMAC-signed nonce is embedded in the SAML `RelayState`
   * parameter. The IdP MUST echo `RelayState` back in the callback,
   * providing CSRF protection — an attacker cannot forge a valid nonce
   * without knowing the server's JWT_SECRET.
   */
  @Public()
  @Get('saml/login')
  async samlLogin(
    @Query('cli_redirect') cliRedirect: string | undefined,
    @Query('state') state: string | undefined,
    @Res() res: Response,
  ): Promise<void> {
    this.logger.log(`SAML login initiated: cli_redirect=${cliRedirect ?? 'none'}`);
    // Validate cli_redirect before anything else (criterion #4)
    if (cliRedirect !== undefined) {
      try {
        if (new URL(cliRedirect).hostname !== 'localhost') {
          throw new BadRequestException('cli_redirect must target localhost only');
        }
      } catch (e) {
        if (e instanceof BadRequestException) throw e;
        throw new BadRequestException('cli_redirect must be a valid localhost URL');
      }
    }

    // CLI-generated state nonce — echoed back to the local callback so the CLI
    // can reject injected codes. Opaque to the server; bound-length URL-safe only.
    if (state !== undefined && !/^[A-Za-z0-9_-]{8,128}$/.test(state)) {
      throw new BadRequestException('state must be 8-128 URL-safe characters');
    }

    // Check org-level SSO gate before attempting IdP configuration lookup
    const org = await this.orgRepo.findSingleton();
    if (org && org.ssoLoginEnabled === false) {
      throw new UnauthorizedException('SSO login is disabled for this organization');
    }

    try {
      // Generate CSRF nonce for RelayState (with optional cliRedirect + CLI state embedded)
      const relayState = this.samlAuthService.generateRelayState(cliRedirect, state);
      this.logger.debug(`SAML login: generated RelayState nonce (length=${relayState.length})`);

      const redirectUrl = await this.samlAuthService.getLoginRedirectUrl(relayState);
      this.logger.debug(`SAML login: redirecting to IdP → ${redirectUrl.substring(0, 120)}…`);
      res.redirect(redirectUrl);
    } catch (error) {
      this.logger.error(`SAML login failed: ${error instanceof Error ? error.message : error}`);
      throw new UnauthorizedException('SAML SSO is not configured or is disabled');
    }
  }

  /**
   * SAML callback — IdP posts the SAMLResponse here after authentication.
   *
   * Validates the assertion, creates/links the user, generates JWT tokens,
   * and **redirects the browser** to the frontend `/sso-callback` page
   * with the access token in the URL fragment hash.
   *
   * The fragment (`#token=...`) is never sent to the server, keeping it
   * safe from server-side logs. The frontend reads it, stores the session,
   * and navigates to the app.
   *
   * Sets the refresh token as an httpOnly cookie.
   */
  @Public()
  @Post('saml/callback')
  async samlCallback(
    @Body() body: { SAMLResponse: string; RelayState?: string },
    @Req() req: Request,
    @Res() res: Response,
  ): Promise<void> {
    // ── Debug: log incoming SAML callback body ──
    this.logger.debug(
      `SAML callback received — ` +
      `SAMLResponse length=${body.SAMLResponse?.length ?? 0}, ` +
      `RelayState=${body.RelayState ? `"${body.RelayState.substring(0, 80)}${body.RelayState.length > 80 ? '…' : ''}"` : '(none)'}`,
    );
    this.logger.debug(`SAML callback body keys: ${Object.keys(body).join(', ')}`);

    // ── RelayState CSRF nonce check ──
    // RelayState is REQUIRED: every flow the app supports (browser + CLI) is
    // SP-initiated via /saml/login, which always issues a signed RelayState.
    // A callback without one is either an IdP-initiated flow (unsupported) or
    // a replayed/forged response — reject both (security finding #2).
    if (!body.RelayState || !this.samlAuthService.verifyRelayState(body.RelayState)) {
      this.logger.warn(
        body.RelayState
          ? 'SAML callback: RelayState nonce verification failed — rejecting callback'
          : 'SAML callback: missing RelayState (IdP-initiated SSO is not supported) — rejecting callback',
      );
      const frontendBaseUrl = this.samlAuthService.getFrontendRedirectUrl();
      res.redirect(`${frontendBaseUrl}/sso-callback#error=csrf_failed`);
      return;
    }
    this.logger.debug('SAML callback: RelayState nonce verified successfully');

    // Resolve the frontend base URL from APP_PUBLIC_URL
    const frontendBaseUrl = this.samlAuthService.getFrontendRedirectUrl();

    try {
      this.logger.debug('SAML callback: validating assertion…');
      const result = await this.samlAuthService.validateCallback(body);
      this.logger.debug(
        `SAML callback: assertion valid — user=${result.user.email} (${result.user.id}), ` +
        `providerUserId=${result.providerUserId}, providerEmail=${result.providerEmail}`,
      );

      const deviceInfo = req.headers['user-agent'];

      // Check if this is a CLI flow: cli_redirect embedded in RelayState
      const cliRedirect = this.samlAuthService.extractCliRedirect(body.RelayState);
      const cliState = this.samlAuthService.extractCliState(body.RelayState);

      if (cliRedirect) {
        // CLI flow
        // Defense in depth: re-validate cli_redirect even though samlLogin already checked
        try {
          if (new URL(cliRedirect).hostname !== 'localhost') {
            this.logger.warn(`SAML callback: cli_redirect has invalid origin — rejecting: ${cliRedirect.substring(0, 80)}`);
            res.redirect(`${frontendBaseUrl}/sso-callback#error=invalid_redirect`);
            return;
          }
        } catch {
          this.logger.warn(`SAML callback: cli_redirect is not a valid URL — rejecting: ${cliRedirect.substring(0, 80)}`);
          res.redirect(`${frontendBaseUrl}/sso-callback#error=invalid_redirect`);
          return;
        }

        // Generate JWT tokens for the authenticated user
        const { accessToken, refreshToken } =
          await this.tokenService.generateTokenPair(result.user, deviceInfo);

        // Generate one-time code (cryptographically random, 256-bit entropy)
        const code = randomBytes(32).toString('hex');

        // Store code in CliAuthService in-memory store (60s TTL, single-use).
        // expiresAt is the CODE expiry (60s), not the access token expiry.
        await this.cliAuthService.storeCliCode(code, {
          userId: result.user.id,
          email: result.user.email,
          accessToken,
          refreshToken,
          expiresAt: Date.now() + this.cliAuthService.CODE_TTL_MS,
        });

        this.logger.log(`SAML callback: CLI login succeeded for ${result.user.email}`);
        this.logger.debug(`SAML callback: CLI flow — redirecting to local callback with code`);
        // Echo the CLI's state nonce so its callback server can verify this
        // redirect belongs to the login it started (security finding #3).
        const stateParam = cliState ? `&state=${encodeURIComponent(cliState)}` : '';
        res.redirect(`${cliRedirect}?code=${code}${stateParam}`);
        return;
      }

      // Browser flow (unchanged) — existing /api/auth/refresh cookie path untouched
      const { accessToken, refreshToken } =
        await this.tokenService.generateTokenPair(result.user, deviceInfo);

      setRefreshTokenCookie(res, refreshToken, this.refreshTokenExpiry, this.isProduction);
      this.logger.log(`SAML callback: browser login succeeded for ${result.user.email}`);
      this.logger.debug(`SAML callback: browser flow — login successful for ${result.user.email}`);

      // Redirect browser to frontend with token in fragment hash
      const redirectUrl = `${frontendBaseUrl}/sso-callback#token=${encodeURIComponent(accessToken)}`;
      this.logger.debug(`SAML callback: redirecting to ${frontendBaseUrl}/sso-callback#token=<redacted>`);
      res.redirect(redirectUrl);
    } catch (error) {
      this.logger.error(
        `SAML callback: assertion validation failed — ${error instanceof Error ? error.message : error}`,
      );
      this.logger.debug(
        `SAML callback: failed SAMLResponse length: ${body.SAMLResponse?.length ?? 0}`,
      );

      // Redirect to frontend with a generic error — detailed message stays in server logs only
      const redirectUrl = `${frontendBaseUrl}/sso-callback#error=sso_failed`;
      res.redirect(redirectUrl);
    }
  }

  /**
   * Check if SSO is available and which protocol is active.
   *
   * Returns oidcEnabled and activeSsoProtocol in addition
   * to existing samlEnabled fields for CLI/frontend consumption.
   */
  @Public()
  @Get('sso-status')
  async getSsoStatus(): Promise<{
    samlEnabled: boolean;
    oidcEnabled: boolean;
    activeSsoProtocol: 'saml' | 'oidc' | null;
    passwordLoginEnabled: boolean;
    samlProviderName?: string;
    samlIconUrl?: string;
  }> {
    // Load org settings for login mode flags
    let passwordLoginEnabled = true;
    let ssoLoginEnabled = true;
    let activeSsoProtocol: 'saml' | 'oidc' | null = null;
    try {
      const org = await this.orgRepo.findSingleton();
      if (org) {
        passwordLoginEnabled = org.passwordLoginEnabled !== false;
        ssoLoginEnabled = org.ssoLoginEnabled !== false;
        activeSsoProtocol = (org.activeSsoProtocol ?? null) as 'saml' | 'oidc' | null;
      }
    } catch {
      // Fallback to defaults if org not found
    }

    const samlEnabled = activeSsoProtocol === 'saml' && ssoLoginEnabled;
    const oidcEnabled = activeSsoProtocol === 'oidc' && ssoLoginEnabled;

    if (samlEnabled) {
      try {
        const config = await this.samlAuthService.getSamlConfig();
        if (config) {
          return {
            samlEnabled: true,
            oidcEnabled: false,
            activeSsoProtocol,
            passwordLoginEnabled,
            samlProviderName: config.displayName,
            samlIconUrl: config.iconUrl,
          };
        }
      } catch {
        // Ignore errors — SAML config not found
      }
    }

    return {
      samlEnabled: false,
      oidcEnabled,
      activeSsoProtocol,
      passwordLoginEnabled,
    };
  }

}
