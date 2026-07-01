import {
  Entity, PrimaryColumn, Column, CreateDateColumn, ManyToOne, JoinColumn,
} from 'typeorm';
import { SkillEntity } from './skill.entity';

/**
 * Version snapshot of a skill. `name` is NOT stored here — it is skill-level
 * metadata, not versioned. `description` IS stored because it can change
 * with each refinement.
 */
@Entity('skill_versions')
export class SkillVersionEntity {
  @PrimaryColumn('uuid')
  skillId: string;

  @PrimaryColumn('int')
  version: number;

  @Column({ type: 'text', default: '' })
  description: string;

  @Column({ type: 'text', default: '' })
  skillContent: string;

  @Column({ type: 'jsonb', default: '[]' })
  scripts: unknown[];

  @Column({ type: 'jsonb', default: '[]', name: 'references_' })
  references: unknown[];

  @Column({ type: 'jsonb', default: '[]' })
  assets: unknown[];

  @Column({ type: 'text', nullable: true })
  explanation: string | null;

  @CreateDateColumn({ type: 'timestamptz' })
  createdAt: Date;

  @ManyToOne(() => SkillEntity, s => s.versions, { onDelete: 'CASCADE' })
  @JoinColumn({ name: 'skillId' })
  skill: SkillEntity;
}
