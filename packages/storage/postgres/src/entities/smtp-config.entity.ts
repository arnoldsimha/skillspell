import {
  Entity, PrimaryColumn, Column, CreateDateColumn,
  UpdateDateColumn, OneToOne, JoinColumn,
} from 'typeorm';
import { OrganizationEntity } from './organization.entity';

@Entity('smtp_configs')
export class SmtpConfigEntity {
  @PrimaryColumn('uuid')
  orgId: string;

  // ─── 1. Connection Fields ─────────────────────────────────────────

  @Column('text')
  host: string;

  @Column('int')
  port: number;

  /** Connection security: 'none' | 'starttls' | 'tls' */
  @Column({ type: 'text', default: 'starttls' })
  security: string;

  // ─── 2. Authentication Fields ─────────────────────────────────────

  /** Auth method: 'none' | 'plain' | 'oauth2' */
  @Column({ type: 'text', default: 'plain' })
  authMethod: string;

  @Column({ type: 'text', default: '' })
  username: string;

  /** AES-256-GCM encrypted password. Empty when authMethod='none'. */
  @Column({ type: 'text', default: '' })
  encryptedPassword: string;

  // ─── 3. Sender Information Fields ─────────────────────────────────

  @Column('text')
  fromEmail: string;

  @Column('text')
  fromName: string;

  @Column({ type: 'text', nullable: true })
  replyToEmail: string | null;

  @Column({ type: 'text', nullable: true })
  replyToName: string | null;

  // ─── 4. Advanced/Optional Fields ──────────────────────────────────

  @Column({ type: 'boolean', default: false })
  enabled: boolean;

  @Column({ type: 'boolean', default: true })
  rejectUnauthorized: boolean;

  @Column({ type: 'int', default: 10000 })
  connectionTimeoutMs: number;

  @Column({ type: 'int', default: 30000 })
  socketTimeoutMs: number;

  @Column({ type: 'text', nullable: true })
  defaultBcc: string | null;

  @Column({ type: 'text', nullable: true })
  defaultCc: string | null;

  // ─── Timestamps ───────────────────────────────────────────────────

  @CreateDateColumn({ type: 'timestamptz' })
  createdAt: Date;

  @UpdateDateColumn({ type: 'timestamptz' })
  updatedAt: Date;

  @OneToOne(() => OrganizationEntity, { onDelete: 'CASCADE' })
  @JoinColumn({ name: 'orgId' })
  organization: OrganizationEntity;
}
