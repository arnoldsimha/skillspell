import { MigrationInterface, QueryRunner } from 'typeorm';

export class AddMarketplaceEnabled1781783522000 implements MigrationInterface {
  name = 'AddMarketplaceEnabled1781783522000';

  async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      ALTER TABLE organizations
        ADD COLUMN IF NOT EXISTS "marketplaceEnabled" BOOLEAN NOT NULL DEFAULT TRUE
    `);
  }

  async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      ALTER TABLE organizations
        DROP COLUMN IF EXISTS "marketplaceEnabled"
    `);
  }
}
