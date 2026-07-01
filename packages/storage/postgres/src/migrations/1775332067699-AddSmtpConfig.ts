import { MigrationInterface, QueryRunner } from "typeorm";

export class AddSmtpConfig1775332067699 implements MigrationInterface {
    name = 'AddSmtpConfig1775332067699'

    public async up(queryRunner: QueryRunner): Promise<void> {
        await queryRunner.query(`CREATE TABLE "smtp_configs" ("orgId" uuid NOT NULL, "host" text NOT NULL, "port" integer NOT NULL, "security" text NOT NULL DEFAULT 'starttls', "authMethod" text NOT NULL DEFAULT 'plain', "username" text NOT NULL DEFAULT '', "encryptedPassword" text NOT NULL DEFAULT '', "fromEmail" text NOT NULL, "fromName" text NOT NULL, "replyToEmail" text, "replyToName" text, "enabled" boolean NOT NULL DEFAULT false, "rejectUnauthorized" boolean NOT NULL DEFAULT true, "connectionTimeoutMs" integer NOT NULL DEFAULT '10000', "socketTimeoutMs" integer NOT NULL DEFAULT '30000', "defaultBcc" text, "defaultCc" text, "createdAt" TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(), "updatedAt" TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(), CONSTRAINT "PK_a553b48cdaa6baf59ccb9173625" PRIMARY KEY ("orgId"))`);
        await queryRunner.query(`ALTER TABLE "smtp_configs" ADD CONSTRAINT "FK_a553b48cdaa6baf59ccb9173625" FOREIGN KEY ("orgId") REFERENCES "organizations"("id") ON DELETE CASCADE ON UPDATE NO ACTION`);
    }

    public async down(queryRunner: QueryRunner): Promise<void> {
        await queryRunner.query(`ALTER TABLE "smtp_configs" DROP CONSTRAINT "FK_a553b48cdaa6baf59ccb9173625"`);
        await queryRunner.query(`DROP TABLE "smtp_configs"`);
    }

}
