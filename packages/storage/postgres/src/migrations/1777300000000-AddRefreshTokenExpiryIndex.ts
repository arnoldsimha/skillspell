import { MigrationInterface, QueryRunner } from 'typeorm';

export class AddRefreshTokenExpiryIndex1777300000000 implements MigrationInterface {
  transaction = false;

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      CREATE INDEX CONCURRENTLY IF NOT EXISTS idx_refresh_tokens_expiry
        ON refresh_tokens ("expiresAt")
        WHERE revoked = false
    `);
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`DROP INDEX IF EXISTS idx_refresh_tokens_expiry`);
  }
}
