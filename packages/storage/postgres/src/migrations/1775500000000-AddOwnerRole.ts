import { MigrationInterface, QueryRunner } from "typeorm";

export class AddOwnerRole1775500000000 implements MigrationInterface {
    name = 'AddOwnerRole1775500000000'

    public async up(queryRunner: QueryRunner): Promise<void> {
        // The role column is 'text' type, so no enum alteration needed.
        // Update the original setup user from 'admin' to 'owner'.
        await queryRunner.query(`
            UPDATE "users"
            SET "role" = 'owner'
            WHERE "id" = (
                SELECT "adminUserId" FROM "setup_state" WHERE "id" = 1
            )
            AND "role" = 'admin'
        `);
    }

    public async down(queryRunner: QueryRunner): Promise<void> {
        // Revert all 'owner' users back to 'admin'
        await queryRunner.query(`
            UPDATE "users"
            SET "role" = 'admin'
            WHERE "role" = 'owner'
        `);
    }
}
