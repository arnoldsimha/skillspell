import { Injectable, NotFoundException } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import type { PersonalAccessToken, IPersonalAccessTokenRepository } from '@skillspell/shared';
import { PersonalAccessTokenEntity } from '../entities/personal-access-token.entity';

@Injectable()
export class PostgresPersonalAccessTokenRepository
  implements IPersonalAccessTokenRepository
{
  constructor(
    @InjectRepository(PersonalAccessTokenEntity)
    private readonly repo: Repository<PersonalAccessTokenEntity>,
  ) {}

  async create(pat: PersonalAccessToken): Promise<PersonalAccessToken> {
    const entity = this.repo.create({
      id: pat.id,
      userId: pat.userId,
      name: pat.name,
      prefix: pat.prefix,
      tokenHash: pat.tokenHash,
      expiresAt: new Date(pat.expiresAt),
      revokedAt: pat.revokedAt ? new Date(pat.revokedAt) : null,
      lastUsedAt: pat.lastUsedAt ? new Date(pat.lastUsedAt) : null,
    });
    const saved = await this.repo.save(entity);
    return this.toPat(saved);
  }

  async findByTokenHash(tokenHash: string): Promise<PersonalAccessToken | null> {
    const entity = await this.repo.findOneBy({ tokenHash });
    return entity ? this.toPat(entity) : null;
  }

  async findByUserId(userId: string): Promise<PersonalAccessToken[]> {
    const entities = await this.repo.find({
      where: { userId },
      order: { createdAt: 'DESC' },
    });
    return entities.map((e) => this.toPat(e));
  }

  async findById(id: string): Promise<PersonalAccessToken | null> {
    const entity = await this.repo.findOneBy({ id });
    return entity ? this.toPat(entity) : null;
  }

  /**
   * Revoke a token by id, scoped to the owning userId.
   *
   * Enforces IDOR check per T-3-04: queries WHERE id = ? AND userId = ?
   * so a user cannot revoke another user's token.
   * Throws NotFoundException if the token is not found or not owned by userId.
   */
  async revoke(id: string, userId: string): Promise<void> {
    const result = await this.repo.update({ id, userId }, { revokedAt: new Date() });
    if (result.affected === 0) {
      throw new NotFoundException(`Personal access token not found`);
    }
  }

  /**
   * Update lastUsedAt on successful PAT authentication (D-06).
   * Called fire-and-forget — does not throw on failure.
   */
  async updateLastUsedAt(id: string): Promise<void> {
    await this.repo.update(id, { lastUsedAt: new Date() });
  }

  // ─── Mapper ─────────────────────────────────────────────────────────

  private toPat(entity: PersonalAccessTokenEntity): PersonalAccessToken {
    return {
      id: entity.id,
      userId: entity.userId,
      name: entity.name,
      prefix: entity.prefix,
      tokenHash: entity.tokenHash,
      expiresAt: entity.expiresAt.toISOString(),
      revokedAt: entity.revokedAt ? entity.revokedAt.toISOString() : null,
      lastUsedAt: entity.lastUsedAt ? entity.lastUsedAt.toISOString() : null,
      createdAt: entity.createdAt.toISOString(),
    };
  }
}
