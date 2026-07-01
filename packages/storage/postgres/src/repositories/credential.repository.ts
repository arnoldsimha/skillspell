import { Injectable } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import type { UserCredential } from '@skillspell/shared';
import type { ICredentialRepository } from '@skillspell/shared';
import { UserCredentialEntity } from '../entities/user-credential.entity';

@Injectable()
export class PostgresCredentialRepository implements ICredentialRepository {
  constructor(
    @InjectRepository(UserCredentialEntity)
    private readonly credRepo: Repository<UserCredentialEntity>,
  ) {}

  async saveCredential(credential: UserCredential): Promise<void> {
    await this.credRepo.upsert(
      {
        userId: credential.userId,
        passwordHash: credential.passwordHash,
        mustChangePassword: credential.mustChangePassword,
        failedAttempts: credential.failedAttempts,
        lockedUntil: credential.lockedUntil ? new Date(credential.lockedUntil) : null,
      },
      ['userId'],
    );
  }

  async getCredential(userId: string): Promise<UserCredential | null> {
    const entity = await this.credRepo.findOneBy({ userId });
    return entity ? this.toCredential(entity) : null;
  }

  async updateCredential(
    userId: string,
    data: Partial<Pick<UserCredential, 'passwordHash' | 'mustChangePassword' | 'failedAttempts' | 'lockedUntil'>>,
  ): Promise<void> {
    const updateData: Partial<UserCredentialEntity> = {};
    if (data.passwordHash !== undefined) updateData.passwordHash = data.passwordHash;
    if (data.mustChangePassword !== undefined) updateData.mustChangePassword = data.mustChangePassword;
    if (data.failedAttempts !== undefined) updateData.failedAttempts = data.failedAttempts;
    if (data.lockedUntil !== undefined) updateData.lockedUntil = data.lockedUntil ? new Date(data.lockedUntil) : null;

    await this.credRepo.update(userId, updateData);
  }

  // ─── Mapper ─────────────────────────────────────────────────────────

  private toCredential(entity: UserCredentialEntity): UserCredential {
    return {
      userId: entity.userId,
      passwordHash: entity.passwordHash,
      mustChangePassword: entity.mustChangePassword,
      failedAttempts: entity.failedAttempts,
      lockedUntil: entity.lockedUntil?.toISOString(),
      updatedAt: entity.updatedAt.toISOString(),
    };
  }
}
