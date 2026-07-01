import { MigrationInterface, QueryRunner } from "typeorm";

export class InitialSchema1775151832970 implements MigrationInterface {
    name = 'InitialSchema1775151832970'

    public async up(queryRunner: QueryRunner): Promise<void> {
        await queryRunner.query(`CREATE TABLE "skill_versions" ("skillId" uuid NOT NULL, "version" integer NOT NULL, "description" text NOT NULL DEFAULT '', "skillContent" text NOT NULL DEFAULT '', "scripts" jsonb NOT NULL DEFAULT '[]', "references_" jsonb NOT NULL DEFAULT '[]', "assets" jsonb NOT NULL DEFAULT '[]', "explanation" text, "createdAt" TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(), CONSTRAINT "PK_7a3a0840e4deddc77cd96b6b7b9" PRIMARY KEY ("skillId", "version"))`);
        await queryRunner.query(`CREATE TABLE "skill_diagrams" ("skillId" uuid NOT NULL, "version" integer NOT NULL, "mermaid" text NOT NULL, "summary" text NOT NULL DEFAULT '', "createdAt" TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(), CONSTRAINT "PK_369ddc5e2b0f34af35c0f1bd17b" PRIMARY KEY ("skillId", "version"))`);
        await queryRunner.query(`CREATE TABLE "skills" ("id" uuid NOT NULL DEFAULT uuid_generate_v4(), "ownerId" uuid NOT NULL, "name" text NOT NULL, "description" text NOT NULL DEFAULT '', "status" text NOT NULL DEFAULT 'draft', "skillContent" text NOT NULL DEFAULT '', "scripts" jsonb NOT NULL DEFAULT '[]', "references_" jsonb NOT NULL DEFAULT '[]', "assets" jsonb NOT NULL DEFAULT '[]', "conversation" jsonb NOT NULL DEFAULT '[]', "sessionId" text, "version" integer NOT NULL DEFAULT '1', "createdAt" TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(), "updatedAt" TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(), CONSTRAINT "UQ_81f05095507fd84aa2769b4a522" UNIQUE ("name"), CONSTRAINT "PK_0d3212120f4ecedf90864d7e298" PRIMARY KEY ("id"))`);
        await queryRunner.query(`CREATE INDEX "idx_skills_owner" ON "skills" ("ownerId") `);
        await queryRunner.query(`CREATE TABLE "session_messages" ("skillId" uuid NOT NULL, "sequence" integer NOT NULL, "role" text NOT NULL, "content" text NOT NULL, "createdAt" TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(), CONSTRAINT "PK_cd4a198679903fd9bcc334b807b" PRIMARY KEY ("skillId", "sequence"))`);
        await queryRunner.query(`CREATE TABLE "eval_cases" ("id" uuid NOT NULL DEFAULT uuid_generate_v4(), "skillId" uuid NOT NULL, "name" text NOT NULL, "prompt" text NOT NULL, "expectedOutput" text, "assertions" jsonb NOT NULL DEFAULT '[]', "context" text, "createdAtVersion" integer DEFAULT '1', "createdAt" TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(), "updatedAt" TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(), CONSTRAINT "PK_60b8e031fc08154aaf0c38f4d34" PRIMARY KEY ("id"))`);
        await queryRunner.query(`CREATE INDEX "idx_eval_cases_skill" ON "eval_cases" ("skillId") `);
        await queryRunner.query(`CREATE TABLE "eval_runs" ("id" uuid NOT NULL DEFAULT uuid_generate_v4(), "evalId" uuid NOT NULL, "skillId" uuid NOT NULL, "config" jsonb NOT NULL DEFAULT '{}', "prompt" text NOT NULL, "outputWithSkill" text NOT NULL DEFAULT '', "outputWithoutSkill" text, "outputFiles" jsonb NOT NULL DEFAULT '[]', "grading" jsonb NOT NULL DEFAULT '{}', "timing" jsonb NOT NULL DEFAULT '{}', "baselineTiming" jsonb, "baselineGrading" jsonb, "status" text NOT NULL DEFAULT 'pending', "error" text, "iteration" integer DEFAULT '1', "skillVersion" integer, "createdAt" TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(), "completedAt" TIMESTAMP WITH TIME ZONE, CONSTRAINT "PK_101cbfa3f6228653c22118190b6" PRIMARY KEY ("id"))`);
        await queryRunner.query(`CREATE INDEX "idx_eval_runs_eval" ON "eval_runs" ("evalId") `);
        await queryRunner.query(`CREATE INDEX "idx_eval_runs_skill" ON "eval_runs" ("skillId") `);
        await queryRunner.query(`CREATE TABLE "eval_feedback" ("id" uuid NOT NULL DEFAULT uuid_generate_v4(), "runId" uuid NOT NULL, "skillId" uuid NOT NULL, "feedback" text NOT NULL, "rating" text, "suggestedFix" text, "createdAt" TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(), "updatedAt" TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(), CONSTRAINT "PK_3bd383a8aba302e35f109d673d5" PRIMARY KEY ("id"))`);
        await queryRunner.query(`CREATE INDEX "idx_eval_feedback_run" ON "eval_feedback" ("runId") `);
        await queryRunner.query(`CREATE INDEX "idx_eval_feedback_skill" ON "eval_feedback" ("skillId") `);
        await queryRunner.query(`CREATE TABLE "eval_benchmarks" ("skillId" uuid NOT NULL, "version" integer NOT NULL DEFAULT '0', "data" jsonb NOT NULL, "createdAt" TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(), "updatedAt" TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(), CONSTRAINT "PK_a0247e79aa33ae6db4a3dc376ea" PRIMARY KEY ("skillId", "version"))`);
        await queryRunner.query(`CREATE TABLE "organizations" ("id" uuid NOT NULL DEFAULT uuid_generate_v4(), "name" text NOT NULL, "createdAt" TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(), "updatedAt" TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(), CONSTRAINT "PK_6b031fcd0863e3f6b44230163f9" PRIMARY KEY ("id"))`);
        await queryRunner.query(`CREATE TABLE "users" ("id" uuid NOT NULL DEFAULT uuid_generate_v4(), "orgId" uuid NOT NULL, "email" text NOT NULL, "firstName" text NOT NULL, "lastName" text NOT NULL, "role" text NOT NULL DEFAULT 'user', "isActive" boolean NOT NULL DEFAULT true, "authProviders" jsonb NOT NULL DEFAULT '[]', "profileComplete" boolean NOT NULL DEFAULT true, "twoFactorEnabled" boolean NOT NULL DEFAULT false, "createdAt" TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(), "updatedAt" TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(), "lastLoginAt" TIMESTAMP WITH TIME ZONE, CONSTRAINT "UQ_97672ac88f789774dd47f7c8be3" UNIQUE ("email"), CONSTRAINT "PK_a3ffb1c0c8416b9fc6f907b7433" PRIMARY KEY ("id"))`);
        await queryRunner.query(`CREATE TABLE "user_credentials" ("userId" uuid NOT NULL, "passwordHash" text NOT NULL, "mustChangePassword" boolean NOT NULL DEFAULT false, "failedAttempts" integer NOT NULL DEFAULT '0', "lockedUntil" TIMESTAMP WITH TIME ZONE, "updatedAt" TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(), CONSTRAINT "PK_07e09814aad35a2da5ef5a73e14" PRIMARY KEY ("userId"))`);
        await queryRunner.query(`CREATE TABLE "refresh_tokens" ("id" uuid NOT NULL DEFAULT uuid_generate_v4(), "userId" uuid NOT NULL, "tokenHash" text NOT NULL, "deviceInfo" text, "expiresAt" TIMESTAMP WITH TIME ZONE NOT NULL, "createdAt" TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(), "revoked" boolean NOT NULL DEFAULT false, CONSTRAINT "PK_7d8bee0204106019488c4c50ffa" PRIMARY KEY ("id"))`);
        await queryRunner.query(`CREATE INDEX "idx_refresh_tokens_user" ON "refresh_tokens" ("userId") `);
        await queryRunner.query(`CREATE TABLE "sso_links" ("userId" uuid NOT NULL, "provider" text NOT NULL, "providerUserId" text NOT NULL, "providerEmail" text NOT NULL, "providerDisplayName" text, "providerProfile" jsonb, "linkedAt" TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(), CONSTRAINT "PK_7cad7260cd9d215579aa82c9587" PRIMARY KEY ("userId", "provider", "providerUserId"))`);
        await queryRunner.query(`CREATE UNIQUE INDEX "idx_sso_links_provider" ON "sso_links" ("provider", "providerUserId") `);
        await queryRunner.query(`CREATE TABLE "setup_state" ("id" integer NOT NULL DEFAULT '1', "setupComplete" boolean NOT NULL DEFAULT false, "adminUserId" uuid, "orgId" uuid, "completedAt" TIMESTAMP WITH TIME ZONE, CONSTRAINT "CHK_68269e0005125b50dd2c83c29e" CHECK ("id" = 1), CONSTRAINT "PK_b4cd89db31d64ea8cdc30325169" PRIMARY KEY ("id"))`);
        await queryRunner.query(`CREATE TABLE "saml_configs" ("orgId" uuid NOT NULL, "providerId" text NOT NULL, "displayName" text NOT NULL, "enabled" boolean NOT NULL DEFAULT false, "idpEntityId" text NOT NULL, "idpSsoUrl" text NOT NULL, "idpSloUrl" text, "idpCertificate" text NOT NULL, "spEntityId" text NOT NULL, "attributeMapping" jsonb NOT NULL DEFAULT '{}', "autoProvision" boolean NOT NULL DEFAULT false, "defaultRole" text NOT NULL DEFAULT 'user', "iconUrl" text, "createdAt" TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(), "updatedAt" TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(), CONSTRAINT "PK_be082383a037ddfa1a768db55cc" PRIMARY KEY ("orgId"))`);
        await queryRunner.query(`ALTER TABLE "skill_versions" ADD CONSTRAINT "FK_6fcd86af4bbbafb69699581daa7" FOREIGN KEY ("skillId") REFERENCES "skills"("id") ON DELETE CASCADE ON UPDATE NO ACTION`);
        await queryRunner.query(`ALTER TABLE "skill_diagrams" ADD CONSTRAINT "FK_5462af1782189aedc330b3d0401" FOREIGN KEY ("skillId") REFERENCES "skills"("id") ON DELETE CASCADE ON UPDATE NO ACTION`);
        await queryRunner.query(`ALTER TABLE "session_messages" ADD CONSTRAINT "FK_7a0e88355eb527cb18578a6cb60" FOREIGN KEY ("skillId") REFERENCES "skills"("id") ON DELETE CASCADE ON UPDATE NO ACTION`);
        await queryRunner.query(`ALTER TABLE "eval_cases" ADD CONSTRAINT "FK_db1d82b624b32d107a25dc73188" FOREIGN KEY ("skillId") REFERENCES "skills"("id") ON DELETE CASCADE ON UPDATE NO ACTION`);
        await queryRunner.query(`ALTER TABLE "eval_runs" ADD CONSTRAINT "FK_ee2e3278f2bc4534b8b65530f02" FOREIGN KEY ("evalId") REFERENCES "eval_cases"("id") ON DELETE CASCADE ON UPDATE NO ACTION`);
        await queryRunner.query(`ALTER TABLE "eval_runs" ADD CONSTRAINT "FK_222dd64cf782ff2e6b0be33fa28" FOREIGN KEY ("skillId") REFERENCES "skills"("id") ON DELETE CASCADE ON UPDATE NO ACTION`);
        await queryRunner.query(`ALTER TABLE "eval_feedback" ADD CONSTRAINT "FK_2666624f8e3f2939a24bb103900" FOREIGN KEY ("runId") REFERENCES "eval_runs"("id") ON DELETE CASCADE ON UPDATE NO ACTION`);
        await queryRunner.query(`ALTER TABLE "eval_feedback" ADD CONSTRAINT "FK_de77b85ab807e82e44f285c7393" FOREIGN KEY ("skillId") REFERENCES "skills"("id") ON DELETE CASCADE ON UPDATE NO ACTION`);
        await queryRunner.query(`ALTER TABLE "eval_benchmarks" ADD CONSTRAINT "FK_215752c70ae38b9b4f14e3b915e" FOREIGN KEY ("skillId") REFERENCES "skills"("id") ON DELETE CASCADE ON UPDATE NO ACTION`);
        await queryRunner.query(`ALTER TABLE "users" ADD CONSTRAINT "FK_1890588e47e133fd85670f187d6" FOREIGN KEY ("orgId") REFERENCES "organizations"("id") ON DELETE NO ACTION ON UPDATE NO ACTION`);
        await queryRunner.query(`ALTER TABLE "user_credentials" ADD CONSTRAINT "FK_07e09814aad35a2da5ef5a73e14" FOREIGN KEY ("userId") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE NO ACTION`);
        await queryRunner.query(`ALTER TABLE "refresh_tokens" ADD CONSTRAINT "FK_610102b60fea1455310ccd299de" FOREIGN KEY ("userId") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE NO ACTION`);
        await queryRunner.query(`ALTER TABLE "sso_links" ADD CONSTRAINT "FK_3d56880c245f19882b6afab6f1d" FOREIGN KEY ("userId") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE NO ACTION`);
        await queryRunner.query(`ALTER TABLE "saml_configs" ADD CONSTRAINT "FK_be082383a037ddfa1a768db55cc" FOREIGN KEY ("orgId") REFERENCES "organizations"("id") ON DELETE CASCADE ON UPDATE NO ACTION`);
    }

