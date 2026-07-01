import { MigrationInterface, QueryRunner } from 'typeorm';

export class AddTrigramIndexes1777400000000 implements MigrationInterface {
  transaction = false;

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`CREATE EXTENSION IF NOT EXISTS pg_trgm`);
    await queryRunner.query(`
      CREATE INDEX CONCURRENTLY IF NOT EXISTS idx_skills_name_trgm
        ON skills USING gin(name gin_trgm_ops)
    `);
    await queryRunner.query(`
      CREATE INDEX CONCURRENTLY IF NOT EXISTS idx_mkt_listing_snapshot_name_trgm
        ON marketplace_listings USING gin("snapshotName" gin_trgm_ops)
    `);
    await queryRunner.query(`
      CREATE INDEX CONCURRENTLY IF NOT EXISTS idx_mkt_sub_snapshot_name_trgm
        ON marketplace_submissions USING gin(snapshot_name gin_trgm_ops)
    `);
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`DROP INDEX IF EXISTS idx_skills_name_trgm`);
    await queryRunner.query(`DROP INDEX IF EXISTS idx_mkt_listing_snapshot_name_trgm`);
    await queryRunner.query(`DROP INDEX IF EXISTS idx_mkt_sub_snapshot_name_trgm`);
  }
}
