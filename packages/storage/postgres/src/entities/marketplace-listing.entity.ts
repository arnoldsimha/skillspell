import { Column, Entity, Index, JoinColumn, ManyToOne, PrimaryGeneratedColumn } from 'typeorm';
import { MarketplaceSubmissionEntity } from './marketplace-submission.entity';
import { SkillEntity } from './skill.entity';

export enum MarketplaceListingStatus {
  ACTIVE = 'active',
  REMOVAL_REQUESTED = 'removal_requested',
  REMOVED = 'removed',
}

export enum MarketplaceRemovalType {
  ADMIN_POLICY = 'admin_policy',
  OWNER_REQUEST = 'owner_request',
}

@Entity('marketplace_listings')
@Index('idx_mkt_listing_org', ['orgId'])
@Index('idx_mkt_listing_status', ['status'])
export class MarketplaceListingEntity {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @Column({ type: 'uuid', unique: true })
  skillId: string;

  @Column({ type: 'uuid' })
  orgId: string;

  @Column({ type: 'uuid' })
  submissionId: string;

  @Column({ type: 'text' })
  snapshotName: string;

  @Column({ type: 'text', nullable: true })
  snapshotDescription: string | null;

  @Column({ type: 'text', array: true, default: '{}' })
  snapshotCategories: string[];

  @Column({ type: 'integer' })
  snapshotVersion: number;

  @Column({
    type: 'enum',
    enum: MarketplaceListingStatus,
    enumName: 'marketplace_listing_status_enum',
    default: MarketplaceListingStatus.ACTIVE,
  })
  status: MarketplaceListingStatus;

  @Column({ type: 'text', nullable: true })
  removalReason: string | null;

  @Column({ type: 'uuid', nullable: true })
  removedBy: string | null;

  @Column({
    type: 'enum',
    enum: MarketplaceRemovalType,
    enumName: 'marketplace_removal_type_enum',
    nullable: true,
  })
  removalType: MarketplaceRemovalType | null;

  @Column({ type: 'timestamptz' })
  firstApprovedAt: Date;

  @Column({ type: 'timestamptz' })
  lastApprovedAt: Date;

  /**
   * IN-008: Cascade / RESTRICT design notes
   *
   * - skills FK: RESTRICT — skills cannot be hard-deleted while a listing row exists.
   *   Admins must call setStatus('removed') first to delist, then delete the skill.
   *
   * - skill_upvotes and skill_favorites tables reference this listing's skillId with
   *   ON DELETE CASCADE. This means hard-deleting a listing row cascades to remove
   *   all upvotes/favorites for that skill.
   *
   * - However, setStatus('removed') does NOT delete the listing row — it only changes
   *   the status column. After admin removal, upvote/favorite records persist in the DB.
   *   This is intentional: we preserve historical engagement data. The side effect is
   *   that countByUser() (no active-listing join) inflates the favorites count for
   *   users who favorited a since-removed skill — which is why getFavorites now uses
   *   countActiveByUser() (see marketplace.service.ts CR-005 fix).
   */
  @ManyToOne(() => SkillEntity, { onDelete: 'RESTRICT' })
  @JoinColumn({ name: 'skillId' })
  skill: SkillEntity;

  @ManyToOne(() => MarketplaceSubmissionEntity)
  @JoinColumn({ name: 'submissionId' })
  submission: MarketplaceSubmissionEntity;
}
