import {
  Entity, PrimaryColumn, Column, CreateDateColumn, Index, ManyToOne, JoinColumn,
} from 'typeorm';
import { UserEntity } from './user.entity';

@Entity('sso_links')
@Index('idx_sso_links_provider', ['provider', 'providerUserId'], { unique: true })
export class SsoLinkEntity {
  @PrimaryColumn('uuid')
  userId: string;

  @PrimaryColumn('text')
  provider: string;

  @PrimaryColumn('text')
  providerUserId: string;

  @Column('text')
  providerEmail: string;

  @Column({ type: 'text', nullable: true })
  providerDisplayName: string | null;

  @Column({ type: 'jsonb', nullable: true })
  providerProfile: unknown | null;

  @CreateDateColumn({ type: 'timestamptz' })
  linkedAt: Date;

  @ManyToOne(() => UserEntity, { onDelete: 'CASCADE' })
  @JoinColumn({ name: 'userId' })
  user: UserEntity;
}
