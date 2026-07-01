import { MigrationInterface, QueryRunner } from 'typeorm';

export class AddMarketplaceSubmissions1776600000000 implements MigrationInterface {
  name = 'AddMarketplaceSubmissions1776600000000';

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      CREATE TYPE "marketplace_submission_status" AS ENUM
        ('pending_review', 'approved', 'rejected', 'removed')
    `);
    await queryRunner.query(`
      CREATE TABLE IF NOT EXISTS "marketplace_submissions" (
        "id" uuid NOT NULL DEFAULT gen_random_uuid(),
        "skillId" uuid NOT NULL,
        "version" text NOT NULL,
        "status" "marketplace_submission_status" NOT NULL DEFAULT 'pending_review',
        "submittedBy" uuid NOT NULL,
        "reviewedBy" uuid,
        "reviewNote" text,
        "submittedAt" timestamptz NOT NULL DEFAULT now(),
        "reviewedAt" timestamptz,
        CONSTRAINT "pk_marketplace_submissions" PRIMARY KEY ("id"),
        CONSTRAINT "fk_mkt_sub_skill" FOREIGN KEY ("skillId")
          REFERENCES "skills"("id") ON DELETE CASCADE
      )
    `);
    await queryRunner.query(`
      CREATE INDEX IF NOT EXISTS "idx_mkt_sub_skill"
        ON "marketplace_submissions" ("skillId")
    `);
    await queryRunner.query(`
      CREATE INDEX IF NOT EXISTS "idx_mkt_sub_status"
        ON "marketplace_submissions" ("status")
    `);
    await queryRunner.query(`
      CREATE INDEX IF NOT EXISTS "idx_mkt_sub_submitted_by"
        ON "marketplace_submissions" ("submittedBy")
    `);
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`DROP INDEX IF EXISTS "idx_mkt_sub_submitted_by"`);
    await queryRunner.query(`DROP INDEX IF EXISTS "idx_mkt_sub_status"`);
    await queryRunner.query(`DROP INDEX IF EXISTS "idx_mkt_sub_skill"`);
    await queryRunner.query(`DROP TABLE IF EXISTS "marketplace_submissions"`);
    await queryRunner.query(`DROP TYPE IF EXISTS "marketplace_submission_status"`);
  }
}
