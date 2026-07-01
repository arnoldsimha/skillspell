import {
  Entity,
  PrimaryGeneratedColumn,
  Column,
  CreateDateColumn,
  Index,
} from 'typeorm';

@Entity('skill_download_events')
@Index('idx_dl_event_skill_version', ['skillId', 'version'])
export class SkillDownloadEventEntity {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @Column('uuid')
  skillId: string;

  @Column({ type: 'text' })
  version: string;

  @CreateDateColumn({ type: 'timestamptz' })
  downloadedAt: Date;
}
