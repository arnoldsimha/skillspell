import { MigrationInterface, QueryRunner } from 'typeorm';

/**
 * Drop deprecated `conversation` (jsonb) and `sessionId` (text) columns
 * from the `skills` table.
 *
 * Conversation history was migrated to the `session_messages` table
 * (managed by SessionService). The `sessionId` field stored the legacy
 * Anthropic Agent SDK session identifier, which is no longer used —
 * sessions are now identified by `skillId` within the session_messages table.
 *
 * Both columns have been dead code since the SessionService migration
 * and were never written to by the current application.
 */
export class DropConversationAndSessionId1776000000000 implements MigrationInterface {
  name = 'DropConversationAndSessionId1776000000000';

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`ALTER TABLE "skills" DROP COLUMN IF EXISTS "conversation"`);
    await queryRunner.query(`ALTER TABLE "skills" DROP COLUMN IF EXISTS "sessionId"`);
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`ALTER TABLE "skills" ADD COLUMN "sessionId" text`);
    await queryRunner.query(`ALTER TABLE "skills" ADD COLUMN "conversation" jsonb NOT NULL DEFAULT '[]'`);
  }
}
