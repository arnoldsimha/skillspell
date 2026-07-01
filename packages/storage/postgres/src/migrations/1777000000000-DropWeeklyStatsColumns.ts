import { MigrationInterface, QueryRunner } from 'typeorm';

export class DropWeeklyStatsColumns1777000000000 implements MigrationInterface {
  name = 'DropWeeklyStatsColumns1777000000000';

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`DROP INDEX IF EXISTS "idx_dl_event_week"`);
    await queryRunner.query(`
      ALTER TABLE "skill_download_events"
        DROP COLUMN IF EXISTS "weekNumber",
        DROP COLUMN IF EXISTS "year"
    `);
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      ALTER TABLE "skill_download_events"
        ADD COLUMN IF NOT EXISTS "weekNumber" int,
        ADD COLUMN IF NOT EXISTS "year" int
    `);
    await queryRunner.query(`
      CREATE INDEX IF NOT EXISTS "idx_dl_event_week"
        ON "skill_download_events" ("year", "weekNumber")
    `);
  }
}
