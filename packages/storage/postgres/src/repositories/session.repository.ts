import { Injectable } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository, DataSource, MoreThan } from 'typeorm';
import type { SessionMessage } from '@skillspell/shared';
import type { ISessionRepository } from '@skillspell/shared';
import { SessionMessageEntity } from '../entities/session-message.entity';

@Injectable()
export class PostgresSessionRepository implements ISessionRepository {
  constructor(
    @InjectRepository(SessionMessageEntity)
    private readonly msgRepo: Repository<SessionMessageEntity>,
    private readonly dataSource: DataSource,
  ) {}

  async getMessages(skillId: string): Promise<SessionMessage[]> {
    const entities = await this.msgRepo.find({
      where: { skillId },
      order: { sequence: 'ASC' },
    });
    return entities.map(e => this.toSessionMessage(e));
  }

  async appendMessages(
    skillId: string,
    messages: Array<{ role: 'user' | 'assistant'; content: string }>,
  ): Promise<void> {
    const currentMax = await this.getMaxSequence(skillId);
    const entities = messages.map((msg, i) =>
      this.msgRepo.create({
        skillId,
        sequence: currentMax + i + 1,
        role: msg.role,
        content: msg.content,
      }),
    );
    await this.msgRepo.save(entities);
  }

  async appendWithEviction(
    skillId: string,
    message: { role: 'user' | 'assistant'; content: string },
    maxMessages: number,
  ): Promise<void> {
    await this.dataSource.transaction(async manager => {
      const repo = manager.getRepository(SessionMessageEntity);

      // Lock all rows for this skill to prevent concurrent eviction races.
      // This serializes appendWithEviction calls for the same skillId.
      const locked = await repo
        .createQueryBuilder('msg')
        .setLock('pessimistic_write')
        .where('msg.skillId = :skillId', { skillId })
        .getMany();

      const count = locked.length;
      const maxSeq = locked.reduce((max, m) => Math.max(max, m.sequence), 0);

      // If at capacity, delete the oldest messages
      if (count >= maxMessages) {
        const sorted = locked.sort((a, b) => a.sequence - b.sequence);
        const toRemove = sorted.slice(0, count - maxMessages + 1);
        if (toRemove.length > 0) {
          await repo.remove(toRemove);
        }
      }

      // Append new message
      const entity = repo.create({
        skillId,
        sequence: maxSeq + 1,
        role: message.role,
        content: message.content,
      });
      await repo.save(entity);
    });
  }

  async trimToMaxMessages(skillId: string, maxMessages: number): Promise<void> {
    const count = await this.msgRepo.count({ where: { skillId } });
    if (count <= maxMessages) return;

    const toDelete = await this.msgRepo.find({
      where: { skillId },
      order: { sequence: 'ASC' },
      take: count - maxMessages,
    });
    if (toDelete.length > 0) {
      await this.msgRepo.remove(toDelete);
    }
  }

  async deleteSession(skillId: string): Promise<void> {
    await this.msgRepo.delete({ skillId });
  }

  async getMessageCount(skillId: string): Promise<number> {
    return this.msgRepo.count({ where: { skillId } });
  }

  // ─── Helpers ────────────────────────────────────────────────────────

  private async getMaxSequence(skillId: string): Promise<number> {
    return this.getMaxSequenceFromRepo(this.msgRepo, skillId);
  }

  private async getMaxSequenceFromRepo(
    repo: Repository<SessionMessageEntity>,
    skillId: string,
  ): Promise<number> {
    const result = await repo
      .createQueryBuilder('msg')
      .select('MAX(msg.sequence)', 'max')
      .where('msg.skillId = :skillId', { skillId })
      .getRawOne();
    return result?.max ?? 0;
  }

  private toSessionMessage(entity: SessionMessageEntity): SessionMessage {
    return {
      skillId: entity.skillId,
      sequence: entity.sequence,
      role: entity.role,
      content: entity.content,
      createdAt: entity.createdAt.toISOString(),
    };
  }
}
