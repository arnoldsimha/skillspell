import { MigrationInterface, QueryRunner } from 'typeorm';

export class AddSkillDownloadEvents1776900000000 implements MigrationInterface {
  name = 'AddSkillDownloadEvents1776900000000';

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      CREATE TABLE IF NOT EXISTS "skill_download_events" (
        "id" uuid NOT NULL DEFAULT gen_random_uuid(),
        "skillId" uuid NOT NULL,
        "version" text NOT NULL,
        "downloadedAt" timestamptz NOT NULL DEFAULT now(),
        "weekNumber" int NOT NULL,
        "year" int NOT NULL,
        CONSTRAINT "pk_skill_download_events" PRIMARY KEY ("id"),
        CONSTRAINT "fk_dl_event_skill" FOREIGN KEY ("skillId")
          REFERENCES "skills"("id") ON DELETE CASCADE
      )
    `);
    await queryRunner.query(`
      CREATE INDEX IF NOT EXISTS "idx_dl_event_skill_version"
        ON "skill_download_events" ("skillId", "version")
    `);
    await queryRunner.query(`
      CREATE INDEX IF NOT EXISTS "idx_dl_event_week"
        ON "skill_download_events" ("year", "weekNumber")
    `);
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`DROP INDEX IF EXISTS "idx_dl_event_week"`);
    await queryRunner.query(`DROP INDEX IF EXISTS "idx_dl_event_skill_version"`);
    await queryRunner.query(`DROP TABLE IF EXISTS "skill_download_events"`);
  }
}
