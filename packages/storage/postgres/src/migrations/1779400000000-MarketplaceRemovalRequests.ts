import { MigrationInterface, QueryRunner } from 'typeorm';

export class MarketplaceRemovalRequests1779400000000 implements MigrationInterface {
  name = 'MarketplaceRemovalRequests1779400000000';

  async up(queryRunner: QueryRunner): Promise<void> {
    // 1. Recreate marketplace_submission_status enum without 'removal_requested'.
    //    Must drop the column DEFAULT first — PostgreSQL won't drop the type
    //    while a column default references it (error 2BP01).
    await queryRunner.query(`
      ALTER TABLE marketplace_submissions
        ALTER COLUMN status DROP DEFAULT
    `);
    await queryRunner.query(`
      ALTER TABLE marketplace_submissions
        ALTER COLUMN status TYPE text
    `);
    await queryRunner.query(`DROP TYPE IF EXISTS marketplace_submission_status`);
    await queryRunner.query(`
      CREATE TYPE marketplace_submission_status AS ENUM (
        'pending_review', 'approved', 'rejected', 'removed'
      )
    `);
    await queryRunner.query(`
      ALTER TABLE marketplace_submissions
        ALTER COLUMN status TYPE marketplace_submission_status
          USING status::marketplace_submission_status
    `);
    await queryRunner.query(`
      ALTER TABLE marketplace_submissions
        ALTER COLUMN status SET DEFAULT 'pending_review'::marketplace_submission_status
    `);

    // 2. Create marketplace_removal_requests table
    await queryRunner.query(`
      CREATE TABLE marketplace_removal_requests (
        id                     UUID PRIMARY KEY DEFAULT gen_random_uuid(),
        "skillId"              UUID NOT NULL REFERENCES skills(id),
        scope                  TEXT NOT NULL CHECK (scope IN ('skill', 'version')),
        "targetSubmissionId"   UUID REFERENCES marketplace_submissions(id),
        reason                 TEXT,
        "submittedBy"          UUID NOT NULL REFERENCES users(id),
        status                 TEXT NOT NULL DEFAULT 'pending'
                                 CHECK (status IN ('pending', 'approved', 'rejected')),
        "reviewedBy"           UUID REFERENCES users(id),
        "reviewedAt"           TIMESTAMPTZ,
        "createdAt"            TIMESTAMPTZ NOT NULL DEFAULT now(),
        CONSTRAINT chk_scope_target CHECK (
          (scope = 'skill'   AND "targetSubmissionId" IS NULL) OR
          (scope = 'version' AND "targetSubmissionId" IS NOT NULL)
        )
      )
    `);

    // 3. Partial unique indexes — prevent duplicate pending requests
    await queryRunner.query(`
      CREATE UNIQUE INDEX uq_removal_req_pending_version
        ON marketplace_removal_requests ("targetSubmissionId")
        WHERE status = 'pending' AND scope = 'version'
    `);

    // 4. Additional cross-scope uniqueness constraint — prevent one pending skill-scope
    //    AND one pending version-scope for the same skill simultaneously
    await queryRunner.query(`
      CREATE UNIQUE INDEX uq_removal_req_pending_per_skill
        ON marketplace_removal_requests ("skillId")
        WHERE status = 'pending'
    `);
  }

  async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`DROP INDEX IF EXISTS uq_removal_req_pending_per_skill`);
    await queryRunner.query(`DROP INDEX IF EXISTS uq_removal_req_pending_version`);
    await queryRunner.query(`DROP TABLE IF EXISTS marketplace_removal_requests`);

    // Restore enum with removal_requested
    await queryRunner.query(`
      ALTER TABLE marketplace_submissions ALTER COLUMN status DROP DEFAULT
    `);
    await queryRunner.query(`
      ALTER TABLE marketplace_submissions ALTER COLUMN status TYPE text
    `);
    await queryRunner.query(`DROP TYPE IF EXISTS marketplace_submission_status`);
    await queryRunner.query(`
      CREATE TYPE marketplace_submission_status AS ENUM (
        'pending_review', 'approved', 'rejected', 'removed', 'removal_requested'
      )
    `);
    await queryRunner.query(`
      ALTER TABLE marketplace_submissions
        ALTER COLUMN status TYPE marketplace_submission_status
          USING status::marketplace_submission_status
    `);
    await queryRunner.query(`
      ALTER TABLE marketplace_submissions
        ALTER COLUMN status SET DEFAULT 'pending_review'::marketplace_submission_status
    `);
  }
}
