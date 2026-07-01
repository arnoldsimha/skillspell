/**
 * Dev seed script — populates a demo skill with eval cases for local development.
 *
 * Idempotent: if the demo skill already exists, exits cleanly with a message.
 *
 * Prerequisites:
 *   - Postgres is running and schema migrations have been applied
 *   - First-run setup has been completed (an owner-role user must exist)
 *
 * Usage:
 *   npx ts-node --project packages/storage/postgres/tsconfig.json scripts/seed-dev.ts
 */

import * as dotenv from 'dotenv';
import * as path from 'path';

// Load .env from packages/backend/.env (the canonical env file)
dotenv.config({ path: path.resolve(__dirname, '../packages/backend/.env') });

import { DataSource } from 'typeorm';
import { v4 as uuidv4 } from 'uuid';

import { SkillEntity } from '../packages/storage/postgres/src/entities/skill.entity';
import { SkillVersionEntity } from '../packages/storage/postgres/src/entities/skill-version.entity';
import { SkillDiagramEntity } from '../packages/storage/postgres/src/entities/skill-diagram.entity';
import { SessionMessageEntity } from '../packages/storage/postgres/src/entities/session-message.entity';
import { EvalCaseEntity } from '../packages/storage/postgres/src/entities/eval-case.entity';
import { EvalRunEntity } from '../packages/storage/postgres/src/entities/eval-run.entity';
import { EvalFeedbackEntity } from '../packages/storage/postgres/src/entities/eval-feedback.entity';
import { EvalBenchmarkEntity } from '../packages/storage/postgres/src/entities/eval-benchmark.entity';
import { OrganizationEntity } from '../packages/storage/postgres/src/entities/organization.entity';
import { UserEntity } from '../packages/storage/postgres/src/entities/user.entity';
import { UserCredentialEntity } from '../packages/storage/postgres/src/entities/user-credential.entity';
import { RefreshTokenEntity } from '../packages/storage/postgres/src/entities/refresh-token.entity';
import { SsoLinkEntity } from '../packages/storage/postgres/src/entities/sso-link.entity';
import { SetupStateEntity } from '../packages/storage/postgres/src/entities/setup-state.entity';
import { SamlConfigEntity } from '../packages/storage/postgres/src/entities/saml-config.entity';
import { SmtpConfigEntity } from '../packages/storage/postgres/src/entities/smtp-config.entity';
import { InviteTokenEntity } from '../packages/storage/postgres/src/entities/invite-token.entity';

// ─── Demo skill content ──────────────────────────────────────────────────────

const DEMO_SKILL_NAME = 'Write clear Git commit messages';

const DEMO_SKILL_CONTENT = `# Write Clear Git Commit Messages

Write Git commit messages that follow the Conventional Commits specification and are easy to read in \`git log\`.

## Rules

- Subject line ≤ 72 characters
- Use imperative mood: "Add feature" not "Added feature" or "Adding feature"
- Format: \`<type>(<scope>): <description>\` where type is one of: feat, fix, docs, style, refactor, test, chore
- Separate subject from body with a blank line
- Body explains the *why*, not the *what*
- Reference issue numbers when relevant: \`Closes #123\`

## Examples

Good:
\`\`\`
feat(auth): add refresh token rotation

Rotate refresh tokens on each use to limit the blast radius of a stolen token.
Closes #42
\`\`\`

Bad:
\`\`\`
fixed stuff
updated the login thing to work better with tokens
\`\`\``;

// ─── DataSource ──────────────────────────────────────────────────────────────

const AppDataSource = new DataSource({
  type: 'postgres',
  host: process.env.POSTGRES_HOST ?? 'localhost',
  port: Number(process.env.POSTGRES_PORT ?? 5432),
  database: process.env.POSTGRES_DB ?? 'skillspell',
  username: process.env.POSTGRES_USER ?? 'skillspell',
  password: process.env.POSTGRES_PASSWORD ?? 'skillspell_dev',
  ssl: process.env.POSTGRES_SSL === 'true',
  entities: [
    SkillEntity,
    SkillVersionEntity,
    EvalCaseEntity,
    OrganizationEntity,
    UserEntity,
    UserCredentialEntity,
    RefreshTokenEntity,
    SetupStateEntity,
    SamlConfigEntity,
    SmtpConfigEntity,
    InviteTokenEntity,
    SkillDiagramEntity,
    SessionMessageEntity,
    EvalRunEntity,
    EvalFeedbackEntity,
    EvalBenchmarkEntity,
    SsoLinkEntity,
  ],
});

