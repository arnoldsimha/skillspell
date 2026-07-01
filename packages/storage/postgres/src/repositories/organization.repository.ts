import { Injectable } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { v4 as uuidv4 } from 'uuid';
import type { Organization } from '@skillspell/shared';
import type { IOrganizationRepository } from '@skillspell/shared';
import { OrganizationEntity } from '../entities/organization.entity';

@Injectable()
export class PostgresOrganizationRepository implements IOrganizationRepository {
  constructor(
    @InjectRepository(OrganizationEntity)
    private readonly orgRepo: Repository<OrganizationEntity>,
  ) {}

  async create(data: { name: string }): Promise<Organization> {
    const entity = this.orgRepo.create({
      id: uuidv4(),
      name: data.name,
    });
    const saved = await this.orgRepo.save(entity);
    return this.toOrg(saved);
  }

  async findById(id: string): Promise<Organization | null> {
    const entity = await this.orgRepo.findOneBy({ id });
    return entity ? this.toOrg(entity) : null;
  }

  async findSingleton(): Promise<Organization | null> {
    // System supports only one organization — return the first one found.
    const entity = await this.orgRepo.findOne({ where: {}, order: { createdAt: 'ASC' } });
    return entity ? this.toOrg(entity) : null;
  }

  async update(id: string, data: { name?: string; passwordLoginEnabled?: boolean; ssoLoginEnabled?: boolean; defaultTimezone?: string | null; activeSsoProtocol?: 'saml' | 'oidc' | null; marketplaceAllowSelfApproval?: boolean; marketplaceEnabled?: boolean }): Promise<Organization> {
    const updateData: Partial<OrganizationEntity> = {};
    if (data.name !== undefined) updateData.name = data.name;
    if (data.passwordLoginEnabled !== undefined) updateData.passwordLoginEnabled = data.passwordLoginEnabled;
    if (data.ssoLoginEnabled !== undefined) updateData.ssoLoginEnabled = data.ssoLoginEnabled;
    if (data.defaultTimezone !== undefined) updateData.defaultTimezone = data.defaultTimezone;
    if (data.activeSsoProtocol !== undefined) updateData.activeSsoProtocol = data.activeSsoProtocol ?? null;
    if (data.marketplaceAllowSelfApproval !== undefined) updateData.marketplaceAllowSelfApproval = data.marketplaceAllowSelfApproval;
    if (data.marketplaceEnabled !== undefined) updateData.marketplaceEnabled = data.marketplaceEnabled;

    if (Object.keys(updateData).length > 0) {
      await this.orgRepo.update(id, updateData);
    }
    const updated = await this.orgRepo.findOneByOrFail({ id });
    return this.toOrg(updated);
  }

  // ─── Mapper ─────────────────────────────────────────────────────────

  private toOrg(entity: OrganizationEntity): Organization {
    return {
      id: entity.id,
      name: entity.name,
      passwordLoginEnabled: entity.passwordLoginEnabled ?? true,
      ssoLoginEnabled: entity.ssoLoginEnabled ?? true,
      activeSsoProtocol: (entity.activeSsoProtocol as 'saml' | 'oidc' | null) ?? null,
      defaultTimezone: entity.defaultTimezone ?? undefined,
      marketplaceAllowSelfApproval: entity.marketplaceAllowSelfApproval ?? false,
      marketplaceEnabled: entity.marketplaceEnabled ?? true,
      createdAt: entity.createdAt.toISOString(),
      updatedAt: entity.updatedAt.toISOString(),
    };
  }
}
