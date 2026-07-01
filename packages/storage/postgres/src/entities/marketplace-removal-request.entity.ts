import {
  Entity,
  PrimaryGeneratedColumn,
  Column,
  CreateDateColumn,
} from 'typeorm';

export type RemovalRequestScope = 'skill' | 'version';
export type RemovalRequestStatus = 'pending' | 'approved' | 'rejected';

@Entity('marketplace_removal_requests')
export class MarketplaceRemovalRequestEntity {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @Column('uuid')
  skillId: string;

  @Column({ type: 'text' })
  scope: RemovalRequestScope;

  @Column({ type: 'uuid', nullable: true })
  targetSubmissionId: string | null;

  @Column({ type: 'text', nullable: true })
  reason: string | null;

  @Column('uuid')
  submittedBy: string;

  @Column({ type: 'text', default: 'pending' })
  status: RemovalRequestStatus;

  @Column({ type: 'uuid', nullable: true })
  reviewedBy: string | null;

  @Column({ type: 'timestamptz', nullable: true })
  reviewedAt: Date | null;

  @CreateDateColumn({ type: 'timestamptz' })
  createdAt: Date;
}
