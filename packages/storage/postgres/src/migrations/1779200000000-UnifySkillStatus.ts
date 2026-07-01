import { MigrationInterface, QueryRunner } from 'typeorm';

export class UnifySkillStatus1779200000000 implements MigrationInterface {
  name = 'UnifySkillStatus1779200000000';

  async up(queryRunner: QueryRunner): Promise<void> {
    // Step 1: exported → ready (safety net — never set in practice)
    await queryRunner.query(`
      UPDATE skills SET status = 'ready' WHERE status = 'exported'
    `);

    // Step 2: skills with a pending_review submission → in_review
    await queryRunner.query(`
      UPDATE skills s
      SET status = 'in_review'
      WHERE EXISTS (
        SELECT 1 FROM marketplace_submissions ms
        WHERE ms."skillId" = s.id
          AND ms.status = 'pending_review'
      )
    `);

    // Step 3: skills with an active or removal-requested listing → published
    // Runs after step 2 so published takes precedence
    await queryRunner.query(`
      UPDATE skills s
      SET status = 'published'
      WHERE EXISTS (
        SELECT 1 FROM marketplace_listings ml
        WHERE ml."skillId" = s.id
          AND ml.status IN ('active', 'removal_requested')
      )
    `);
  }

  async down(queryRunner: QueryRunner): Promise<void> {
    // Revert in_review/published back to ready — submission context is lost (acceptable)
    await queryRunner.query(`
      UPDATE skills SET status = 'ready'
      WHERE status IN ('published', 'in_review')
    `);
  }
}
