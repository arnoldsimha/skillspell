import {
  Body,
  Controller,
  Get,
  Headers,
  HttpCode,
  HttpStatus,
  Logger,
  Patch,
  Post,
  Req,
  Res,
  UnauthorizedException,
} from '@nestjs/common';
import { Throttle } from '@nestjs/throttler';
import type { Request, Response } from 'express';
import { ConfigService } from '@nestjs/config';
import type {
  LoginResponse,
  RefreshTokenResponse,
  SetupStatusResponse,
  User,
} from '@skillspell/shared';
import type { AppConfig } from '../config/configuration.js';
import { AuthService } from './auth.service.js';
import { TokenService } from './token.service.js';
import { SetupGuard } from './guards/setup.guard.js';
import { Public } from './decorators/public.decorator.js';
import { SetupRoute } from './decorators/setup-route.decorator.js';
import { CurrentUser } from './decorators/current-user.decorator.js';
import { LoginDto } from './dto/login.dto.js';
import { SetupDto } from './dto/setup.dto.js';
import { ChangePasswordDto } from './dto/change-password.dto.js';
import { LogoutDto } from './dto/logout.dto.js';
import { UpdateProfileDto } from './dto/update-profile.dto.js';
import {
  REFRESH_COOKIE_NAME,
  setRefreshTokenCookie,
  clearRefreshTokenCookie,
} from './cookie.utils.js';

/**
 * Authentication controller.
 *
 * Handles login, token refresh, logout, profile access, and first-run setup.
 * All endpoints are prefixed with /api/auth.
 *
 * SAML SSO routes are handled by the separate SamlController.
 *
 * Refresh tokens are stored in an httpOnly cookie (`ss_refresh`)
 * to prevent XSS-based token theft.
 * The access token is returned in the JSON body and stored in memory by the
 * frontend — never in localStorage.
 */

@Controller('auth')
export class AuthController {
  private readonly logger = new Logger(AuthController.name);
  private readonly refreshTokenExpiry: string;
  private readonly isProduction: boolean;

  constructor(
    private readonly authService: AuthService,
    private readonly tokenService: TokenService,
    private readonly setupGuard: SetupGuard,
    configService: ConfigService<AppConfig, true>,
  ) {
    this.refreshTokenExpiry = configService.get('auth.refreshTokenExpiry', { infer: true });
    this.isProduction = configService.get('app.isProduction', { infer: true });
  }

  /**
   * Check if initial setup has been completed.
   * Always accessible — no auth required.
   */
  @SetupRoute()
  @Public()
  @Get('setup-status')
  async getSetupStatus(): Promise<SetupStatusResponse> {
    return this.authService.getSetupStatus();
  }

  /**
   * First-run setup: create the initial admin user.
   * Only callable if no users exist.
   *
   * Sets the refresh token as an httpOnly cookie and returns only
   * the access token + user in the JSON body.
   */
  @SetupRoute()
  @Public()
  @Post('setup')
  async setup(
    @Body() dto: SetupDto,
    @Req() req: Request,
    @Res({ passthrough: true }) res: Response,
  ): Promise<Omit<LoginResponse, 'refreshToken'>> {
    const deviceInfo = req.headers['user-agent'];
    const result = await this.authService.setup(dto, deviceInfo);

    // Immediately unblock the guard so requests after setup don't hit the 5s TTL window.
    // signalSetupComplete is now async (writes to Redis for multi-replica safety).
    await this.setupGuard.signalSetupComplete();

    if (result.refreshToken) {
      setRefreshTokenCookie(res, result.refreshToken, this.refreshTokenExpiry, this.isProduction);
    }

    return {
      accessToken: result.accessToken,
      user: result.user,
    };
  }

