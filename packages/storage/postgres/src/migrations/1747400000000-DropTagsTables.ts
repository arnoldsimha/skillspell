import { MigrationInterface, QueryRunner } from 'typeorm';

export class DropTagsTables1747400000000 implements MigrationInterface {
  name = 'DropTagsTables1747400000000';

  public async up(queryRunner: QueryRunner): Promise<void> {
    // skill_tags must drop first (FK references tags)
    await queryRunner.query(`DROP INDEX IF EXISTS "idx_skill_tags_tag"`);
    await queryRunner.query(`DROP INDEX IF EXISTS "idx_skill_tags_skill"`);
    await queryRunner.query(`DROP TABLE IF EXISTS "skill_tags"`);
    await queryRunner.query(`DROP INDEX IF EXISTS "idx_tags_org"`);
    await queryRunner.query(`DROP INDEX IF EXISTS "uq_tags_org_slug"`);
    await queryRunner.query(`DROP TABLE IF EXISTS "tags"`);
  }

  public async down(_queryRunner: QueryRunner): Promise<void> {
    throw new Error(
      'DropTagsTables1747400000000 is irreversible — the tags and skill_tags tables cannot be restored via revert. Restore from backup.',
    );
  }
}
