import { Injectable, NotFoundException } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { v4 as uuidv4 } from 'uuid';
import type { User, CreateUserData, UpdateUserData, AuthProvider } from '@skillspell/shared';
import { stripUndefined } from '../utils/strip-undefined';
import type { IUserRepository } from '@skillspell/shared';
import { UserEntity } from '../entities/user.entity';

@Injectable()
export class PostgresUserRepository implements IUserRepository {
  constructor(
    @InjectRepository(UserEntity)
    private readonly userRepo: Repository<UserEntity>,
  ) {}

  async create(data: CreateUserData): Promise<User> {
    const entity = this.userRepo.create({
      id: uuidv4(),
      orgId: data.orgId,
      email: data.email,
      firstName: data.firstName,
      lastName: data.lastName,
      role: data.role,
      isActive: true,
      authProviders: ['local'] as string[],
      profileComplete: true,
      twoFactorEnabled: false,
    });
    const saved = await this.userRepo.save(entity);
    return this.toUser(saved);
  }

  async findById(id: string): Promise<User | null> {
    const entity = await this.userRepo.findOneBy({ id });
    return entity ? this.toUser(entity) : null;
  }

  async findByEmail(email: string): Promise<User | null> {
    const entity = await this.userRepo.findOneBy({ email });
    return entity ? this.toUser(entity) : null;
  }

  async findAll(): Promise<User[]> {
    const entities = await this.userRepo.find({ order: { createdAt: 'ASC' } });
    return entities.map(e => this.toUser(e));
  }

  async update(id: string, data: UpdateUserData): Promise<User> {
    // Strip undefined values; handle lastLoginAt transformation separately
    const { lastLoginAt, ...rest } = data;
    const updateData: Partial<UserEntity> = stripUndefined<UserEntity>(rest as Record<string, unknown>);
    if (lastLoginAt !== undefined) updateData.lastLoginAt = new Date(lastLoginAt);

    await this.userRepo.update(id, updateData);
    const updated = await this.userRepo.findOneBy({ id });
    if (!updated) throw new NotFoundException(`User ${id} not found`);
    return this.toUser(updated);
  }

  async deactivate(id: string): Promise<void> {
    await this.userRepo.update(id, { isActive: false });
  }

  // ─── Mapper ─────────────────────────────────────────────────────────

  private toUser(entity: UserEntity): User {
    const DATE_FORMATS = ['MM/DD/YYYY', 'DD/MM/YYYY', 'YYYY-MM-DD'] as const;
    type DateFormat = (typeof DATE_FORMATS)[number];
    const dateFormat = DATE_FORMATS.includes(entity.dateFormat as DateFormat)
      ? (entity.dateFormat as DateFormat)
      : undefined;

    return {
      id: entity.id,
      orgId: entity.orgId,
      email: entity.email,
      firstName: entity.firstName,
      lastName: entity.lastName,
      role: entity.role,
      isActive: entity.isActive,
      authProviders: entity.authProviders as AuthProvider[],
      profileComplete: entity.profileComplete,
      twoFactorEnabled: entity.twoFactorEnabled,
      createdAt: entity.createdAt.toISOString(),
      updatedAt: entity.updatedAt.toISOString(),
      lastLoginAt: entity.lastLoginAt?.toISOString(),
      timezone: entity.timezone ?? undefined,
      dateFormat,
    };
  }
}
