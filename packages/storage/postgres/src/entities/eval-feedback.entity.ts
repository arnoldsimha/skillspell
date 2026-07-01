import {
  Entity, PrimaryGeneratedColumn, Column, CreateDateColumn,
  UpdateDateColumn, Index, ManyToOne, JoinColumn,
} from 'typeorm';
import { SkillEntity } from './skill.entity';
import { EvalRunEntity } from './eval-run.entity';

@Entity('eval_feedback')
export class EvalFeedbackEntity {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @Column('uuid')
  @Index('idx_eval_feedback_run')
  runId: string;

  @Column('uuid')
  @Index('idx_eval_feedback_skill')
  skillId: string;

  @Column('text')
  feedback: string;

  @Column({ type: 'text', nullable: true })
  rating: 'good' | 'bad' | 'neutral' | null;

  @Column({ type: 'text', nullable: true })
  suggestedFix: string | null;

  @CreateDateColumn({ type: 'timestamptz' })
  createdAt: Date;

  @UpdateDateColumn({ type: 'timestamptz' })
  updatedAt: Date;

  @ManyToOne(() => EvalRunEntity, { onDelete: 'CASCADE' })
  @JoinColumn({ name: 'runId' })
  evalRun: EvalRunEntity;

  @ManyToOne(() => SkillEntity, { onDelete: 'CASCADE' })
  @JoinColumn({ name: 'skillId' })
  skill: SkillEntity;
}
