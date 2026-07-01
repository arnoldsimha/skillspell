import { Injectable } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import type { OidcProviderConfig, UserRole } from '@skillspell/shared';
import type { IOidcConfigRepository } from '@skillspell/shared';
import { OidcConfigEntity } from '../entities/oidc-config.entity';

@Injectable()
export class PostgresOidcConfigRepository implements IOidcConfigRepository {
  constructor(
    @InjectRepository(OidcConfigEntity)
    private readonly oidcRepo: Repository<OidcConfigEntity>,
  ) {}

  async getOidcConfig(orgId: string): Promise<OidcProviderConfig | null> {
    const entity = await this.oidcRepo.findOneBy({ orgId });
    return entity ? this.toConfig(entity) : null;
  }

  async saveOidcConfig(orgId: string, config: OidcProviderConfig): Promise<void> {
    const mapping = config.attributeMapping;
    await this.oidcRepo.upsert(
      {
        orgId,
        issuerUrl: config.issuerUrl,
        clientId: config.clientId,
        // CR-03: caller (OrganizationService) must pass an already-encrypted value here
        encryptedClientSecret: config.encryptedClientSecret,
        scopes: config.scopes,
        attributeMapping: mapping,
        autoProvision: config.autoProvision,
        defaultRole: config.defaultRole,
        authorizationUrl: config.authorizationUrl ?? null,
        tokenUrl: config.tokenUrl ?? null,
        jwksUri: config.jwksUri ?? null,
      },
      ['orgId'],
    );
  }

  async deleteOidcConfig(orgId: string): Promise<void> {
    await this.oidcRepo.delete({ orgId });
  }

  // ─── Mapper ─────────────────────────────────────────────────────────

  private toConfig(entity: OidcConfigEntity): OidcProviderConfig {
    const mapping = entity.attributeMapping as Record<string, string>;
    return {
      issuerUrl: entity.issuerUrl,
      clientId: entity.clientId,
      // CR-03: return the encrypted value; OrganizationService decrypts before use
      encryptedClientSecret: entity.encryptedClientSecret,
      scopes: entity.scopes,
      attributeMapping: {
        email: mapping['email'] ?? 'email',
        firstName: mapping['firstName'] ?? 'given_name',
        lastName: mapping['lastName'] ?? 'family_name',
      },
      autoProvision: entity.autoProvision,
      defaultRole: entity.defaultRole as UserRole,
      authorizationUrl: entity.authorizationUrl ?? undefined,
      tokenUrl: entity.tokenUrl ?? undefined,
      jwksUri: entity.jwksUri ?? undefined,
      createdAt: entity.createdAt.toISOString(),
      updatedAt: entity.updatedAt.toISOString(),
    };
  }
}
