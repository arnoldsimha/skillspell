import {
  Entity, PrimaryColumn, Column, CreateDateColumn, ManyToOne, JoinColumn,
} from 'typeorm';
import { SkillEntity } from './skill.entity';

@Entity('session_messages')
export class SessionMessageEntity {
  @PrimaryColumn('uuid')
  skillId: string;

  @PrimaryColumn('int')
  sequence: number;

  @Column('text')
  role: 'user' | 'assistant';

  @Column('text')
  content: string;

  @CreateDateColumn({ type: 'timestamptz' })
  createdAt: Date;

  @ManyToOne(() => SkillEntity, { onDelete: 'CASCADE' })
  @JoinColumn({ name: 'skillId' })
  skill: SkillEntity;
}
