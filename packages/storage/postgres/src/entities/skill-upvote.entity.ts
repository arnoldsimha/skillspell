import { CreateDateColumn, Entity, PrimaryColumn } from 'typeorm';

@Entity('skill_upvotes')
export class SkillUpvoteEntity {
  @PrimaryColumn({ name: 'skillId', type: 'uuid' })
  skillId!: string;

  @PrimaryColumn({ name: 'userId', type: 'uuid' })
  userId!: string;

  @CreateDateColumn({ name: 'createdAt', type: 'timestamptz' })
  createdAt!: Date;
}
