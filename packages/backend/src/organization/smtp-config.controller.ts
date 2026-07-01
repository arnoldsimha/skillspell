import {
  Body,
  Controller,
  Delete,
  Get,
  HttpCode,
  HttpStatus,
  Post,
  Put,
} from '@nestjs/common';
import type { SmtpConfigResponse } from '@skillspell/shared';
import { Roles } from '../auth/decorators/roles.decorator.js';
import { OrganizationService } from './organization.service.js';
import { SaveSmtpConfigDto, TestSmtpEmailDto } from './dto/smtp-config.dto.js';
import { EmailService } from '../email/email.service.js';
import { EncryptionService } from '../common/services/encryption.service.js';

/**
 * SMTP configuration controller (admin-only).
 *
 * Handles all SMTP-related endpoints under `/api/admin/organization/smtp`.
 */
@Controller('admin/organization/smtp')
@Roles('admin')
export class SmtpConfigController {
  constructor(
    private readonly orgService: OrganizationService,
    private readonly emailService: EmailService,
    private readonly encryptionService: EncryptionService,
  ) {}

  /**
   * Get the SMTP configuration (password masked).
   */
  @Get()
  async getSmtpConfig(): Promise<SmtpConfigResponse | null> {
    const org = await this.orgService.getOrganization();
    return this.getSmtpConfigResponse(org.id);
  }

  /**
   * Create or update the SMTP configuration.
   */
  @Put()
  async saveSmtpConfig(
    @Body() dto: SaveSmtpConfigDto,
  ): Promise<SmtpConfigResponse> {
    const org = await this.orgService.getOrganization();
    const now = new Date().toISOString();
    const existing = await this.orgService.getSmtpConfig(org.id);

    // Encrypt password if provided; preserve existing if omitted
    let encryptedPassword = existing?.encryptedPassword ?? '';
    if (dto.password !== undefined && dto.password !== '') {
      encryptedPassword = this.encryptionService.encrypt(dto.password);
    }

    const config = {
      host: dto.host,
      port: dto.port,
      security: dto.security,
      authMethod: dto.authMethod,
      username: dto.username ?? '',
      encryptedPassword,
      fromEmail: dto.fromEmail,
      fromName: dto.fromName,
      replyToEmail: dto.replyToEmail,
      replyToName: dto.replyToName,
      enabled: dto.enabled,
      rejectUnauthorized: dto.rejectUnauthorized ?? true,
      connectionTimeoutMs: dto.connectionTimeoutMs ?? 10000,
      socketTimeoutMs: dto.socketTimeoutMs ?? 30000,
      defaultBcc: dto.defaultBcc,
      defaultCc: dto.defaultCc,
      createdAt: existing?.createdAt ?? now,
      updatedAt: now,
    };

    await this.orgService.saveSmtpConfig(org.id, config);

    return this.toSmtpConfigResponse(config);
  }

  /**
   * Delete the SMTP configuration.
   */
  @Delete()
  @HttpCode(HttpStatus.OK)
  async deleteSmtpConfig(): Promise<{ message: string }> {
    const org = await this.orgService.getOrganization();
    await this.orgService.deleteSmtpConfig(org.id);
    return { message: 'SMTP configuration deleted' };
  }

  /**
   * Test SMTP connectivity only — verifies the server accepts the connection.
   * Does NOT send any email.
   *
   * Accepts the SMTP connection config in the request body so the admin
   * can test *before* saving. If an existing config has a saved password
   * and no password is supplied, the saved password is used.
   */
  @Post('test-connection')
  async testSmtpConnection(
    @Body() dto: SaveSmtpConfigDto,
  ): Promise<{ success: boolean; message: string }> {
    // If auth is enabled but no password was provided, try to use the saved one
    let password = dto.password;
    if (dto.authMethod === 'plain' && !password) {
      const org = await this.orgService.getOrganization();
      const existing = await this.orgService.getSmtpConfig(org.id);
      if (existing?.encryptedPassword) {
        password = this.encryptionService.decrypt(existing.encryptedPassword);
      }
    }

    return this.emailService.testConnectionWithConfig({
      host: dto.host,
      port: dto.port,
      security: dto.security,
      authMethod: dto.authMethod,
      username: dto.username,
      password,
      rejectUnauthorized: dto.rejectUnauthorized,
      connectionTimeoutMs: dto.connectionTimeoutMs,
      socketTimeoutMs: dto.socketTimeoutMs,
    });
  }

  /**
   * Send a test email to verify the full SMTP pipeline works end-to-end.
   */
  @Post('test-email')
  async sendTestEmail(
    @Body() dto: TestSmtpEmailDto,
  ): Promise<{ success: boolean; message: string }> {
    return this.emailService.sendTestEmail(dto.recipientEmail);
  }

  // ─── Private Helpers ────────────────────────────────────────────────

  /**
   * Load SMTP config and convert to response format (password masked).
   */
  async getSmtpConfigResponse(
    orgId: string,
  ): Promise<SmtpConfigResponse | null> {
    const config = await this.orgService.getSmtpConfig(orgId);
    if (!config) return null;
    return this.toSmtpConfigResponse(config);
  }

  /**
   * Convert SmtpConfig to SmtpConfigResponse (strip password, add hasPassword).
   */
  private toSmtpConfigResponse(config: {
    host: string;
    port: number;
    security: string;
    authMethod: string;
    username: string;
    encryptedPassword: string;
    fromEmail: string;
    fromName: string;
    replyToEmail?: string;
    replyToName?: string;
    enabled: boolean;
    rejectUnauthorized: boolean;
    connectionTimeoutMs: number;
    socketTimeoutMs: number;
    defaultBcc?: string;
    defaultCc?: string;
    createdAt: string;
    updatedAt: string;
  }): SmtpConfigResponse {
    return {
      host: config.host,
      port: config.port,
      security: config.security as SmtpConfigResponse['security'],
      authMethod: config.authMethod as SmtpConfigResponse['authMethod'],
      username: config.username,
      hasPassword: !!config.encryptedPassword,
      fromEmail: config.fromEmail,
      fromName: config.fromName,
      replyToEmail: config.replyToEmail,
      replyToName: config.replyToName,
      enabled: config.enabled,
      rejectUnauthorized: config.rejectUnauthorized,
      connectionTimeoutMs: config.connectionTimeoutMs,
      socketTimeoutMs: config.socketTimeoutMs,
      defaultBcc: config.defaultBcc,
      defaultCc: config.defaultCc,
      createdAt: config.createdAt,
      updatedAt: config.updatedAt,
    };
  }
}
