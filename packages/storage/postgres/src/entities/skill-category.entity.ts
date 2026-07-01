import {
  Entity,
  PrimaryColumn,
  ManyToOne,
  JoinColumn,
} from 'typeorm';
import { SkillEntity } from './skill.entity';
import { CategoryEntity } from './category.entity';

@Entity('skill_categories')
export class SkillCategoryEntity {
  @PrimaryColumn('uuid')
  skillId: string;

  @PrimaryColumn('uuid')
  categoryId: string;

  @ManyToOne(() => SkillEntity, { onDelete: 'CASCADE' })
  @JoinColumn({ name: 'skillId' })
  skill?: SkillEntity;

  @ManyToOne(() => CategoryEntity, { onDelete: 'CASCADE' })
  @JoinColumn({ name: 'categoryId' })
  category?: CategoryEntity;
}
