import {
  Entity,
  PrimaryColumn,
  Column,
  CreateDateColumn,
  UpdateDateColumn,
  OneToOne,
  JoinColumn,
} from 'typeorm';
import { OrganizationEntity } from './organization.entity';

@Entity('oidc_configs')
export class OidcConfigEntity {
  @PrimaryColumn('uuid')
  orgId: string;

  @Column('text')
  issuerUrl: string;

  @Column('text')
  clientId: string;

  /** AES-256-GCM encrypted client secret. CR-03: mirrors SmtpConfigEntity.encryptedPassword. */
  @Column({ type: 'text', name: 'encryptedClientSecret' })
  encryptedClientSecret: string;

  @Column({ type: 'jsonb', default: '["openid","email","profile"]' })
  scopes: string[];

  @Column({ type: 'jsonb', default: '{}' })
  attributeMapping: unknown;

  @Column({ type: 'boolean', default: true })
  autoProvision: boolean;

  @Column({ type: 'text', default: 'user' })
  defaultRole: string;

  @Column({ type: 'text', nullable: true })
  authorizationUrl: string | null;

  @Column({ type: 'text', nullable: true })
  tokenUrl: string | null;

  @Column({ type: 'text', nullable: true })
  jwksUri: string | null;

  @CreateDateColumn({ type: 'timestamptz' })
  createdAt: Date;

  @UpdateDateColumn({ type: 'timestamptz' })
  updatedAt: Date;

  @OneToOne(() => OrganizationEntity, { onDelete: 'CASCADE' })
  @JoinColumn({ name: 'orgId' })
  organization: OrganizationEntity;
}
