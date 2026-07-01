import { MigrationInterface, QueryRunner } from 'typeorm';

export class AddCategoriesAndTags1776700000000 implements MigrationInterface {
  name = 'AddCategoriesAndTags1776700000000';

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      CREATE TABLE IF NOT EXISTS "categories" (
        "id" uuid NOT NULL DEFAULT gen_random_uuid(),
        "orgId" uuid NOT NULL,
        "name" text NOT NULL,
        "slug" text NOT NULL,
        "description" text,
        "createdAt" timestamptz NOT NULL DEFAULT now(),
        "updatedAt" timestamptz NOT NULL DEFAULT now(),
        CONSTRAINT "pk_categories" PRIMARY KEY ("id")
      )
    `);
    await queryRunner.query(`
      CREATE UNIQUE INDEX IF NOT EXISTS "uq_categories_org_slug"
        ON "categories" ("orgId", "slug")
    `);
    await queryRunner.query(`
      CREATE INDEX IF NOT EXISTS "idx_categories_org"
        ON "categories" ("orgId")
    `);
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`DROP INDEX IF EXISTS "idx_categories_org"`);
    await queryRunner.query(`DROP INDEX IF EXISTS "uq_categories_org_slug"`);
    await queryRunner.query(`DROP TABLE IF EXISTS "categories"`);
  }
}
