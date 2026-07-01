import {
  Entity, PrimaryColumn, Column, CreateDateColumn,
  UpdateDateColumn, OneToOne, JoinColumn,
} from 'typeorm';
import { OrganizationEntity } from './organization.entity';

@Entity('saml_configs')
export class SamlConfigEntity {
  @PrimaryColumn('uuid')
  orgId: string;

  @Column('text')
  providerId: string;

  @Column('text')
  displayName: string;

  @Column('text')
  idpEntityId: string;

  @Column('text')
  idpSsoUrl: string;

  @Column({ type: 'text', nullable: true })
  idpSloUrl: string | null;

  @Column('text')
  idpCertificate: string;

  @Column('text')
  spEntityId: string;

  @Column({ type: 'jsonb', default: '{}' })
  attributeMapping: unknown;

  @Column({ type: 'boolean', default: false })
  autoProvision: boolean;

  @Column({ type: 'text', default: 'user' })
  defaultRole: string;

  @Column({ type: 'text', nullable: true })
  iconUrl: string | null;

  @CreateDateColumn({ type: 'timestamptz' })
  createdAt: Date;

  @UpdateDateColumn({ type: 'timestamptz' })
  updatedAt: Date;

  @OneToOne(() => OrganizationEntity, { onDelete: 'CASCADE' })
  @JoinColumn({ name: 'orgId' })
  organization: OrganizationEntity;
}
