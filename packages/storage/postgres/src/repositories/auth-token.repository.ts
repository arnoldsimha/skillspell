import { Injectable } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository, LessThan } from 'typeorm';
import { v4 as uuidv4 } from 'uuid';
import type {
  RefreshToken, SsoLink, SetupState, AuthProvider,
} from '@skillspell/shared';
import type { IAuthTokenRepository } from '@skillspell/shared';
import { RefreshTokenEntity } from '../entities/refresh-token.entity';
import { SsoLinkEntity } from '../entities/sso-link.entity';
import { SetupStateEntity } from '../entities/setup-state.entity';

@Injectable()
export class PostgresAuthTokenRepository implements IAuthTokenRepository {
  constructor(
    @InjectRepository(RefreshTokenEntity)
    private readonly tokenRepo: Repository<RefreshTokenEntity>,
    @InjectRepository(SsoLinkEntity)
    private readonly ssoRepo: Repository<SsoLinkEntity>,
    @InjectRepository(SetupStateEntity)
    private readonly setupRepo: Repository<SetupStateEntity>,
  ) {}

  // ─── Refresh Tokens ─────────────────────────────────────────────────

  async saveRefreshToken(token: RefreshToken): Promise<void> {
    const entity = this.tokenRepo.create({
      id: token.id || uuidv4(),
      userId: token.userId,
      tokenHash: token.tokenHash,
      deviceInfo: token.deviceInfo ?? null,
      expiresAt: new Date(token.expiresAt),
      revoked: token.revoked ?? false,
    });
    await this.tokenRepo.save(entity);
  }

  async findRefreshToken(tokenId: string, userId: string): Promise<RefreshToken | null> {
    const entity = await this.tokenRepo.findOneBy({ id: tokenId, userId });
    return entity ? this.toRefreshToken(entity) : null;
  }

  /** CR-05: Look up a refresh token by tokenId only — used when userId is not yet known. */
  async findRefreshTokenByTokenId(tokenId: string): Promise<RefreshToken | null> {
    const entity = await this.tokenRepo.findOneBy({ id: tokenId });
    return entity ? this.toRefreshToken(entity) : null;
  }

  async revokeRefreshToken(tokenId: string, userId: string): Promise<void> {
    await this.tokenRepo.update({ id: tokenId, userId }, { revoked: true });
  }

  async revokeAllRefreshTokens(userId: string): Promise<void> {
    await this.tokenRepo.update({ userId }, { revoked: true });
  }

  async cleanupExpiredTokens(userId: string): Promise<void> {
    await this.tokenRepo
      .createQueryBuilder()
      .delete()
      .where('userId = :userId', { userId })
      .andWhere('(revoked = true OR expiresAt < :now)', { now: new Date() })
      .execute();
  }

  async deleteAllExpiredTokens(): Promise<number> {
    const result = await this.tokenRepo
      .createQueryBuilder()
      .delete()
      .where('revoked = true OR expiresAt < :now', { now: new Date() })
      .execute();
    return result.affected ?? 0;
  }

  // ─── SSO Links ──────────────────────────────────────────────────────

  async saveSsoLink(link: SsoLink): Promise<void> {
    await this.ssoRepo.upsert(
      {
        userId: link.userId,
        provider: link.provider,
        providerUserId: link.providerUserId,
        providerEmail: link.providerEmail,
        providerDisplayName: link.providerDisplayName ?? null,
        providerProfile: link.providerProfile as any ?? null,
      },
      ['userId', 'provider', 'providerUserId'],
    );
  }

  async findBySsoProvider(provider: string, providerUserId: string): Promise<SsoLink | null> {
    const entity = await this.ssoRepo.findOneBy({ provider, providerUserId });
    return entity ? this.toSsoLink(entity) : null;
  }

  async getSsoLinks(userId: string): Promise<SsoLink[]> {
    const entities = await this.ssoRepo.find({ where: { userId } });
    return entities.map(e => this.toSsoLink(e));
  }

  async removeSsoLink(userId: string, provider: string, providerUserId: string): Promise<void> {
    await this.ssoRepo.delete({ userId, provider, providerUserId });
  }

  // ─── Setup State ────────────────────────────────────────────────────

  async getSetupState(): Promise<SetupState | null> {
    const entity = await this.setupRepo.findOneBy({ id: 1 });
    if (!entity || !entity.setupComplete) return null;
    return {
      setupComplete: entity.setupComplete,
      adminUserId: entity.adminUserId!,
      orgId: entity.orgId!,
      completedAt: entity.completedAt!.toISOString(),
    };
  }

  async saveSetupState(state: SetupState): Promise<void> {
    await this.setupRepo.upsert(
      {
        id: 1,
        setupComplete: state.setupComplete,
        adminUserId: state.adminUserId,
        orgId: state.orgId,
        completedAt: new Date(state.completedAt),
      },
      ['id'],
    );
  }

  // ─── Mappers ────────────────────────────────────────────────────────

  private toRefreshToken(entity: RefreshTokenEntity): RefreshToken {
    return {
      id: entity.id,
      userId: entity.userId,
      tokenHash: entity.tokenHash,
      deviceInfo: entity.deviceInfo ?? undefined,
      expiresAt: entity.expiresAt.toISOString(),
      createdAt: entity.createdAt.toISOString(),
      revoked: entity.revoked,
    };
  }

  private toSsoLink(entity: SsoLinkEntity): SsoLink {
    return {
      userId: entity.userId,
      provider: entity.provider as AuthProvider,
      providerUserId: entity.providerUserId,
      providerEmail: entity.providerEmail,
      providerDisplayName: entity.providerDisplayName ?? undefined,
      providerProfile: entity.providerProfile as Record<string, unknown> | undefined,
      linkedAt: entity.linkedAt.toISOString(),
    };
  }
}
