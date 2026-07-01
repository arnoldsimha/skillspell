import { MigrationInterface, QueryRunner } from 'typeorm';

export class AddSkillFavorites1779148900000 implements MigrationInterface {
  name = 'AddSkillFavorites1779148900000';

  async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      CREATE TABLE IF NOT EXISTS skill_favorites (
        "skillId"   UUID        NOT NULL,
        "userId"    UUID        NOT NULL,
        "createdAt" TIMESTAMPTZ NOT NULL DEFAULT now(),
        PRIMARY KEY ("skillId", "userId"),
        CONSTRAINT fk_favorites_listing
          FOREIGN KEY ("skillId") REFERENCES marketplace_listings("skillId") ON DELETE CASCADE,
        CONSTRAINT fk_favorites_user
          FOREIGN KEY ("userId") REFERENCES users(id) ON DELETE CASCADE
      )
    `);
    await queryRunner.query(`
      CREATE INDEX IF NOT EXISTS "idx_skill_favorites_skillId"
        ON skill_favorites ("skillId")
    `);
    await queryRunner.query(`
      CREATE INDEX IF NOT EXISTS "idx_skill_favorites_userId"
        ON skill_favorites ("userId")
    `);
  }

  async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`DROP INDEX IF EXISTS "idx_skill_favorites_userId"`);
    await queryRunner.query(`DROP INDEX IF EXISTS "idx_skill_favorites_skillId"`);
    await queryRunner.query(`DROP TABLE IF EXISTS skill_favorites`);
  }
}
