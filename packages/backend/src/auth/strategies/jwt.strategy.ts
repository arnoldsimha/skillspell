import { Inject, Injectable, UnauthorizedException } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { PassportStrategy } from '@nestjs/passport';
import { ExtractJwt, Strategy } from 'passport-jwt';
import {
  USER_REPOSITORY,
  type IUserRepository,
  type JwtPayload,
  type User,
} from '@skillspell/shared';
import type { AppConfig } from '../../config/configuration.js';

/**
 * Passport JWT strategy.
 *
 * Validates the JWT access token from the Authorization header,
 * looks up the user by ID from the payload, and attaches the
 * full User object to `request.user`.
 */
@Injectable()
export class JwtStrategy extends PassportStrategy(Strategy, 'jwt') {
  constructor(
    configService: ConfigService<AppConfig, true>,
    @Inject(USER_REPOSITORY)
    private readonly userRepo: IUserRepository,
  ) {
    const authConfig = configService.get('auth', { infer: true });

    super({
      jwtFromRequest: ExtractJwt.fromAuthHeaderAsBearerToken(),
      ignoreExpiration: false,
      secretOrKey: authConfig.jwtSecret,
      algorithms: ['HS256' as const],
    });
  }

  /**
   * Called by Passport after JWT signature and expiry are validated.
   * The return value is attached to `request.user`.
   */
  async validate(payload: JwtPayload): Promise<User> {
    const user = await this.userRepo.findById(payload.sub);

    if (!user) {
      throw new UnauthorizedException('User not found');
    }

    if (!user.isActive) {
      throw new UnauthorizedException('Account is deactivated');
    }

    return user;
  }
}
