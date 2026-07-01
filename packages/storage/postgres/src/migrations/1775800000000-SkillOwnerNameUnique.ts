import { MigrationInterface, QueryRunner } from 'typeorm';

/**
 * Finding 1 (Critical): Replace the global UNIQUE constraint on skills.name
 * with a composite UNIQUE constraint on (ownerId, name).
 *
 * The original constraint prevented *any* two users from sharing a skill name,
 * which is overly restrictive in a multi-tenant application. The new composite
 * constraint scopes uniqueness to each owner:
 *
 *   - User A can have "My Skill" AND User B can also have "My Skill"
 *   - User A cannot create two skills both named "My Skill"
 *
 * The migration is idempotent: it uses IF EXISTS / IF NOT EXISTS guards so it
 * is safe to re-run.
 */
export class SkillOwnerNameUnique1775800000000 implements MigrationInterface {
  name = 'SkillOwnerNameUnique1775800000000';

  public async up(queryRunner: QueryRunner): Promise<void> {
    // 1. Drop the old global unique constraint / index on "name" (if it exists).
    //    TypeORM may have created it as either a constraint or a plain unique index.
    //    The InitialSchema migration created it as "UQ_81f05095507fd84aa2769b4a522".
    await queryRunner.query(
      `ALTER TABLE "skills" DROP CONSTRAINT IF EXISTS "UQ_81f05095507fd84aa2769b4a522"`,
    );
    await queryRunner.query(
      `DROP INDEX IF EXISTS "UQ_81f05095507fd84aa2769b4a522"`,
    );
    // Also handle alternative naming conventions that may have been applied
    await queryRunner.query(
      `ALTER TABLE "skills" DROP CONSTRAINT IF EXISTS "UQ_skills_name"`,
    );
    await queryRunner.query(
      `DROP INDEX IF EXISTS "UQ_skills_name"`,
    );
    await queryRunner.query(
      `ALTER TABLE "skills" DROP CONSTRAINT IF EXISTS "UQ_b0b15e8e9cf1ea25ce32869c32c"`,
    );
    await queryRunner.query(
      `DROP INDEX IF EXISTS "UQ_b0b15e8e9cf1ea25ce32869c32c"`,
    );

    // 2. Add the composite unique index on (ownerId, name).
    await queryRunner.query(
      `CREATE UNIQUE INDEX IF NOT EXISTS "uq_skills_owner_name"
       ON "skills" ("ownerId", "name")`,
    );
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    // Revert: drop the composite index and restore the original global unique constraint on name.
    await queryRunner.query(
      `DROP INDEX IF EXISTS "uq_skills_owner_name"`,
    );
    await queryRunner.query(
      `ALTER TABLE "skills" ADD CONSTRAINT "UQ_81f05095507fd84aa2769b4a522" UNIQUE ("name")`,
    );
  }
}
