import {
  Entity, PrimaryColumn, Column, CreateDateColumn,
  UpdateDateColumn, ManyToOne, JoinColumn,
} from 'typeorm';
import { SkillEntity } from './skill.entity';

@Entity('eval_benchmarks')
export class EvalBenchmarkEntity {
  @PrimaryColumn('uuid')
  skillId: string;

  @PrimaryColumn({ type: 'int', default: 0 })
  version: number;

  @Column('jsonb')
  data: unknown;

  @CreateDateColumn({ type: 'timestamptz' })
  createdAt: Date;

  @UpdateDateColumn({ type: 'timestamptz' })
  updatedAt: Date;

  @ManyToOne(() => SkillEntity, { onDelete: 'CASCADE' })
  @JoinColumn({ name: 'skillId' })
  skill: SkillEntity;
}
