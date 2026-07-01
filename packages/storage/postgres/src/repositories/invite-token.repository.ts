import { Injectable } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { DataSource, MoreThan, Repository } from 'typeorm';
import type { InviteToken, UserRole } from '@skillspell/shared';
import type { IInviteTokenRepository } from '@skillspell/shared';
import { InviteTokenEntity } from '../entities/invite-token.entity';

@Injectable()
export class PostgresInviteTokenRepository implements IInviteTokenRepository {
  constructor(
    @InjectRepository(InviteTokenEntity)
    private readonly repo: Repository<InviteTokenEntity>,
    private readonly dataSource: DataSource,
  ) {}

  async create(invite: InviteToken): Promise<InviteToken> {
    const entity = this.repo.create({
      id: invite.id,
      orgId: invite.orgId,
      email: invite.email,
      tokenHash: invite.tokenHash,
      invitedBy: invite.invitedBy,
      role: invite.role,
      expiresAt: new Date(invite.expiresAt),
      consumed: invite.consumed,
      consumedByUserId: invite.consumedByUserId ?? null,
      consumedAt: invite.consumedAt ? new Date(invite.consumedAt) : null,
    });
    const saved = await this.repo.save(entity);
    return this.toInviteToken(saved);
  }

  async findByTokenHash(tokenHash: string): Promise<InviteToken | null> {
    const entity = await this.repo.findOneBy({ tokenHash });
    return entity ? this.toInviteToken(entity) : null;
  }

  async findPendingByEmail(email: string): Promise<InviteToken[]> {
    const entities = await this.repo.find({
      where: {
        email: email.toLowerCase(),
        consumed: false,
        expiresAt: MoreThan(new Date()),
      },
    });
    return entities.map((e) => this.toInviteToken(e));
  }

  async consume(id: string, userId: string | null): Promise<void> {
    await this.repo.update(id, {
      consumed: true,
      consumedByUserId: userId,
      consumedAt: new Date(),
    });
  }

  async consumeAndReplace(
    consumeId: string,
    replacement: InviteToken,
  ): Promise<InviteToken> {
    return this.dataSource.transaction(async (manager) => {
      // 1. Consume the old invite inside the transaction
      await manager.update(InviteTokenEntity, consumeId, {
        consumed: true,
        consumedByUserId: null,
        consumedAt: new Date(),
      });

      // 2. Create the replacement invite inside the same transaction
      const entity = manager.create(InviteTokenEntity, {
        id: replacement.id,
        orgId: replacement.orgId,
        email: replacement.email,
        tokenHash: replacement.tokenHash,
        invitedBy: replacement.invitedBy,
        role: replacement.role,
        expiresAt: new Date(replacement.expiresAt),
        consumed: replacement.consumed,
        consumedByUserId: replacement.consumedByUserId ?? null,
        consumedAt: replacement.consumedAt
          ? new Date(replacement.consumedAt)
          : null,
      });
      const saved = await manager.save(InviteTokenEntity, entity);
      return this.toInviteToken(saved);
    });
  }

  async findByOrg(orgId: string): Promise<InviteToken[]> {
    const entities = await this.repo.find({
      where: { orgId },
      order: { createdAt: 'DESC' },
    });
    return entities.map((e) => this.toInviteToken(e));
  }

  // ─── Mapper ─────────────────────────────────────────────────────────

  private toInviteToken(entity: InviteTokenEntity): InviteToken {
    return {
      id: entity.id,
      orgId: entity.orgId,
      email: entity.email,
      tokenHash: entity.tokenHash,
      invitedBy: entity.invitedBy,
      role: entity.role as UserRole,
      expiresAt: entity.expiresAt.toISOString(),
      consumed: entity.consumed,
      consumedByUserId: entity.consumedByUserId ?? undefined,
      consumedAt: entity.consumedAt?.toISOString() ?? undefined,
      createdAt: entity.createdAt.toISOString(),
    };
  }
}
