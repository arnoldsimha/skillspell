import {
  Entity, PrimaryGeneratedColumn, Column, CreateDateColumn,
  UpdateDateColumn, OneToMany, Index,
} from 'typeorm';
import { SkillVersionEntity } from './skill-version.entity';
import { SkillDiagramEntity } from './skill-diagram.entity';

@Entity('skills')
@Index('uq_skills_owner_name', ['ownerId', 'name'], { unique: true })
export class SkillEntity {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @Column('uuid')
  @Index('idx_skills_owner')
  ownerId: string;

  @Column({ type: 'text' })
  name: string;

  @Column({ type: 'text', default: '' })
  description: string;

  @Column({ type: 'text', default: 'draft' })
  status: 'draft' | 'ready' | 'in_review' | 'published';

  @Column({ type: 'text', default: '' })
  skillContent: string;

  @Column({ type: 'jsonb', default: '[]' })
  scripts: unknown[];

  @Column({ type: 'jsonb', default: '[]', name: 'references_' })
  references: unknown[];

  @Column({ type: 'jsonb', default: '[]' })
  assets: unknown[];

  @Column({ type: 'boolean', default: false })
  isPublished: boolean;

  @Column({ type: 'int', default: 1 })
  version: number;

  @CreateDateColumn({ type: 'timestamptz' })
  createdAt: Date;

  @UpdateDateColumn({ type: 'timestamptz' })
  updatedAt: Date;

  @OneToMany(() => SkillVersionEntity, v => v.skill)
  versions: SkillVersionEntity[];

  @OneToMany(() => SkillDiagramEntity, d => d.skill)
  diagrams: SkillDiagramEntity[];
}
