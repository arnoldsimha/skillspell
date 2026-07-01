import {
  Entity, PrimaryGeneratedColumn, Column, CreateDateColumn,
  Index, ManyToOne, JoinColumn,
} from 'typeorm';
import { UserEntity } from './user.entity';

@Entity('refresh_tokens')
export class RefreshTokenEntity {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @Column('uuid')
  @Index('idx_refresh_tokens_user')
  userId: string;

  @Column('text')
  tokenHash: string;

  @Column({ type: 'text', nullable: true })
  deviceInfo: string | null;

  @Column({ type: 'timestamptz' })
  expiresAt: Date;

  @CreateDateColumn({ type: 'timestamptz' })
  createdAt: Date;

  @Column({ type: 'boolean', default: false })
  revoked: boolean;

  @ManyToOne(() => UserEntity, { onDelete: 'CASCADE' })
  @JoinColumn({ name: 'userId' })
  user: UserEntity;
}
