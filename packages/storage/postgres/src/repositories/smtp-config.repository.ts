import { Injectable } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import type { SmtpConfig, SmtpSecurityMode, SmtpAuthMethod } from '@skillspell/shared';
import type { ISmtpConfigRepository } from '@skillspell/shared';
import { SmtpConfigEntity } from '../entities/smtp-config.entity';

@Injectable()
export class PostgresSmtpConfigRepository implements ISmtpConfigRepository {
  constructor(
    @InjectRepository(SmtpConfigEntity)
    private readonly smtpRepo: Repository<SmtpConfigEntity>,
  ) {}

  async getSmtpConfig(orgId: string): Promise<SmtpConfig | null> {
    const entity = await this.smtpRepo.findOneBy({ orgId });
    return entity ? this.toConfig(entity) : null;
  }

  async saveSmtpConfig(orgId: string, config: SmtpConfig): Promise<void> {
    await this.smtpRepo.upsert(
      {
        orgId,
        host: config.host,
        port: config.port,
        security: config.security,
        authMethod: config.authMethod,
        username: config.username,
        encryptedPassword: config.encryptedPassword,
        fromEmail: config.fromEmail,
        fromName: config.fromName,
        replyToEmail: config.replyToEmail ?? null,
        replyToName: config.replyToName ?? null,
        enabled: config.enabled,
        rejectUnauthorized: config.rejectUnauthorized,
        connectionTimeoutMs: config.connectionTimeoutMs,
        socketTimeoutMs: config.socketTimeoutMs,
        defaultBcc: config.defaultBcc ?? null,
        defaultCc: config.defaultCc ?? null,
      },
      ['orgId'],
    );
  }

  async deleteSmtpConfig(orgId: string): Promise<void> {
    await this.smtpRepo.delete({ orgId });
  }

  // ─── Mapper ─────────────────────────────────────────────────────────

  private toConfig(entity: SmtpConfigEntity): SmtpConfig {
    return {
      host: entity.host,
      port: entity.port,
      security: entity.security as SmtpSecurityMode,
      authMethod: entity.authMethod as SmtpAuthMethod,
      username: entity.username,
      encryptedPassword: entity.encryptedPassword,
      fromEmail: entity.fromEmail,
      fromName: entity.fromName,
      replyToEmail: entity.replyToEmail ?? undefined,
      replyToName: entity.replyToName ?? undefined,
      enabled: entity.enabled,
      rejectUnauthorized: entity.rejectUnauthorized,
      connectionTimeoutMs: entity.connectionTimeoutMs,
      socketTimeoutMs: entity.socketTimeoutMs,
      defaultBcc: entity.defaultBcc ?? undefined,
      defaultCc: entity.defaultCc ?? undefined,
      createdAt: entity.createdAt.toISOString(),
      updatedAt: entity.updatedAt.toISOString(),
    };
  }
}
