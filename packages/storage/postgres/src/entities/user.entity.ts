import {
  Entity, PrimaryGeneratedColumn, Column, CreateDateColumn,
  UpdateDateColumn, ManyToOne, JoinColumn,
} from 'typeorm';
import { OrganizationEntity } from './organization.entity';

@Entity('users')
export class UserEntity {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @Column('uuid')
  orgId: string;

  @Column({ type: 'text', unique: true })
  email: string;

  @Column('text')
  firstName: string;

  @Column('text')
  lastName: string;

  @Column({ type: 'text', default: 'user' })
  role: 'owner' | 'admin' | 'user';

  @Column({ type: 'boolean', default: true })
  isActive: boolean;

  @Column({ type: 'jsonb', default: '[]' })
  authProviders: string[];

  @Column({ type: 'boolean', default: true })
  profileComplete: boolean;

  @Column({ type: 'boolean', default: false })
  twoFactorEnabled: boolean;

  @CreateDateColumn({ type: 'timestamptz' })
  createdAt: Date;

  @UpdateDateColumn({ type: 'timestamptz' })
  updatedAt: Date;

  @Column({ type: 'timestamptz', nullable: true })
  lastLoginAt: Date | null;

  @Column({ type: 'text', nullable: true })
  timezone: string | null;

  @Column({ type: 'text', nullable: true })
  dateFormat: string | null;

  @ManyToOne(() => OrganizationEntity)
  @JoinColumn({ name: 'orgId' })
  organization: OrganizationEntity;
}
