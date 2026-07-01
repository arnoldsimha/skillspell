import { Injectable } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import type { SamlProviderConfig, UserRole } from '@skillspell/shared';
import type { ISamlConfigRepository } from '@skillspell/shared';
import { SamlConfigEntity } from '../entities/saml-config.entity';

@Injectable()
export class PostgresSamlConfigRepository implements ISamlConfigRepository {
  constructor(
    @InjectRepository(SamlConfigEntity)
    private readonly samlRepo: Repository<SamlConfigEntity>,
  ) {}

  async getSamlConfig(orgId: string): Promise<SamlProviderConfig | null> {
    const entity = await this.samlRepo.findOneBy({ orgId });
    return entity ? this.toConfig(entity) : null;
  }

  async saveSamlConfig(orgId: string, config: SamlProviderConfig): Promise<void> {
    await this.samlRepo.upsert(
      {
        orgId,
        providerId: config.id,
        displayName: config.displayName,
        idpEntityId: config.idpEntityId,
        idpSsoUrl: config.idpSsoUrl,
        idpSloUrl: config.idpSloUrl ?? null,
        idpCertificate: config.idpCertificate,
        spEntityId: config.spEntityId,
        attributeMapping: config.attributeMapping as any,
        autoProvision: config.autoProvision,
        defaultRole: config.defaultRole,
        iconUrl: config.iconUrl ?? null,
      },
      ['orgId'],
    );
  }

  async deleteSamlConfig(orgId: string): Promise<void> {
    await this.samlRepo.delete({ orgId });
  }

  // ─── Mapper ─────────────────────────────────────────────────────────

  private toConfig(entity: SamlConfigEntity): SamlProviderConfig {
    const mapping = entity.attributeMapping as Record<string, string>;
    return {
      id: entity.providerId,
      displayName: entity.displayName,
      idpEntityId: entity.idpEntityId,
      idpSsoUrl: entity.idpSsoUrl,
      idpSloUrl: entity.idpSloUrl ?? undefined,
      idpCertificate: entity.idpCertificate,
      spEntityId: entity.spEntityId,
      attributeMapping: {
        email: mapping.email ?? '',
        firstName: mapping.firstName ?? '',
        lastName: mapping.lastName ?? '',
      },
      autoProvision: entity.autoProvision,
      defaultRole: entity.defaultRole as UserRole,
      iconUrl: entity.iconUrl ?? undefined,
      createdAt: entity.createdAt.toISOString(),
      updatedAt: entity.updatedAt.toISOString(),
    };
  }
}
