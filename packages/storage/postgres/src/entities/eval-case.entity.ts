import {
  Entity, PrimaryGeneratedColumn, Column, CreateDateColumn,
  UpdateDateColumn, Index, ManyToOne, JoinColumn,
} from 'typeorm';
import { SkillEntity } from './skill.entity';

@Entity('eval_cases')
export class EvalCaseEntity {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @Column('uuid')
  @Index('idx_eval_cases_skill')
  skillId: string;

  @Column('text')
  name: string;

  @Column('text')
  prompt: string;

  @Column({ type: 'text', nullable: true })
  expectedOutput: string | null;

  @Column({ type: 'jsonb', default: '[]' })
  assertions: unknown[];

  @Column({ type: 'text', nullable: true })
  context: string | null;

  @Column({ type: 'int', nullable: true, default: 1 })
  createdAtVersion: number | null;

  @CreateDateColumn({ type: 'timestamptz' })
  createdAt: Date;

  @UpdateDateColumn({ type: 'timestamptz' })
  updatedAt: Date;

  @ManyToOne(() => SkillEntity, { onDelete: 'CASCADE' })
  @JoinColumn({ name: 'skillId' })
  skill: SkillEntity;
}
