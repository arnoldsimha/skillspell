import { MigrationInterface, QueryRunner } from 'typeorm';

export class AddPersonalAccessTokensAndIsPublished1776100000000 implements MigrationInterface {
  name = 'AddPersonalAccessTokensAndIsPublished1776100000000';

  public async up(queryRunner: QueryRunner): Promise<void> {
    // 1. Add isPublished column to skills table
    await queryRunner.query(`
      ALTER TABLE "skills"
      ADD COLUMN IF NOT EXISTS "isPublished" boolean NOT NULL DEFAULT false
    `);
    // Partial index — only indexes published rows, avoids low-cardinality penalty
    await queryRunner.query(`
      CREATE INDEX IF NOT EXISTS "idx_skills_is_published"
      ON "skills" ("isPublished") WHERE "isPublished" = true
    `);

    // 2. Create personal_access_tokens table
    await queryRunner.query(`
      CREATE TABLE IF NOT EXISTS "personal_access_tokens" (
        "id" uuid NOT NULL DEFAULT gen_random_uuid(),
        "userId" uuid NOT NULL,
        "name" text NOT NULL,
        "prefix" text NOT NULL,
        "tokenHash" text NOT NULL,
        "expiresAt" timestamptz NOT NULL,
        "revokedAt" timestamptz,
        "lastUsedAt" timestamptz,
        "createdAt" timestamptz NOT NULL DEFAULT now(),
        CONSTRAINT "pk_personal_access_tokens" PRIMARY KEY ("id"),
        CONSTRAINT "fk_pat_user" FOREIGN KEY ("userId")
          REFERENCES "users"("id") ON DELETE CASCADE
      )
    `);
    await queryRunner.query(`
      CREATE UNIQUE INDEX IF NOT EXISTS "idx_pat_token_hash"
      ON "personal_access_tokens" ("tokenHash")
    `);
    await queryRunner.query(`
      CREATE INDEX IF NOT EXISTS "idx_pat_user"
      ON "personal_access_tokens" ("userId")
    `);
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`DROP INDEX IF EXISTS "idx_pat_user"`);
    await queryRunner.query(`DROP INDEX IF EXISTS "idx_pat_token_hash"`);
    await queryRunner.query(`DROP TABLE IF EXISTS "personal_access_tokens"`);
    await queryRunner.query(`DROP INDEX IF EXISTS "idx_skills_is_published"`);
    await queryRunner.query(`ALTER TABLE "skills" DROP COLUMN IF EXISTS "isPublished"`);
  }
}
