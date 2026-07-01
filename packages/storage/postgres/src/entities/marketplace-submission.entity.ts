import {
  Entity,
  PrimaryGeneratedColumn,
  Column,
  CreateDateColumn,
  Index,
} from 'typeorm';
import type { SubmissionRequirement } from '@skillspell/shared';

export enum MarketplaceSubmissionStatus {
  PENDING_REVIEW = 'pending_review',
  APPROVED = 'approved',
  REJECTED = 'rejected',
  REMOVED = 'removed',
}

@Entity('marketplace_submissions')
@Index('idx_mkt_sub_skill', ['skillId'])
@Index('idx_mkt_sub_status', ['status'])
@Index('idx_mkt_sub_submitted_by', ['submittedBy'])
export class MarketplaceSubmissionEntity {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @Column('uuid')
  skillId: string;

  @Column({ type: 'text', nullable: true })
  version: string | null;

  @Column({
    type: 'enum',
    enum: MarketplaceSubmissionStatus,
    enumName: 'marketplace_submission_status',
    default: MarketplaceSubmissionStatus.PENDING_REVIEW,
  })
  status: MarketplaceSubmissionStatus;

  @Column('uuid')
  submittedBy: string;

  @Column({ type: 'uuid', nullable: true })
  reviewedBy: string | null;

  @Column({ type: 'text', nullable: true })
  reviewNote: string | null;

  @CreateDateColumn({ type: 'timestamptz' })
  submittedAt: Date;

  @Column({ type: 'timestamptz', nullable: true })
  reviewedAt: Date | null;

  @Column({ name: 'snapshot_name', type: 'text', nullable: true })
  snapshotName: string | null;

  @Column({ name: 'snapshot_description', type: 'text', nullable: true })
  snapshotDescription: string | null;

  @Column({ name: 'snapshot_categories', type: 'text', array: true, default: '{}' })
  snapshotCategories: string[];

  @Column({ name: 'submitter_note', type: 'text', nullable: true })
  submitterNote: string | null;

  @Column({ name: 'requirements_met', type: 'jsonb', nullable: true })
  requirementsMet: SubmissionRequirement[] | null;
}
