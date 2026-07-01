import {
  Entity,
  PrimaryGeneratedColumn,
  Column,
  CreateDateColumn,
  ManyToOne,
  JoinColumn,
  Index,
} from 'typeorm';
import { UserEntity } from './user.entity';

/**
 * TypeORM entity for the personal_access_tokens table.
 *
 * Schema per D-02: stores SHA-256 hash only — raw token never persisted.
 * expiresAt is NOT NULL per D-03 (no infinite-lifetime tokens).
 * Partial index on isPublished added via migration (D-04).
 */
@Entity('personal_access_tokens')
@Index('idx_pat_token_hash', ['tokenHash'], { unique: true })
@Index('idx_pat_user', ['userId'])
export class PersonalAccessTokenEntity {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @Column('uuid')
  userId: string;

  /** Human-readable label provided by the user (e.g. "My CLI token"). */
  @Column({ type: 'text' })
  name: string;

  /** First 8 chars after `sksp_` for display in Token Management UI. */
  @Column({ type: 'text' })
  prefix: string;

  /** SHA-256 hash of the raw token. The raw token is never stored. */
  @Column({ type: 'text' })
  tokenHash: string;

  /** Expiry datetime. NOT NULL — enforced at DB level per D-03. */
  @Column({ type: 'timestamptz' })
  expiresAt: Date;

  /** revokedAt: set when the token is revoked. Null if the token is still active. */
  @Column({ type: 'timestamptz', nullable: true })
  revokedAt: Date | null;

  /** Updated non-blocking on each successful PAT authentication (D-06). */
  @Column({ type: 'timestamptz', nullable: true })
  lastUsedAt: Date | null;

  @CreateDateColumn({ type: 'timestamptz' })
  createdAt: Date;

  @ManyToOne(() => UserEntity, { onDelete: 'CASCADE' })
  @JoinColumn({ name: 'userId' })
  user: UserEntity;
}
