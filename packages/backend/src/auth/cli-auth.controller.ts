import {
  Body,
  Controller,
  Headers,
  HttpCode,
  HttpStatus,
  Logger,
  Post,
  UnauthorizedException,
} from '@nestjs/common';
import { Throttle } from '@nestjs/throttler';
import { Public } from './decorators/public.decorator.js';
import { CliAuthService } from './cli-auth.service.js';
import { CliExchangeDto } from './dto/cli-exchange.dto.js';
import { CliRefreshDto } from './dto/cli-refresh.dto.js';

/**
 * CLI authentication controller.
 *
 * Provides two endpoints for the CLI SSO token flow:
 *   POST /api/auth/cli/exchange — exchange a one-time code for a token pair
 *   POST /api/auth/cli/refresh  — rotate a refresh token for a new token pair
 *
 * CRITICAL: Neither endpoint sets cookies. Tokens are returned in the JSON body.
 * setRefreshTokenCookie() is intentionally NOT imported or called here.
 */
@Controller('auth')
export class CliAuthController {
  private readonly logger = new Logger(CliAuthController.name);

  constructor(private readonly cliAuthService: CliAuthService) {}

  /**
   * Exchange a one-time CLI SSO code for an access + refresh token pair.
   *
   * The code is issued by the SAML callback handler (saml.controller.ts samlCallback)
   * and delivered to the CLI's local callback server. It is single-use with a 60s TTL.
   *
   * Returns: { accessToken: string, refreshToken: string } — no cookies set.
   */
  @Public()
  @Throttle({ short: { limit: 5, ttl: 1000 }, medium: { limit: 10, ttl: 60000 } })
  @Post('cli/exchange')
  @HttpCode(HttpStatus.OK)
  async cliExchange(
    @Body() dto: CliExchangeDto,
  ): Promise<{ accessToken: string; refreshToken: string }> {
    const entry = await this.cliAuthService.consumeCliCode(dto.code);
    if (!entry) {
      this.logger.warn('CLI exchange: code not found, already used, or expired');
      throw new UnauthorizedException('Invalid or expired code');
    }

    this.logger.debug(`CLI exchange: code consumed for user ${entry.userId}`);
    return { accessToken: entry.accessToken, refreshToken: entry.refreshToken };
  }

  /**
   * Rotate a CLI SSO refresh token for a new access + refresh token pair.
   *
   * Accepts the refresh token in the Authorization: Bearer header (not cookie).
   * Requires userId in the request body — needed for DB lookup in token rotation.
   * email is intentionally NOT accepted — access token claims come from DB only.
   *
   * Returns: { accessToken: string, refreshToken: string } — no cookies set.
   */
  @Public()
  @Throttle({ short: { limit: 3, ttl: 1000 }, medium: { limit: 10, ttl: 60000 } })
  @Post('cli/refresh')
  @HttpCode(HttpStatus.OK)
  async cliRefresh(
    @Headers('authorization') authorization: string | undefined,
    @Body() dto: CliRefreshDto,
  ): Promise<{ accessToken: string; refreshToken: string }> {
    const rawRefreshToken = authorization?.replace(/^Bearer\s+/i, '');
    if (!rawRefreshToken) {
      throw new UnauthorizedException('No refresh token provided');
    }

    const result = await this.cliAuthService.refreshCliToken(
      rawRefreshToken,
      dto.userId,
    );
    if (!result) {
      this.logger.warn(`CLI refresh: token rotation failed for user ${dto.userId}`);
      throw new UnauthorizedException('Refresh token invalid or expired');
    }

    this.logger.debug(`CLI refresh: token rotated for user ${dto.userId}`);
    return result;
  }
}
