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
} from '@skillspell/shared';
import type { AppConfig } from '../config/configuration.js';
import { TokenService } from './token.service.js';
import { OidcAuthService } from './strategies/oidc.strategy.js';
import { CliAuthService } from './cli-auth.service.js';
import { Public } from './decorators/public.decorator.js';
import { setRefreshTokenCookie } from './cookie.utils.js';

/**
 * OIDC SSO controller.
 *
 * Handles OIDC login redirect and callback.
 * All endpoints are prefixed with /api/auth (via global prefix + controller prefix).
 *
 * Separated from SamlController to keep OIDC concerns isolated.
 */
@Controller('auth')
export class OidcController {
  private readonly logger = new Logger(OidcController.name);
  private readonly refreshTokenExpiry: string;
  private readonly isProduction: boolean;

  constructor(
    private readonly tokenService: TokenService,
    private readonly oidcAuthService: OidcAuthService,
    private readonly cliAuthService: CliAuthService,
    @Inject(ORGANIZATION_REPOSITORY)
    private readonly orgRepo: IOrganizationRepository,
    configService: ConfigService<AppConfig, true>,
  ) {
    this.refreshTokenExpiry = configService.get('auth.refreshTokenExpiry', { infer: true });
    this.isProduction = configService.get('app.isProduction', { infer: true });
  }

  /**
   * Initiate OIDC SSO login (browser flow — GET).
   *
   * Browser-initiated flow: no cli_redirect or cli_code_verifier. Redirects directly
   * to the IdP authorization URL.
   */
  @Public()
  @Get('oidc/login')
  async oidcLoginBrowser(
    @Res() res: Response,
  ): Promise<void> {
    this.logger.log('OIDC browser login initiated');
    // Only active OIDC protocol allowed
    const org = await this.orgRepo.findSingleton();
    if (!org || org.activeSsoProtocol !== 'oidc') {
      throw new UnauthorizedException('OIDC SSO is not the active protocol');
    }

    try {
      const { redirectUrl } = await this.oidcAuthService.getLoginRedirectUrl();
      this.logger.log('OIDC browser login: redirecting to IdP');
      res.redirect(redirectUrl);
    } catch (error) {
      this.logger.error(
        `OIDC login redirect failed: ${error instanceof Error ? error.message : error}`,
      );
      throw new UnauthorizedException('OIDC SSO is not configured or IdP is unreachable');
    }
  }

  /**
   * Initiate OIDC SSO login (CLI flow — POST).
   *
   * CLI sends cli_redirect and cli_code_verifier in the POST body (not in the URL)
   * to prevent the PKCE code_verifier from appearing in server access logs.
   * Returns { redirectUrl } as JSON so the CLI can open the browser to that URL.
   *
   * Code_verifier moved from query string to POST body.
   */
  @Public()
  @Post('oidc/login')
  @HttpCode(HttpStatus.OK)
  async oidcLoginCli(
    @Body() body: { cli_redirect?: string; cli_code_verifier?: string },
    @Res({ passthrough: true }) _res: Response,
  ): Promise<{ redirectUrl: string }> {
    const { cli_redirect: cliRedirect, cli_code_verifier: cliCodeVerifier } = body;
    this.logger.log(`OIDC CLI login initiated: cli_redirect=${cliRedirect ?? 'none'}`);

    // Only localhost cli_redirect accepted
    if (cliRedirect !== undefined && !cliRedirect.startsWith('http://localhost:')) {
      throw new BadRequestException('cli_redirect must target localhost only');
    }

    // Only active OIDC protocol allowed
    const org = await this.orgRepo.findSingleton();
    if (!org || org.activeSsoProtocol !== 'oidc') {
      throw new UnauthorizedException('OIDC SSO is not the active protocol');
    }

    try {
      const { redirectUrl } = await this.oidcAuthService.getLoginRedirectUrl(
        cliRedirect,
        cliCodeVerifier,
      );
      return { redirectUrl };
    } catch (error) {
      this.logger.error(
        `OIDC login redirect failed: ${error instanceof Error ? error.message : error}`,
      );
      throw new UnauthorizedException('OIDC SSO is not configured or IdP is unreachable');
    }
  }

  /**
   * OIDC callback — IdP redirects here after authentication.
   *
   * Validates the state nonce, calls OidcAuthService.validateCallback,
   * generates JWT tokens, and redirects to the frontend /sso-callback page.
   *
   * CLI flow: generates a one-time code, redirects to cli_redirect.
   * Browser flow: sets refresh token cookie, redirects with access token in fragment hash.
   */
  @Public()
  @Get('oidc/callback')
  async oidcCallback(
    @Query('code') _code: string | undefined,
    @Query('state') state: string | undefined,
    @Req() req: Request,
    @Res() res: Response,
  ): Promise<void> {
    const frontendBaseUrl = this.oidcAuthService.getFrontendRedirectUrl();

    if (!state) {
      res.redirect(`${frontendBaseUrl}/sso-callback#error=csrf_failed`);
      return;
    }

    // Consume state — single-use CSRF validation
    const pendingState = await this.oidcAuthService.consumeOidcState(state);
    if (!pendingState) {
      this.logger.warn('OIDC callback: state not found or expired');
      res.redirect(`${frontendBaseUrl}/sso-callback#error=oidc_state_expired`);
      return;
    }

    try {
      // Reconstruct callback URL using publicUrl (same origin used in redirect_uri during authorization)
      // Using req.host would break if behind a proxy or if publicUrl differs from the incoming host.
      const callbackBase = this.oidcAuthService.getCallbackUrl();
      const callbackFullUrl = `${callbackBase}${req.originalUrl.substring(req.path.length)}`;
      const result = await this.oidcAuthService.validateCallback(callbackFullUrl, pendingState);

      const tokenPair = await this.tokenService.generateTokenPair(
        result.user,
        req.headers['user-agent'],
      );
      const { accessToken, refreshToken } = tokenPair;

      if (pendingState.cliRedirect) {
        // CLI flow — generate one-time code, redirect to cli_redirect
        const code = randomBytes(32).toString('hex');
        await this.cliAuthService.storeCliCode(code, {
          userId: result.user.id,
          email: result.user.email,
          accessToken,
          refreshToken,
          expiresAt: Date.now() + this.cliAuthService.CODE_TTL_MS,
        });
        this.logger.log(`OIDC callback: CLI login succeeded for ${result.user.email}`);
        res.redirect(`${pendingState.cliRedirect}?code=${code}`);
      } else {
        // Browser flow — set cookie + redirect to SsoCallbackPage
        setRefreshTokenCookie(res, refreshToken, this.refreshTokenExpiry, this.isProduction);
        this.logger.log(`OIDC callback: browser login succeeded for ${result.user.email}`);
        res.redirect(`${frontendBaseUrl}/sso-callback#token=${encodeURIComponent(accessToken)}`);
      }
    } catch (error) {
      const cause = error instanceof Error ? (error.cause ?? null) : null;
      this.logger.error('OIDC callback error', {
        message: error instanceof Error ? error.message : String(error),
        cause: cause instanceof Error
          ? { message: cause.message, ...('error' in cause ? { oauthError: (cause as Record<string, unknown>).error } : {}), ...('error_description' in cause ? { oauthDescription: (cause as Record<string, unknown>).error_description } : {}) }
          : cause,
        callbackUrl: req.originalUrl,
      });
      res.redirect(`${frontendBaseUrl}/sso-callback#error=sso_failed`);
    }
  }
}
