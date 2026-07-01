import {
  Entity, PrimaryColumn, Column, CreateDateColumn, ManyToOne, JoinColumn,
} from 'typeorm';
import { SkillEntity } from './skill.entity';

@Entity('skill_diagrams')
export class SkillDiagramEntity {
  @PrimaryColumn('uuid')
  skillId: string;

  @PrimaryColumn('int')
  version: number;

  @Column('text')
  mermaid: string;

  @Column({ type: 'text', default: '' })
  summary: string;

  @CreateDateColumn({ type: 'timestamptz' })
  createdAt: Date;

  @ManyToOne(() => SkillEntity, s => s.diagrams, { onDelete: 'CASCADE' })
  @JoinColumn({ name: 'skillId' })
  skill: SkillEntity;
}
