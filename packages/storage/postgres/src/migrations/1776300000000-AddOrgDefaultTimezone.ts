import { MigrationInterface, QueryRunner } from 'typeorm';

export class AddOrgDefaultTimezone1776300000000 implements MigrationInterface {
  name = 'AddOrgDefaultTimezone1776300000000';

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(
      `ALTER TABLE "organizations" ADD COLUMN IF NOT EXISTS "defaultTimezone" text`,
    );
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(
      `ALTER TABLE "organizations" DROP COLUMN IF EXISTS "defaultTimezone"`,
    );
  }
}