// ─── Main ────────────────────────────────────────────────────────────────────

async function main(): Promise<void> {
  let initialized = false;
  try {
    await AppDataSource.initialize();
    initialized = true;
    // ── Idempotency check ─────────────────────────────────────────────────
    const skillRepo = AppDataSource.getRepository(SkillEntity);
    const existing = await skillRepo.findOne({ where: { name: DEMO_SKILL_NAME } });

    if (existing) {
      console.log('Seed data already exists — skipping.');
      console.log(`  Skill: "${existing.name}" (id: ${existing.id})`);
      return;
    }

    // ── Find owner user ────────────────────────────────────────────────────
    const userRepo = AppDataSource.getRepository(UserEntity);
    const owner = await userRepo.findOne({
      where: { role: 'owner' },
      order: { createdAt: 'ASC' },
    });

    if (!owner) {
      console.error(
        'Error: No owner-role user found in the database.\n' +
        'Please complete the first-run setup (create your admin account) before running this script.\n' +
        'Navigate to the app URL and follow the setup wizard.',
      );
      process.exit(1);
    }

    // ── Seed inside a transaction ──────────────────────────────────────────
    const skillId = uuidv4();

    await AppDataSource.transaction(async (manager) => {
      // 1. Create skill
      const skill = manager.create(SkillEntity, {
        id: skillId,
        ownerId: owner.id,
        name: DEMO_SKILL_NAME,
        description:
          'Guides Claude to produce concise, conventional Git commit messages with a subject line \u226472 chars, imperative mood, and optional body explaining the \u201cwhy\u201d.',
        status: 'ready',
        skillContent: DEMO_SKILL_CONTENT,
        scripts: [],
        references: [],
        assets: [],
        version: 1,
      });
      await manager.save(SkillEntity, skill);

      // 2. Create skill version snapshot (version 1)
      const skillVersion = manager.create(SkillVersionEntity, {
        skillId,
        version: 1,
        description: skill.description,
        skillContent: DEMO_SKILL_CONTENT,
        scripts: [],
        references: [],
        assets: [],
        explanation: null,
      });
      await manager.save(SkillVersionEntity, skillVersion);

      // 3. Create eval cases
      const evalCases = [
        {
          id: uuidv4(),
          skillId,
          name: 'Simple feature addition',
          prompt: 'Write a commit message for: added user profile avatar upload support',
          expectedOutput: 'feat(profile): add avatar upload support',
          context: null,
          assertions: [],
          createdAtVersion: 1,
        },
        {
          id: uuidv4(),
          skillId,
          name: 'Bug fix with issue reference',
          prompt: 'Write a commit message for: fixed a null pointer crash when the user has no billing address set',
          expectedOutput:
            'fix(billing): handle null billing address on profile page\n\nPrevents NPE when user account was created before billing was required.\nCloses #87',
          context: null,
          assertions: [],
          createdAtVersion: 1,
        },
        {
          id: uuidv4(),
          skillId,
          name: 'Documentation update',
          prompt: 'Write a commit message for: updated the README setup instructions to include the new Docker Compose step',
          expectedOutput: 'docs: update README with Docker Compose setup step',
          context: null,
          assertions: [],
          createdAtVersion: 1,
        },
        {
          id: uuidv4(),
          skillId,
          name: 'Refactor \u2014 no behavior change',
          prompt: 'Write a commit message for: extracted the JWT validation logic from the auth controller into a separate service',
          expectedOutput: 'refactor(auth): extract JWT validation into AuthValidationService',
          context: null,
          assertions: [],
          createdAtVersion: 1,
        },
      ];

      for (const evalCaseData of evalCases) {
        const evalCase = manager.create(EvalCaseEntity, evalCaseData);
        await manager.save(EvalCaseEntity, evalCase);
      }
    });

    console.log('Seed complete!');
    console.log(`  Skill: "${DEMO_SKILL_NAME}" (id: ${skillId})`);
    console.log(`  Eval cases: 4`);
    console.log(`  Owner: ${owner.email}`);
    console.log('');
    console.log('Open the app and navigate to Skills to explore the demo data.');
  } finally {
    if (initialized) await AppDataSource.destroy();
  }
}

main().catch((err: unknown) => {
  console.error('Seed failed:', err);
  process.exit(1);
});
