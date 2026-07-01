import { MigrationInterface, QueryRunner } from 'typeorm';

export class AddSkillCategoryJoins1776800000000 implements MigrationInterface {
  name = 'AddSkillCategoryJoins1776800000000';

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      CREATE TABLE IF NOT EXISTS "skill_categories" (
        "skillId" uuid NOT NULL,
        "categoryId" uuid NOT NULL,
        CONSTRAINT "pk_skill_categories" PRIMARY KEY ("skillId", "categoryId"),
        CONSTRAINT "fk_skill_cat_skill" FOREIGN KEY ("skillId")
          REFERENCES "skills"("id") ON DELETE CASCADE,
        CONSTRAINT "fk_skill_cat_category" FOREIGN KEY ("categoryId")
          REFERENCES "categories"("id") ON DELETE CASCADE
      )
    `);
    await queryRunner.query(`
      CREATE INDEX IF NOT EXISTS "idx_skill_categories_skill"
        ON "skill_categories" ("skillId")
    `);
    await queryRunner.query(`
      CREATE INDEX IF NOT EXISTS "idx_skill_categories_category"
        ON "skill_categories" ("categoryId")
    `);
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`DROP INDEX IF EXISTS "idx_skill_categories_category"`);
    await queryRunner.query(`DROP INDEX IF EXISTS "idx_skill_categories_skill"`);
    await queryRunner.query(`DROP TABLE IF EXISTS "skill_categories"`);
  }
}
