import {
  Body,
  Controller,
  Delete,
  Get,
  HttpCode,
  HttpStatus,
  Param,
  ParseUUIDPipe,
  Post,
  Res,
} from '@nestjs/common';
import type { Response } from 'express';
import { ConfigService } from '@nestjs/config';
import type { User, InviteResult, LoginResponse } from '@skillspell/shared';
import type { AppConfig } from '../config/configuration.js';
import { Roles } from '../auth/decorators/roles.decorator.js';
import { Public } from '../auth/decorators/public.decorator.js';
import { CurrentUser } from '../auth/decorators/current-user.decorator.js';
import { setRefreshTokenCookie } from '../auth/cookie.utils.js';
import { InviteService } from './invite.service.js';
import { SendInvitesDto } from './dto/send-invites.dto.js';
import { CompleteInviteDto } from './dto/complete-invite.dto.js';

/**
 * Invite controller.
 *
 * - GET  /api/users/invites/pending — Admin: list pending invites
 * - DELETE /api/users/invites/:id   — Admin: revoke a pending invite
 * - POST /api/users/invite          — Admin: send invite emails (up to 5)
 * - GET  /api/invite/:token         — Public: validate invite token
 * - POST /api/invite/:token/complete — Public: complete registration
 */
@Controller()
export class InviteController {
  private readonly refreshTokenExpiry: string;
  private readonly isProduction: boolean;

  constructor(
    private readonly inviteService: InviteService,
    configService: ConfigService<AppConfig, true>,
  ) {
    this.refreshTokenExpiry = configService.get('auth.refreshTokenExpiry', { infer: true });
    this.isProduction = configService.get('app.isProduction', { infer: true });
  }

  /**
   * Admin: check whether SMTP is configured (needed to enable/disable invite button).
   */
  @Get('users/invite/smtp-status')
  @Roles('admin')
  async getSmtpStatus(): Promise<{ configured: boolean }> {
    const configured = await this.inviteService.isSmtpConfigured();
    return { configured };
  }

  /**
   * Admin: list all pending (unconsumed, unexpired) invites.
   */
  @Get('users/invites/pending')
  @Roles('admin')
  async listPendingInvites(@CurrentUser() user: User) {
    return this.inviteService.listPendingInvites(user.orgId);
  }

  /**
   * Admin: revoke a pending invite.
   */
  @Delete('users/invites/:id')
  @Roles('admin')
  @HttpCode(HttpStatus.OK)
  async revokeInvite(
    @Param('id', ParseUUIDPipe) id: string,
    @CurrentUser() user: User,
  ): Promise<{ message: string }> {
    await this.inviteService.revokeInvite(id, user.orgId);
    return { message: 'Invite revoked' };
  }

  /**
   * Admin: resend an invite email.
   * If the invite has < 5 minutes remaining, a new token is generated.
   */
  @Post('users/invites/:id/resend')
  @Roles('admin')
  async resendInvite(
    @Param('id', ParseUUIDPipe) id: string,
    @CurrentUser() user: User,
  ): Promise<{ message: string; renewed: boolean }> {
    const { renewed } = await this.inviteService.resendInvite(
      id,
      user.orgId,
      user.id,
    );
    return {
      message: renewed
        ? 'Invite renewed and resent (new token generated)'
        : 'Invite resent',
      renewed,
    };
  }

  /**
   * Admin: send invites to up to 5 email addresses.
   */
  @Post('users/invite')
  @Roles('admin')
  async sendInvites(
    @Body() dto: SendInvitesDto,
    @CurrentUser() user: User,
  ): Promise<InviteResult[]> {
    return this.inviteService.sendInvites({
      emails: dto.emails,
      role: dto.role ?? 'user',
      invitedBy: user.id,
      orgId: user.orgId,
    });
  }

  /**
   * Public: validate an invite token.
   * Returns the email associated with the invite.
   */
  @Get('invite/:token')
  @Public()
  async validateToken(
    @Param('token') token: string,
  ): Promise<{ valid: boolean; email: string }> {
    const invite = await this.inviteService.validateToken(token);
    return { valid: true, email: invite.email };
  }

  /**
   * Public: complete registration from an invite.
   * Creates the user and returns login tokens (auto-login).
   * Sets the refresh token as an httpOnly cookie.
   *
   * Security: refresh token is ONLY set via httpOnly cookie —
   * never returned in the JSON body. Uses the same cookie name and settings
   * as AuthController/SamlController for consistency.
   */
  @Post('invite/:token/complete')
  @Public()
  async completeInvite(
    @Param('token') token: string,
    @Body() dto: CompleteInviteDto,
    @Res({ passthrough: true }) res: Response,
  ): Promise<Omit<LoginResponse, 'refreshToken'>> {
    const result = await this.inviteService.completeInvite(token, {
      firstName: dto.firstName,
      lastName: dto.lastName,
      password: dto.password,
    });

    setRefreshTokenCookie(res, result.refreshToken, this.refreshTokenExpiry, this.isProduction);

    return {
      accessToken: result.accessToken,
      user: result.user,
    };
  }
}
