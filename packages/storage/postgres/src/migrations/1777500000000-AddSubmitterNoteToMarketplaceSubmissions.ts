import { MigrationInterface, QueryRunner } from 'typeorm';

export class AddSubmitterNoteToMarketplaceSubmissions1777500000000 implements MigrationInterface {
  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      ALTER TABLE marketplace_submissions
        ADD COLUMN IF NOT EXISTS submitter_note TEXT NULL
    `);
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      ALTER TABLE marketplace_submissions
        DROP COLUMN IF EXISTS submitter_note
    `);
  }
}
