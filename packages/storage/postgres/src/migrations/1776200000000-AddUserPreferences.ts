import { MigrationInterface, QueryRunner } from 'typeorm';

export class AddUserPreferences1776200000000 implements MigrationInterface {
  name = 'AddUserPreferences1776200000000';

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`ALTER TABLE "users" ADD COLUMN IF NOT EXISTS "timezone" text`);
    await queryRunner.query(`ALTER TABLE "users" ADD COLUMN IF NOT EXISTS "dateFormat" text`);
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`ALTER TABLE "users" DROP COLUMN IF EXISTS "dateFormat"`);
    await queryRunner.query(`ALTER TABLE "users" DROP COLUMN IF EXISTS "timezone"`);
  }
}
