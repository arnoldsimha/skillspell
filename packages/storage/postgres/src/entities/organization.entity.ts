import {
  Entity, PrimaryGeneratedColumn, Column, CreateDateColumn, UpdateDateColumn,
} from 'typeorm';

@Entity('organizations')
export class OrganizationEntity {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @Column('text')
  name: string;

  @Column('boolean', { default: true })
  passwordLoginEnabled: boolean;

  @Column('boolean', { default: true })
  ssoLoginEnabled: boolean;

  @Column({ type: 'text', nullable: true, default: null })
  activeSsoProtocol: string | null;

  @Column({ type: 'text', nullable: true })
  defaultTimezone: string | null;

  @Column({ type: 'boolean', default: false })
  marketplaceAllowSelfApproval: boolean;

  @Column({ type: 'boolean', default: true })
  marketplaceEnabled: boolean;

  @CreateDateColumn({ type: 'timestamptz' })
  createdAt: Date;

  @UpdateDateColumn({ type: 'timestamptz' })
  updatedAt: Date;
}
