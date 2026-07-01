import { MigrationInterface, QueryRunner } from 'typeorm';

/**
 * CR-03: Rename oidc_configs.clientSecret → encryptedClientSecret.
 *
 * The column is renamed to make the encryption intent explicit and
 * mirror the SmtpConfig.encryptedPassword naming convention.
 *
 * IMPORTANT: Existing rows will have the old plaintext value in
 * encryptedClientSecret after this migration. The application will
 * fail to decrypt them (EncryptionService.decrypt expects the
 * iv:tag:ciphertext format). Admins must re-save their OIDC config
 * after this migration runs so the secret is re-encrypted.
 */
export class EncryptOidcClientSecret1776500000000 implements MigrationInterface {
  name = 'EncryptOidcClientSecret1776500000000';

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(
      `ALTER TABLE "oidc_configs" RENAME COLUMN "clientSecret" TO "encryptedClientSecret"`,
    );
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(
      `ALTER TABLE "oidc_configs" RENAME COLUMN "encryptedClientSecret" TO "clientSecret"`,
    );
  }
}
