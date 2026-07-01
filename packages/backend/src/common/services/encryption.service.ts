import { Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { createCipheriv, createDecipheriv, randomBytes } from 'node:crypto';
import type { AppConfig } from '../../config/configuration.js';

/**
 * AES-256-GCM encryption service for sensitive data at rest.
 *
 * Used to encrypt SMTP passwords before storing in the database.
 * The encryption key is read from the `ENCRYPTION_KEY` environment variable.
 *
 * Format: `base64(iv):base64(authTag):base64(ciphertext)`
 */
@Injectable()
export class EncryptionService {
  private readonly logger = new Logger(EncryptionService.name);
  private readonly key: Buffer | null;

  private static readonly ALGORITHM = 'aes-256-gcm';
  private static readonly IV_LENGTH = 12; // 96 bits — recommended for GCM
  private static readonly AUTH_TAG_LENGTH = 16; // 128 bits

  constructor(private readonly config: ConfigService<AppConfig, true>) {
    const hexKey = this.config.get('smtp.encryptionKey', { infer: true });
    if (hexKey) {
      this.key = Buffer.from(hexKey, 'hex');
      this.logger.log('SMTP encryption key configured');
    } else {
      this.key = null;
      this.logger.warn(
        'ENCRYPTION_KEY not set — SMTP password encryption unavailable',
      );
    }
  }

  /**
   * Check if encryption is configured.
   */
  isConfigured(): boolean {
    return this.key !== null;
  }

  /**
   * Encrypt plaintext using AES-256-GCM.
   * @returns Encoded string: `base64(iv):base64(authTag):base64(ciphertext)`
   * @throws Error if encryption key is not configured.
   */
  encrypt(plaintext: string): string {
    if (!this.key) {
      throw new Error(
        'Cannot encrypt: ENCRYPTION_KEY is not configured. ' +
          'Generate one with: openssl rand -hex 32',
      );
    }

    const iv = randomBytes(EncryptionService.IV_LENGTH);
    const cipher = createCipheriv(EncryptionService.ALGORITHM, this.key, iv, {
      authTagLength: EncryptionService.AUTH_TAG_LENGTH,
    });

    const encrypted = Buffer.concat([
      cipher.update(plaintext, 'utf8'),
      cipher.final(),
    ]);
    const authTag = cipher.getAuthTag();

    return [
      iv.toString('base64'),
      authTag.toString('base64'),
      encrypted.toString('base64'),
    ].join(':');
  }

  /**
   * Decrypt an AES-256-GCM encrypted string.
   * @param encoded Format: `base64(iv):base64(authTag):base64(ciphertext)`
   * @returns The original plaintext.
   * @throws Error if decryption fails or key is not configured.
   */
  decrypt(encoded: string): string {
    if (!this.key) {
      throw new Error(
        'Cannot decrypt: ENCRYPTION_KEY is not configured.',
      );
    }

    const parts = encoded.split(':');
    if (parts.length !== 3) {
      throw new Error('Invalid encrypted data format (expected iv:tag:data)');
    }

    const [ivB64, authTagB64, ciphertextB64] = parts;
    const iv = Buffer.from(ivB64, 'base64');
    const authTag = Buffer.from(authTagB64, 'base64');
    const ciphertext = Buffer.from(ciphertextB64, 'base64');

    const decipher = createDecipheriv(
      EncryptionService.ALGORITHM,
      this.key,
      iv,
      { authTagLength: EncryptionService.AUTH_TAG_LENGTH },
    );
    decipher.setAuthTag(authTag);

    return Buffer.concat([
      decipher.update(ciphertext),
      decipher.final(),
    ]).toString('utf8');
  }
}
