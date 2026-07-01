import {
  Entity, PrimaryColumn, Column, UpdateDateColumn, OneToOne, JoinColumn,
} from 'typeorm';
import { UserEntity } from './user.entity';

@Entity('user_credentials')
export class UserCredentialEntity {
  @PrimaryColumn('uuid')
  userId: string;

  @Column('text')
  passwordHash: string;

  @Column({ type: 'boolean', default: false })
  mustChangePassword: boolean;

  @Column({ type: 'int', default: 0 })
  failedAttempts: number;

  @Column({ type: 'timestamptz', nullable: true })
  lockedUntil: Date | null;

  @UpdateDateColumn({ type: 'timestamptz' })
  updatedAt: Date;

  @OneToOne(() => UserEntity, { onDelete: 'CASCADE' })
  @JoinColumn({ name: 'userId' })
  user: UserEntity;
}
