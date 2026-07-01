import {
  Entity, PrimaryColumn, Column, Check,
} from 'typeorm';

/**
 * Singleton table — only one row with id=1 is ever stored.
 */
@Entity('setup_state')
@Check('"id" = 1')
export class SetupStateEntity {
  @PrimaryColumn({ type: 'int', default: 1 })
  id: number;

  @Column({ type: 'boolean', default: false })
  setupComplete: boolean;

  @Column({ type: 'uuid', nullable: true })
  adminUserId: string | null;

  @Column({ type: 'uuid', nullable: true })
  orgId: string | null;

  @Column({ type: 'timestamptz', nullable: true })
  completedAt: Date | null;
}