    public async down(queryRunner: QueryRunner): Promise<void> {
        await queryRunner.query(`ALTER TABLE "saml_configs" DROP CONSTRAINT "FK_be082383a037ddfa1a768db55cc"`);
        await queryRunner.query(`ALTER TABLE "sso_links" DROP CONSTRAINT "FK_3d56880c245f19882b6afab6f1d"`);
        await queryRunner.query(`ALTER TABLE "refresh_tokens" DROP CONSTRAINT "FK_610102b60fea1455310ccd299de"`);
        await queryRunner.query(`ALTER TABLE "user_credentials" DROP CONSTRAINT "FK_07e09814aad35a2da5ef5a73e14"`);
        await queryRunner.query(`ALTER TABLE "users" DROP CONSTRAINT "FK_1890588e47e133fd85670f187d6"`);
        await queryRunner.query(`ALTER TABLE "eval_benchmarks" DROP CONSTRAINT "FK_215752c70ae38b9b4f14e3b915e"`);
        await queryRunner.query(`ALTER TABLE "eval_feedback" DROP CONSTRAINT "FK_de77b85ab807e82e44f285c7393"`);
        await queryRunner.query(`ALTER TABLE "eval_feedback" DROP CONSTRAINT "FK_2666624f8e3f2939a24bb103900"`);
        await queryRunner.query(`ALTER TABLE "eval_runs" DROP CONSTRAINT "FK_222dd64cf782ff2e6b0be33fa28"`);
        await queryRunner.query(`ALTER TABLE "eval_runs" DROP CONSTRAINT "FK_ee2e3278f2bc4534b8b65530f02"`);
        await queryRunner.query(`ALTER TABLE "eval_cases" DROP CONSTRAINT "FK_db1d82b624b32d107a25dc73188"`);
        await queryRunner.query(`ALTER TABLE "session_messages" DROP CONSTRAINT "FK_7a0e88355eb527cb18578a6cb60"`);
        await queryRunner.query(`ALTER TABLE "skill_diagrams" DROP CONSTRAINT "FK_5462af1782189aedc330b3d0401"`);
        await queryRunner.query(`ALTER TABLE "skill_versions" DROP CONSTRAINT "FK_6fcd86af4bbbafb69699581daa7"`);
        await queryRunner.query(`DROP TABLE "saml_configs"`);
        await queryRunner.query(`DROP TABLE "setup_state"`);
        await queryRunner.query(`DROP INDEX "public"."idx_sso_links_provider"`);
        await queryRunner.query(`DROP TABLE "sso_links"`);
        await queryRunner.query(`DROP INDEX "public"."idx_refresh_tokens_user"`);
        await queryRunner.query(`DROP TABLE "refresh_tokens"`);
        await queryRunner.query(`DROP TABLE "user_credentials"`);
        await queryRunner.query(`DROP TABLE "users"`);
        await queryRunner.query(`DROP TABLE "organizations"`);
        await queryRunner.query(`DROP TABLE "eval_benchmarks"`);
        await queryRunner.query(`DROP INDEX "public"."idx_eval_feedback_skill"`);
        await queryRunner.query(`DROP INDEX "public"."idx_eval_feedback_run"`);
        await queryRunner.query(`DROP TABLE "eval_feedback"`);
        await queryRunner.query(`DROP INDEX "public"."idx_eval_runs_skill"`);
        await queryRunner.query(`DROP INDEX "public"."idx_eval_runs_eval"`);
        await queryRunner.query(`DROP TABLE "eval_runs"`);
        await queryRunner.query(`DROP INDEX "public"."idx_eval_cases_skill"`);
        await queryRunner.query(`DROP TABLE "eval_cases"`);
        await queryRunner.query(`DROP TABLE "session_messages"`);
        await queryRunner.query(`DROP INDEX "public"."idx_skills_owner"`);
        await queryRunner.query(`DROP TABLE "skills"`);
        await queryRunner.query(`DROP TABLE "skill_diagrams"`);
        await queryRunner.query(`DROP TABLE "skill_versions"`);
    }

}
