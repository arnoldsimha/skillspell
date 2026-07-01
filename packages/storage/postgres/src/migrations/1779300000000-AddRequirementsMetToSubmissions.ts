import { MigrationInterface, QueryRunner } from 'typeorm';

export class AddRequirementsMetToSubmissions1779300000000 implements MigrationInterface {
  name = 'AddRequirementsMetToSubmissions1779300000000';

  async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(
      `ALTER TABLE marketplace_submissions ADD COLUMN IF NOT EXISTS requirements_met JSONB`,
    );
  }

  async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(
      `ALTER TABLE marketplace_submissions DROP COLUMN IF EXISTS requirements_met`,
    );
  }
}
