/**
 * TypeORM DataSource configuration for CLI commands (migrations).
 *
 * Usage:
 *   npm run migration:generate -- -n <MigrationName>
 *   npm run migration:run
 *   npm run migration:revert
 *
 * Environment variables:
 *   POSTGRES_HOST, POSTGRES_PORT, POSTGRES_DB,
 *   POSTGRES_USER, POSTGRES_PASSWORD, POSTGRES_SSL
 */
import 'dotenv/config';
import { DataSource } from 'typeorm';

import { SkillEntity } from './entities/skill.entity';
import { SkillVersionEntity } from './entities/skill-version.entity';
import { SkillDiagramEntity } from './entities/skill-diagram.entity';
import { SessionMessageEntity } from './entities/session-message.entity';
import { EvalCaseEntity } from './entities/eval-case.entity';
import { EvalRunEntity } from './entities/eval-run.entity';
import { EvalFeedbackEntity } from './entities/eval-feedback.entity';
import { EvalBenchmarkEntity } from './entities/eval-benchmark.entity';
import { OrganizationEntity } from './entities/organization.entity';
import { UserEntity } from './entities/user.entity';
import { UserCredentialEntity } from './entities/user-credential.entity';
import { RefreshTokenEntity } from './entities/refresh-token.entity';
import { SsoLinkEntity } from './entities/sso-link.entity';
import { SetupStateEntity } from './entities/setup-state.entity';
import { SamlConfigEntity } from './entities/saml-config.entity';
import { OidcConfigEntity } from './entities/oidc-config.entity';
import { SmtpConfigEntity } from './entities/smtp-config.entity';
import { InviteTokenEntity } from './entities/invite-token.entity';
import { PersonalAccessTokenEntity } from './entities/personal-access-token.entity';
import { MarketplaceSubmissionEntity } from './entities/marketplace-submission.entity';
import { MarketplaceListingEntity } from './entities/marketplace-listing.entity';
import { CategoryEntity } from './entities/category.entity';
import { SkillCategoryEntity } from './entities/skill-category.entity';
import { SkillDownloadEventEntity } from './entities/skill-download-event.entity';

const entities = [
  SkillEntity, SkillVersionEntity, SkillDiagramEntity,
  SessionMessageEntity,
  EvalCaseEntity, EvalRunEntity, EvalFeedbackEntity, EvalBenchmarkEntity,
  OrganizationEntity, UserEntity, UserCredentialEntity,
  RefreshTokenEntity, SsoLinkEntity, SetupStateEntity, SamlConfigEntity, OidcConfigEntity,
  SmtpConfigEntity, InviteTokenEntity, PersonalAccessTokenEntity,
  MarketplaceSubmissionEntity,
  MarketplaceListingEntity,
  CategoryEntity,
  SkillCategoryEntity,
  SkillDownloadEventEntity,
];

export default new DataSource({
  type: 'postgres',
  host: process.env.POSTGRES_HOST ?? 'localhost',
  port: Number(process.env.POSTGRES_PORT ?? 5432),
  database: process.env.POSTGRES_DB ?? 'skillspell',
  username: process.env.POSTGRES_USER ?? 'skillspell',
  password: process.env.POSTGRES_PASSWORD ?? 'skillspell_dev',
  ssl: process.env.POSTGRES_SSL === 'true',
  entities,
  migrations: ['src/migrations/*.ts'],
  migrationsTransactionMode: 'each',
  synchronize: false,
});
