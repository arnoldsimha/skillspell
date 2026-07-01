import {
  Entity, PrimaryGeneratedColumn, Column, CreateDateColumn,
  ManyToOne, JoinColumn, Index,
} from 'typeorm';
import { OrganizationEntity } from './organization.entity';
import { UserEntity } from './user.entity';

@Entity('invite_tokens')
@Index('idx_invite_tokens_token_hash', ['tokenHash'], { unique: true })
@Index('idx_invite_tokens_email', ['email'])
@Index('idx_invite_tokens_org', ['orgId'])
export class InviteTokenEntity {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @Column('uuid')
  orgId: string;

  @Column({ type: 'text' })
  email: string;

  @Column({ type: 'text' })
  tokenHash: string;

  @Column('uuid')
  invitedBy: string;

  @Column({ type: 'text', default: 'user' })
  role: 'owner' | 'admin' | 'user';

  @Column({ type: 'timestamptz' })
  expiresAt: Date;

  @Column({ type: 'boolean', default: false })
  consumed: boolean;

  @Column({ type: 'uuid', nullable: true })
  consumedByUserId: string | null;

  @Column({ type: 'timestamptz', nullable: true })
  consumedAt: Date | null;

  @CreateDateColumn({ type: 'timestamptz' })
  createdAt: Date;

  @ManyToOne(() => OrganizationEntity)
  @JoinColumn({ name: 'orgId' })
  organization: OrganizationEntity;

  @ManyToOne(() => UserEntity)
  @JoinColumn({ name: 'invitedBy' })
  inviter: UserEntity;
}
