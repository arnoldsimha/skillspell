import { Module } from '@nestjs/common';
import { AuthModule } from '../auth/auth.module.js';
import { EmailModule } from '../email/email.module.js';
import { OrganizationService } from './organization.service.js';
import { OrganizationController } from './organization.controller.js';
import { SsoConfigController } from './sso-config.controller.js';
import { SmtpConfigController } from './smtp-config.controller.js';
import { OidcConfigController } from './oidc-config.controller.js';
import { EncryptionService } from '../common/services/encryption.service.js';

/**
 * Organization module.
 *
 * Manages the singleton organization entity with domain-specific controllers:
 *   - {@link OrganizationController} — core org CRUD + aggregate GET
 *   - {@link SsoConfigController}    — SSO/SAML configuration
 *   - {@link SmtpConfigController}   — SMTP / email configuration
 *
 * Depends on RepositoriesModule for org + SAML + SMTP config repositories,
 * AuthModule for SamlAuthService (SP metadata generation),
 * and EmailModule for SMTP test operations.
 */
@Module({
  imports: [AuthModule, EmailModule],
  controllers: [OrganizationController, SsoConfigController, OidcConfigController, SmtpConfigController],
  providers: [OrganizationService, EncryptionService],
  exports: [OrganizationService],
})
export class OrganizationModule {}
