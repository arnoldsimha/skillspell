import { CreateDateColumn, Entity, PrimaryColumn } from 'typeorm';

@Entity('skill_favorites')
export class SkillFavoriteEntity {
  @PrimaryColumn({ name: 'skillId', type: 'uuid' })
  skillId!: string;

  @PrimaryColumn({ name: 'userId', type: 'uuid' })
  userId!: string;

  @CreateDateColumn({ name: 'createdAt', type: 'timestamptz' })
  createdAt!: Date;
}