  /**
   * Login with email and password.
   *
   * Sets the refresh token as an httpOnly cookie and returns only
   * the access token + user in the JSON body.
   */
  @Public()
  @Throttle({ short: { limit: 3, ttl: 1000 }, medium: { limit: 5, ttl: 60000 } })
  @Post('login')
  @HttpCode(HttpStatus.OK)
  async login(
    @Body() dto: LoginDto,
    @Req() req: Request,
    @Res({ passthrough: true }) res: Response,
  ): Promise<Omit<LoginResponse, 'refreshToken'>> {
    const deviceInfo = req.headers['user-agent'];
    const result = await this.authService.login(dto.email, dto.password, deviceInfo);

    if (result.refreshToken) {
      setRefreshTokenCookie(res, result.refreshToken, this.refreshTokenExpiry, this.isProduction);
    }

    return {
      accessToken: result.accessToken,
      user: result.user,
    };
  }

  /**
   * Refresh an expired access token using the httpOnly refresh token cookie.
   *
   * The caller sends the expired access token in the Authorization header
   * (for userId extraction). The refresh token is read from the cookie.
   */
  @Public()
  @Throttle({ short: { limit: 5, ttl: 1000 }, medium: { limit: 10, ttl: 60000 } })
  @Post('refresh')
  @HttpCode(HttpStatus.OK)
  async refresh(
    @Headers('authorization') authorization: string,
    @Req() req: Request,
    @Res({ passthrough: true }) res: Response,
  ): Promise<Omit<RefreshTokenResponse, 'refreshToken'>> {
    // Read the refresh token from the httpOnly cookie
    const refreshToken: string | undefined = req.cookies?.[REFRESH_COOKIE_NAME];

    if (!refreshToken) {
      throw new UnauthorizedException('No refresh token provided');
    }

    // Extract the expired access token from the Authorization header
    // Use a case-insensitive regex to strip the Bearer prefix, matching the
    // behaviour of cli-auth.controller.ts. The plain string replace only handled
    // 'Bearer ' (capital B) and would leave lowercase 'bearer ...' untouched.
    const expiredAccessToken = authorization?.replace(/^Bearer\s+/i, '') || undefined;
    const deviceInfo = req.headers['user-agent'];

    const result = await this.authService.refreshTokens(
      refreshToken,
      expiredAccessToken,
      deviceInfo,
    );

    // Set the new rotated refresh token cookie
    setRefreshTokenCookie(res, result.refreshToken, this.refreshTokenExpiry, this.isProduction);

    return {
      accessToken: result.accessToken,
    };
  }

  /**
   * Logout — revoke the refresh token and clear the cookie.
   */
  @Post('logout')
  @HttpCode(HttpStatus.OK)
  async logout(
    @CurrentUser('id') userId: string,
    @Req() req: Request,
    @Res({ passthrough: true }) res: Response,
    @Body() dto: LogoutDto,
  ): Promise<{ message: string }> {
    // Read the refresh token from the cookie (preferred) or body (backwards compat)
    const refreshToken: string | undefined =
      req.cookies?.[REFRESH_COOKIE_NAME] || dto.refreshToken;

    await this.authService.logout(userId, refreshToken);

    // Clear the refresh token cookie
    clearRefreshTokenCookie(res, this.isProduction);

    return { message: 'Logged out successfully' };
  }

  /**
   * Get the current authenticated user's profile.
   */
  @Get('me')
  async getProfile(@CurrentUser() user: User): Promise<User> {
    return user;
  }

  /**
   * Update the current user's profile (firstName, lastName).
   */
  @Patch('me')
  async updateProfile(
    @CurrentUser('id') userId: string,
    @Body() dto: UpdateProfileDto,
  ): Promise<User> {
    return this.authService.updateProfile(userId, dto);
  }

  /**
   * Change the current user's password.
   * Requires the current password for verification.
   */
  @Post('change-password')
  @HttpCode(HttpStatus.OK)
  async changePassword(
    @CurrentUser('id') userId: string,
    @Body() dto: ChangePasswordDto,
  ): Promise<{ message: string }> {
    await this.authService.changePassword(
      userId,
      dto.currentPassword,
      dto.newPassword,
    );
    return { message: 'Password changed successfully' };
  }
}
