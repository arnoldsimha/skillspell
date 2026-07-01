import { MigrationInterface, QueryRunner } from 'typeorm';

export class AddMarketplaceAllowSelfApproval1777200000000 implements MigrationInterface {
  name = 'AddMarketplaceAllowSelfApproval1777200000000';

  async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      ALTER TABLE organizations
        ADD COLUMN IF NOT EXISTS "marketplaceAllowSelfApproval" BOOLEAN NOT NULL DEFAULT FALSE
    `);
  }

  async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      ALTER TABLE organizations
        DROP COLUMN IF EXISTS "marketplaceAllowSelfApproval"
    `);
  }
}
