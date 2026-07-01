import { MigrationInterface, QueryRunner } from 'typeorm';

/**
 * Add passwordLoginEnabled and ssoLoginEnabled columns to organizations table.
 * Migrate the existing saml_configs.enabled value into organizations.ssoLoginEnabled,
 * then drop the enabled column from saml_configs.
 *
 * Both new columns default to true so existing organizations maintain current behavior.
 */
export class AddLoginModeFlags1775600000000 implements MigrationInterface {
  name = 'AddLoginModeFlags1775600000000';

  public async up(queryRunner: QueryRunner): Promise<void> {
    // 1. Add new columns to organizations
    await queryRunner.query(
      `ALTER TABLE "organizations" ADD "passwordLoginEnabled" boolean NOT NULL DEFAULT true`,
    );
    await queryRunner.query(
      `ALTER TABLE "organizations" ADD "ssoLoginEnabled" boolean NOT NULL DEFAULT true`,
    );

    // 2. Migrate saml_configs.enabled → organizations.ssoLoginEnabled
    //    If a SAML config exists with enabled=false, set ssoLoginEnabled=false on the org.
    await queryRunner.query(`
      UPDATE "organizations" o
      SET "ssoLoginEnabled" = sc."enabled"
      FROM "saml_configs" sc
      WHERE sc."orgId" = o."id"
    `);

    // 3. Drop the enabled column from saml_configs
    await queryRunner.query(
      `ALTER TABLE "saml_configs" DROP COLUMN "enabled"`,
    );
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    // 1. Re-add enabled column to saml_configs (default false)
    await queryRunner.query(
      `ALTER TABLE "saml_configs" ADD "enabled" boolean NOT NULL DEFAULT false`,
    );

    // 2. Migrate organizations.ssoLoginEnabled → saml_configs.enabled
    await queryRunner.query(`
      UPDATE "saml_configs" sc
      SET "enabled" = o."ssoLoginEnabled"
      FROM "organizations" o
      WHERE sc."orgId" = o."id"
    `);

    // 3. Drop the new columns from organizations
    await queryRunner.query(
      `ALTER TABLE "organizations" DROP COLUMN "ssoLoginEnabled"`,
    );
    await queryRunner.query(
      `ALTER TABLE "organizations" DROP COLUMN "passwordLoginEnabled"`,
    );
  }
}
