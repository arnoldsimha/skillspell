import { Module } from '@nestjs/common';
import { EmailService } from './email.service.js';
import { EmailTemplateLoaderService } from './email-template-loader.service.js';
import { EncryptionService } from '../common/services/encryption.service.js';

/**
 * Email module.
 *
 * Provides EmailService for sending emails via the organization's
 * SMTP configuration, and EmailTemplateLoaderService for loading
 * email templates from .html/.txt files with {{placeholder}} substitution.
 *
 * Uses SMTP_CONFIG_REPOSITORY and ORGANIZATION_REPOSITORY directly
 * (provided globally by the storage module) — no dependency on
 * OrganizationModule, eliminating any circular dependency risk.
 */
@Module({
  providers: [EmailService, EmailTemplateLoaderService, EncryptionService],
  exports: [EmailService, EmailTemplateLoaderService],
})
export class EmailModule {}
