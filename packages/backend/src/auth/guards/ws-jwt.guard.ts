import { Injectable, Inject, Logger } from '@nestjs/common';
import { JwtService } from '@nestjs/jwt';
import { ConfigService } from '@nestjs/config';
import { WsException } from '@nestjs/websockets';
import {
  USER_REPOSITORY,
  type IUserRepository,
  type JwtPayload,
  type User,
} from '@skillspell/shared';
import type { AppConfig } from '../../config/configuration.js';

@Injectable()
export class WsJwtGuard {
  private readonly logger = new Logger(WsJwtGuard.name);

  constructor(
    private readonly jwtService: JwtService,
    private readonly configService: ConfigService<AppConfig, true>,
    @Inject(USER_REPOSITORY) private readonly userRepo: IUserRepository,
  ) {}

  async authenticate(token: string | undefined): Promise<User> {
    if (!token) {
      this.logger.warn('WS auth rejected: no token provided');
      throw new WsException('Unauthorized');
    }

    let payload: JwtPayload;
    try {
      payload = this.jwtService.verify<JwtPayload>(token, {
        secret: this.configService.get('auth', { infer: true }).jwtSecret,
        algorithms: ['HS256'],
      });
    } catch (err) {
      this.logger.warn(`WS auth rejected: invalid/expired token — ${(err as Error).message}`);
      throw new WsException('Unauthorized');
    }

    const user = await this.userRepo.findById(payload.sub);
    if (!user) {
      this.logger.warn(`WS auth rejected: user not found userId=${payload.sub}`);
      throw new WsException('Unauthorized');
    }

    // Prevent deactivated accounts from opening sockets
    if (!user.isActive) {
      this.logger.warn(`WS auth rejected: account deactivated userId=${user.id}`);
      throw new WsException('Unauthorized');
    }

    return user;
  }
}
