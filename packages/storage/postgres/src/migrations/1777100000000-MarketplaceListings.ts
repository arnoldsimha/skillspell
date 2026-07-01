import { MigrationInterface, QueryRunner } from 'typeorm';

export class MarketplaceListings1777100000000 implements MigrationInterface {
  name = 'MarketplaceListings1777100000000';

  async up(queryRunner: QueryRunner): Promise<void> {
    // 1. Extend submission status enum
    await queryRunner.query(`
      ALTER TYPE marketplace_submission_status ADD VALUE IF NOT EXISTS 'removal_requested'
    `);

    // 2. Add snapshot columns + make version nullable on marketplace_submissions
    //    version is nullable because removal_request rows have no meaningful version number
    await queryRunner.query(`
      ALTER TABLE marketplace_submissions
        ADD COLUMN IF NOT EXISTS snapshot_name        TEXT,
        ADD COLUMN IF NOT EXISTS snapshot_description TEXT,
        ADD COLUMN IF NOT EXISTS snapshot_categories  TEXT[] NOT NULL DEFAULT '{}',
        ALTER COLUMN version DROP NOT NULL
    `);

    // 3. Create listing status enum
    await queryRunner.query(`
      DO $$ BEGIN
        CREATE TYPE marketplace_listing_status_enum AS ENUM ('active', 'removal_requested', 'removed');
      EXCEPTION WHEN duplicate_object THEN NULL;
      END $$
    `);

    // 4. Create removal type enum
    await queryRunner.query(`
      DO $$ BEGIN
        CREATE TYPE marketplace_removal_type_enum AS ENUM ('admin_policy', 'owner_request');
      EXCEPTION WHEN duplicate_object THEN NULL;
      END $$
    `);

    // 5. Create marketplace_listings table
    await queryRunner.query(`
      CREATE TABLE IF NOT EXISTS marketplace_listings (
        "id"                  UUID PRIMARY KEY DEFAULT gen_random_uuid(),
        "skillId"             UUID NOT NULL UNIQUE,
        "orgId"               UUID NOT NULL,
        "submissionId"        UUID NOT NULL,
        "snapshotName"        TEXT NOT NULL,
        "snapshotDescription" TEXT,
        "snapshotCategories"  TEXT[] NOT NULL DEFAULT '{}',
        "snapshotVersion"     INTEGER NOT NULL,
        "status"              marketplace_listing_status_enum NOT NULL DEFAULT 'active',
        "removalReason"       TEXT,
        "removedBy"           UUID,
        "removalType"         marketplace_removal_type_enum,
        "firstApprovedAt"     TIMESTAMPTZ NOT NULL,
        "lastApprovedAt"      TIMESTAMPTZ NOT NULL,
        CONSTRAINT fk_mkt_listing_skill
          FOREIGN KEY ("skillId") REFERENCES skills(id) ON DELETE RESTRICT,
        CONSTRAINT fk_mkt_listing_submission
          FOREIGN KEY ("submissionId") REFERENCES marketplace_submissions(id)
      )
    `);

    await queryRunner.query(
      `CREATE INDEX IF NOT EXISTS idx_mkt_listing_org    ON marketplace_listings("orgId")`,
    );
    await queryRunner.query(
      `CREATE INDEX IF NOT EXISTS idx_mkt_listing_status ON marketplace_listings("status")`,
    );
  }

  async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`DROP TABLE IF EXISTS marketplace_listings`);
    await queryRunner.query(`DROP TYPE IF EXISTS marketplace_removal_type_enum`);
    await queryRunner.query(`DROP TYPE IF EXISTS marketplace_listing_status_enum`);
    await queryRunner.query(`
      ALTER TABLE marketplace_submissions
        DROP COLUMN IF EXISTS snapshot_categories,
        DROP COLUMN IF EXISTS snapshot_description,
        DROP COLUMN IF EXISTS snapshot_name,
        ALTER COLUMN version SET NOT NULL
    `);
    // PostgreSQL does not support removing enum values; 'removal_requested' remains in the type
  }
}
