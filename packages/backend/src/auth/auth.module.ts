import { Module } from '@nestjs/common';
import { JwtModule, type JwtModuleOptions } from '@nestjs/jwt';
import { PassportModule } from '@nestjs/passport';
import { ConfigModule, ConfigService } from '@nestjs/config';
import type { AppConfig } from '../config/configuration.js';
import { AuthController } from './auth.controller.js';
import { SamlController } from './saml.controller.js';
import { PersonalAccessTokensController } from './personal-access-tokens.controller.js';
import { AuthService } from './auth.service.js';
import { TokenService } from './token.service.js';
import { PersonalAccessTokensService } from './personal-access-tokens.service.js';
import { SamlAuthService } from './strategies/saml.strategy.js';
import { JwtStrategy } from './strategies/jwt.strategy.js';
import { LocalStrategy } from './strategies/local.strategy.js';
import { PatStrategy } from './strategies/pat.strategy.js';
import { CliAuthController } from './cli-auth.controller.js';
import { CliAuthService } from './cli-auth.service.js';
import { OidcController } from './oidc.controller.js';
import { OidcAuthService } from './strategies/oidc.strategy.js';
import { EncryptionService } from '../common/services/encryption.service.js';
import { SetupGuard } from './guards/setup.guard.js';

/**
 * Authentication module.
 *
 * Provides JWT-based authentication, local (email/password) login,
 * SAML SSO, token management, and first-run setup.
 *
 * Dependencies:
 * - RepositoriesModule for user, credential, and auth token repositories
 * - JwtModule configured with the secret and expiry from env
 * - PassportModule with JWT and Local strategies
 * - SamlAuthService for SAML SSO (DB-backed config)
 */
@Module({
  imports: [
    PassportModule.register({ defaultStrategy: 'jwt' }),
    JwtModule.registerAsync({
      imports: [ConfigModule],
      useFactory: (configService: ConfigService<AppConfig, true>): JwtModuleOptions => {
        const authConfig = configService.get('auth', { infer: true });
        return {
          secret: authConfig.jwtSecret,
          signOptions: {
            algorithm: 'HS256' as const,
            // expiresIn accepts vercel/ms format strings like '15m', '1h', '7d'
            expiresIn: authConfig.accessTokenExpiry as any,
          },
        };
      },
      inject: [ConfigService],
    }),
  ],
  controllers: [AuthController, SamlController, OidcController, PersonalAccessTokensController, CliAuthController],
  providers: [
    AuthService,
    TokenService,
    PersonalAccessTokensService,
    SamlAuthService,
    OidcAuthService,
    JwtStrategy,
    LocalStrategy,
    PatStrategy,
    CliAuthService,
    EncryptionService,
    SetupGuard,
  ],
  exports: [AuthService, TokenService, PersonalAccessTokensService, SamlAuthService, OidcAuthService, SetupGuard, JwtModule],
})
export class AuthModule {}
