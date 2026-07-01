import { MigrationInterface, QueryRunner } from 'typeorm';

/**
 * Finding 17 + 18: Add composite indexes on eval_runs for performance.
 *
 * - idx_eval_runs_skill_iteration: accelerates MAX(iteration) WHERE skillId = ?
 * - idx_eval_runs_skill_version: accelerates benchmark queries filtered by skillVersion
 *
 * Uses CREATE INDEX IF NOT EXISTS to be idempotent (safe to re-run).
 * In production, prefer running these with CONCURRENTLY outside of a transaction:
 *
 *   CREATE INDEX CONCURRENTLY IF NOT EXISTS idx_eval_runs_skill_iteration
 *     ON eval_runs ("skillId", "iteration");
 *   CREATE INDEX CONCURRENTLY IF NOT EXISTS idx_eval_runs_skill_version
 *     ON eval_runs ("skillId", "skillVersion");
 */
export class AddEvalRunIndexes1775700000000 implements MigrationInterface {
  name = 'AddEvalRunIndexes1775700000000';

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(
      `CREATE INDEX IF NOT EXISTS "idx_eval_runs_skill_iteration"
       ON "eval_runs" ("skillId", "iteration")`,
    );
    await queryRunner.query(
      `CREATE INDEX IF NOT EXISTS "idx_eval_runs_skill_version"
       ON "eval_runs" ("skillId", "skillVersion")`,
    );
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(
      `DROP INDEX IF EXISTS "idx_eval_runs_skill_iteration"`,
    );
    await queryRunner.query(
      `DROP INDEX IF EXISTS "idx_eval_runs_skill_version"`,
    );
  }
}
