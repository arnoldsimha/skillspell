import { MigrationInterface, QueryRunner } from "typeorm";

export class AddInviteTokens1775421300000 implements MigrationInterface {
    name = 'AddInviteTokens1775421300000'

    public async up(queryRunner: QueryRunner): Promise<void> {
        await queryRunner.query(`
            CREATE TABLE "invite_tokens" (
                "id" uuid NOT NULL DEFAULT uuid_generate_v4(),
                "orgId" uuid NOT NULL,
                "email" text NOT NULL,
                "tokenHash" text NOT NULL,
                "invitedBy" uuid NOT NULL,
                "role" text NOT NULL DEFAULT 'user',
                "expiresAt" TIMESTAMP WITH TIME ZONE NOT NULL,
                "consumed" boolean NOT NULL DEFAULT false,
                "consumedByUserId" uuid,
                "consumedAt" TIMESTAMP WITH TIME ZONE,
                "createdAt" TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
                CONSTRAINT "PK_invite_tokens" PRIMARY KEY ("id")
            )
        `);

        // Unique index on tokenHash
        await queryRunner.query(`CREATE UNIQUE INDEX "idx_invite_tokens_token_hash" ON "invite_tokens" ("tokenHash")`);

        // Index on email for pending invite lookups
        await queryRunner.query(`CREATE INDEX "idx_invite_tokens_email" ON "invite_tokens" ("email")`);

        // Index on orgId for organization-level listing
        await queryRunner.query(`CREATE INDEX "idx_invite_tokens_org" ON "invite_tokens" ("orgId")`);

        // Foreign key to organizations
        await queryRunner.query(`ALTER TABLE "invite_tokens" ADD CONSTRAINT "FK_invite_tokens_orgId" FOREIGN KEY ("orgId") REFERENCES "organizations"("id") ON DELETE CASCADE ON UPDATE NO ACTION`);

        // Foreign key to users (inviter)
        await queryRunner.query(`ALTER TABLE "invite_tokens" ADD CONSTRAINT "FK_invite_tokens_invitedBy" FOREIGN KEY ("invitedBy") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE NO ACTION`);
    }

    public async down(queryRunner: QueryRunner): Promise<void> {
        await queryRunner.query(`ALTER TABLE "invite_tokens" DROP CONSTRAINT "FK_invite_tokens_invitedBy"`);
        await queryRunner.query(`ALTER TABLE "invite_tokens" DROP CONSTRAINT "FK_invite_tokens_orgId"`);
        await queryRunner.query(`DROP INDEX "idx_invite_tokens_org"`);
        await queryRunner.query(`DROP INDEX "idx_invite_tokens_email"`);
        await queryRunner.query(`DROP INDEX "idx_invite_tokens_token_hash"`);
        await queryRunner.query(`DROP TABLE "invite_tokens"`);
    }

}
