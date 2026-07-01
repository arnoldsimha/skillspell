import { Module } from '@nestjs/common';
import { UsersController } from './users.controller.js';
import { UsersService } from './users.service.js';
import { InviteController } from './invite.controller.js';
import { InviteService } from './invite.service.js';
import { EmailModule } from '../email/email.module.js';
import { AuthModule } from '../auth/auth.module.js';

/**
 * User management module.
 *
 * Provides admin-only CRUD endpoints for user accounts
 * and invite endpoints for onboarding new users via email.
 *
 * Depends on:
 * - RepositoriesModule (global) for user, credential, auth token, invite token repos
 * - EmailModule for sending invite emails via SMTP
 * - AuthModule for TokenService (auto-login after invite completion)
 */
@Module({
  imports: [EmailModule, AuthModule],
  controllers: [UsersController, InviteController],
  providers: [UsersService, InviteService],
  exports: [UsersService],
})
export class UsersModule {}
