import { Injectable } from '@nestjs/common';
import { PassportStrategy } from '@nestjs/passport';
import { Strategy } from 'passport-local';
import type { User } from '@skillspell/shared';
import { AuthService } from '../auth.service.js';

/**
 * Passport local strategy for email/password authentication.
 *
 * Used by the login endpoint. Delegates validation to AuthService
 * which handles password verification, lockout checks, etc.
 */
@Injectable()
export class LocalStrategy extends PassportStrategy(Strategy, 'local') {
  constructor(private readonly authService: AuthService) {
    super({
      usernameField: 'email',
      passwordField: 'password',
    });
  }

  /**
   * Called by Passport with the email and password from the request body.
   * The return value is attached to `request.user`.
   */
  async validate(email: string, password: string): Promise<User> {
    return this.authService.validateLocalUser(email, password);
  }
}
