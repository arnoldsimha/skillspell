import { MigrationInterface, QueryRunner } from 'typeorm';

export class AddSkillUpvotes1779148800000 implements MigrationInterface {
  name = 'AddSkillUpvotes1779148800000';

  async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      CREATE TABLE IF NOT EXISTS skill_upvotes (
        "skillId"   UUID        NOT NULL,
        "userId"    UUID        NOT NULL,
        "createdAt" TIMESTAMPTZ NOT NULL DEFAULT now(),
        PRIMARY KEY ("skillId", "userId"),
        CONSTRAINT fk_upvotes_listing
          FOREIGN KEY ("skillId") REFERENCES marketplace_listings("skillId") ON DELETE CASCADE,
        CONSTRAINT fk_upvotes_user
          FOREIGN KEY ("userId") REFERENCES users(id) ON DELETE CASCADE
      )
    `);
    await queryRunner.query(`
      CREATE INDEX IF NOT EXISTS "idx_skill_upvotes_skillId"
        ON skill_upvotes ("skillId")
    `);
    await queryRunner.query(`
      CREATE INDEX IF NOT EXISTS "idx_skill_upvotes_userId"
        ON skill_upvotes ("userId")
    `);
  }

  async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`DROP INDEX IF EXISTS "idx_skill_upvotes_userId"`);
    await queryRunner.query(`DROP INDEX IF EXISTS "idx_skill_upvotes_skillId"`);
    await queryRunner.query(`DROP TABLE IF EXISTS skill_upvotes`);
  }
}
