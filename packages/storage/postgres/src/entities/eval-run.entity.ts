import {
  Entity, PrimaryGeneratedColumn, Column, CreateDateColumn,
  Index, ManyToOne, JoinColumn,
} from 'typeorm';
import { SkillEntity } from './skill.entity';
import { EvalCaseEntity } from './eval-case.entity';

@Entity('eval_runs')
@Index('idx_eval_runs_skill_iteration', ['skillId', 'iteration'])    // Finding 17
@Index('idx_eval_runs_skill_version', ['skillId', 'skillVersion'])   // Finding 18
export class EvalRunEntity {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @Column('uuid')
  @Index('idx_eval_runs_eval')
  evalId: string;

  @Column('uuid')
  @Index('idx_eval_runs_skill')
  skillId: string;

  @Column({ type: 'jsonb', default: '{}' })
  config: unknown;

  @Column('text')
  prompt: string;

  @Column({ type: 'text', default: '' })
  outputWithSkill: string;

  @Column({ type: 'text', nullable: true })
  outputWithoutSkill: string | null;

  @Column({ type: 'jsonb', default: '[]' })
  outputFiles: unknown[];

  @Column({ type: 'jsonb', default: '{}' })
  grading: unknown;

  @Column({ type: 'jsonb', default: '{}' })
  timing: unknown;

  @Column({ type: 'jsonb', nullable: true })
  baselineTiming: unknown | null;

  @Column({ type: 'jsonb', nullable: true })
  baselineGrading: unknown | null;

  @Column({ type: 'text', default: 'pending' })
  status: 'pending' | 'running' | 'completed' | 'failed';

  @Column({ type: 'text', nullable: true })
  error: string | null;

  @Column({ type: 'int', nullable: true, default: 1 })
  iteration: number | null;

  @Column({ type: 'int', nullable: true })
  skillVersion: number | null;

  @CreateDateColumn({ type: 'timestamptz' })
  createdAt: Date;

  @Column({ type: 'timestamptz', nullable: true })
  completedAt: Date | null;

  @ManyToOne(() => EvalCaseEntity, { onDelete: 'CASCADE' })
  @JoinColumn({ name: 'evalId' })
  evalCase: EvalCaseEntity;

  @ManyToOne(() => SkillEntity, { onDelete: 'CASCADE' })
  @JoinColumn({ name: 'skillId' })
  skill: SkillEntity;
}
