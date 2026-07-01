import {
  Entity,
  PrimaryGeneratedColumn,
  Column,
  CreateDateColumn,
  UpdateDateColumn,
  Index,
} from 'typeorm';

@Entity('categories')
@Index('uq_categories_org_slug', ['orgId', 'slug'], { unique: true })
@Index('idx_categories_org', ['orgId'])
export class CategoryEntity {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @Column('uuid')
  orgId: string;

  @Column({ type: 'text' })
  name: string;

  @Column({ type: 'text' })
  slug: string;

  @Column({ type: 'text', nullable: true })
  description: string | null;

  @CreateDateColumn({ type: 'timestamptz' })
  createdAt: Date;

  @UpdateDateColumn({ type: 'timestamptz' })
  updatedAt: Date;
}
