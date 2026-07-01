import { MigrationInterface, QueryRunner } from 'typeorm';

export class AddOidcConfigAndActiveSsoProtocol1776400000000 implements MigrationInterface {
  name = 'AddOidcConfigAndActiveSsoProtocol1776400000000';

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      CREATE TABLE IF NOT EXISTS "oidc_configs" (
        "orgId"            uuid PRIMARY KEY REFERENCES organizations(id) ON DELETE CASCADE,
        "issuerUrl"        text NOT NULL,
        "clientId"         text NOT NULL,
        "clientSecret"     text NOT NULL,
        "scopes"           jsonb NOT NULL DEFAULT '["openid","email","profile"]',
        "attributeMapping" jsonb NOT NULL DEFAULT '{}',
        "autoProvision"    boolean NOT NULL DEFAULT true,
        "defaultRole"      text NOT NULL DEFAULT 'user',
        "authorizationUrl" text,
        "tokenUrl"         text,
        "jwksUri"          text,
        "createdAt"        timestamptz NOT NULL DEFAULT now(),
        "updatedAt"        timestamptz NOT NULL DEFAULT now()
      )
    `);
    await queryRunner.query(
      `ALTER TABLE "organizations" ADD COLUMN IF NOT EXISTS "activeSsoProtocol" text`,
    );
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`DROP TABLE IF EXISTS "oidc_configs"`);
    await queryRunner.query(
      `ALTER TABLE "organizations" DROP COLUMN IF EXISTS "activeSsoProtocol"`,
    );
  }
}
