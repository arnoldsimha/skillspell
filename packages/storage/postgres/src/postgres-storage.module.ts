import { DynamicModule, Module, Provider } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import {
  POSTGRES_STORAGE_OPTIONS,
  type PostgresStorageOptions,
} from './config/postgres-storage.options';

// All entities
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
import { SkillUpvoteEntity } from './entities/skill-upvote.entity';
import { SkillFavoriteEntity } from './entities/skill-favorite.entity';
import { MarketplaceRemovalRequestEntity } from './entities/marketplace-removal-request.entity';

// All repository implementations
import { PostgresSkillRepository } from './repositories/skill.repository';
import { PostgresEvalRepository } from './repositories/eval.repository';
import { PostgresSessionRepository } from './repositories/session.repository';
import { PostgresUserRepository } from './repositories/user.repository';
import { PostgresCredentialRepository } from './repositories/credential.repository';
import { PostgresAuthTokenRepository } from './repositories/auth-token.repository';
import { PostgresOrganizationRepository } from './repositories/organization.repository';
import { PostgresSamlConfigRepository } from './repositories/saml-config.repository';
import { PostgresOidcConfigRepository } from './repositories/oidc-config.repository';
import { PostgresSmtpConfigRepository } from './repositories/smtp-config.repository';
import { PostgresInviteTokenRepository } from './repositories/invite-token.repository';
import { PostgresPersonalAccessTokenRepository } from './repositories/personal-access-token.repository';
import { PostgresMarketplaceSubmissionRepository } from './repositories/marketplace-submission.repository';
import { PostgresMarketplaceListingRepository } from './repositories/marketplace-listing.repository';
import { PostgresCategoryRepository } from './repositories/category.repository';
import { PostgresSkillCategoryRepository } from './repositories/skill-category.repository';
import { PostgresSkillDownloadEventRepository } from './repositories/skill-download-event.repository';
import { PostgresAdminAnalyticsRepository } from './repositories/admin-analytics.repository';
import { PostgresSkillUpvoteRepository } from './repositories/skill-upvote.repository';
import { PostgresSkillFavoriteRepository } from './repositories/skill-favorite.repository';
import { PostgresMarketplaceRemovalRequestRepository } from './repositories/marketplace-removal-request.repository';

// Shared tokens
import {
  SKILL_REPOSITORY, EVAL_REPOSITORY, SESSION_REPOSITORY,
  USER_REPOSITORY, CREDENTIAL_REPOSITORY, AUTH_TOKEN_REPOSITORY,
  ORGANIZATION_REPOSITORY, SAML_CONFIG_REPOSITORY, OIDC_CONFIG_REPOSITORY, SMTP_CONFIG_REPOSITORY,
  INVITE_TOKEN_REPOSITORY, PAT_REPOSITORY,
  MARKETPLACE_SUBMISSION_REPOSITORY, MARKETPLACE_LISTING_REPOSITORY,
  CATEGORY_REPOSITORY,
  SKILL_CATEGORY_REPOSITORY,
  SKILL_DOWNLOAD_EVENT_REPOSITORY,
  ADMIN_ANALYTICS_REPOSITORY,
  SKILL_UPVOTE_REPOSITORY,
  SKILL_FAVORITE_REPOSITORY,
  MARKETPLACE_REMOVAL_REQUEST_REPOSITORY,
} from '@skillspell/shared';

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
  SkillUpvoteEntity,
  SkillFavoriteEntity,
  MarketplaceRemovalRequestEntity,
];

/** Async options interface — allows the caller to inject ConfigService. */
export interface PostgresStorageAsyncOptions {
  imports?: any[];
  inject?: any[];
  useFactory: (...args: any[]) => PostgresStorageOptions | Promise<PostgresStorageOptions>;
}

const repositoryProviders: Provider[] = [
  { provide: SKILL_REPOSITORY, useClass: PostgresSkillRepository },
  { provide: EVAL_REPOSITORY, useClass: PostgresEvalRepository },
  { provide: SESSION_REPOSITORY, useClass: PostgresSessionRepository },
  { provide: USER_REPOSITORY, useClass: PostgresUserRepository },
  { provide: CREDENTIAL_REPOSITORY, useClass: PostgresCredentialRepository },
  { provide: AUTH_TOKEN_REPOSITORY, useClass: PostgresAuthTokenRepository },
  { provide: ORGANIZATION_REPOSITORY, useClass: PostgresOrganizationRepository },
  { provide: SAML_CONFIG_REPOSITORY, useClass: PostgresSamlConfigRepository },
  { provide: OIDC_CONFIG_REPOSITORY, useClass: PostgresOidcConfigRepository },
  { provide: SMTP_CONFIG_REPOSITORY, useClass: PostgresSmtpConfigRepository },
  { provide: INVITE_TOKEN_REPOSITORY, useClass: PostgresInviteTokenRepository },
  { provide: PAT_REPOSITORY, useClass: PostgresPersonalAccessTokenRepository },
  { provide: MARKETPLACE_SUBMISSION_REPOSITORY, useClass: PostgresMarketplaceSubmissionRepository },
  { provide: MARKETPLACE_LISTING_REPOSITORY, useClass: PostgresMarketplaceListingRepository },
  { provide: CATEGORY_REPOSITORY, useClass: PostgresCategoryRepository },
  { provide: SKILL_CATEGORY_REPOSITORY, useClass: PostgresSkillCategoryRepository },
  { provide: SKILL_DOWNLOAD_EVENT_REPOSITORY, useClass: PostgresSkillDownloadEventRepository },
  { provide: ADMIN_ANALYTICS_REPOSITORY, useClass: PostgresAdminAnalyticsRepository },
  { provide: SKILL_UPVOTE_REPOSITORY, useClass: PostgresSkillUpvoteRepository },
  { provide: SKILL_FAVORITE_REPOSITORY, useClass: PostgresSkillFavoriteRepository },
  { provide: MARKETPLACE_REMOVAL_REQUEST_REPOSITORY, useClass: PostgresMarketplaceRemovalRequestRepository },
];

const repositoryExports = [
  SKILL_REPOSITORY, EVAL_REPOSITORY, SESSION_REPOSITORY,
  USER_REPOSITORY, CREDENTIAL_REPOSITORY, AUTH_TOKEN_REPOSITORY,
  ORGANIZATION_REPOSITORY, SAML_CONFIG_REPOSITORY, OIDC_CONFIG_REPOSITORY, SMTP_CONFIG_REPOSITORY,
  INVITE_TOKEN_REPOSITORY, PAT_REPOSITORY,
  MARKETPLACE_SUBMISSION_REPOSITORY, MARKETPLACE_LISTING_REPOSITORY,
  CATEGORY_REPOSITORY,
  SKILL_CATEGORY_REPOSITORY,
  SKILL_DOWNLOAD_EVENT_REPOSITORY,
  ADMIN_ANALYTICS_REPOSITORY,
  SKILL_UPVOTE_REPOSITORY,
  SKILL_FAVORITE_REPOSITORY,
  MARKETPLACE_REMOVAL_REQUEST_REPOSITORY,
];

/**
 * Internal helper module that provides the POSTGRES_STORAGE_OPTIONS token.
 *
 * By isolating the options provider in its own module, both
 * PostgresStorageModule and TypeOrmCoreModule (via forRootAsync imports)
 * can import it — ensuring the token is resolvable in every injector scope
 * and the factory only runs once.
 *
 * This follows the same pattern used by @nestjs/jwt, @nestjs/passport, etc.
 */
@Module({})
class PostgresOptionsModule {
  static forRoot(options: PostgresStorageOptions): DynamicModule {
    return {
      module: PostgresOptionsModule,
      providers: [
        { provide: POSTGRES_STORAGE_OPTIONS, useValue: options },
      ],
      exports: [POSTGRES_STORAGE_OPTIONS],
    };
  }

  static forRootAsync(options: PostgresStorageAsyncOptions): DynamicModule {
    return {
      module: PostgresOptionsModule,
      imports: options.imports ?? [],
      providers: [
        {
          provide: POSTGRES_STORAGE_OPTIONS,
          useFactory: options.useFactory,
          inject: options.inject ?? [],
        },
      ],
      exports: [POSTGRES_STORAGE_OPTIONS],
    };
  }
}

@Module({})
export class PostgresStorageModule {
  /** Synchronous configuration — for tests or simple setups. */
  static forRoot(options: PostgresStorageOptions): DynamicModule {
    const optionsModule = PostgresOptionsModule.forRoot(options);

    return {
      module: PostgresStorageModule,
      global: true,
      imports: [
        optionsModule,
        TypeOrmModule.forRoot({
          type: 'postgres',
          host: options.host,
          port: options.port,
          database: options.database,
          username: options.username,
          password: options.password,
          ssl: options.ssl ?? false,
          extra: {
            max: options.poolSize ?? 25,
            min: 2,
            idleTimeoutMillis: 30_000,
            statement_timeout: 30_000,
          },
          entities,
          synchronize: options.synchronize ?? false,
        }),
        TypeOrmModule.forFeature(entities),
      ],
      providers: repositoryProviders,
      exports: repositoryExports,
    };
  }

  /** Async configuration — inject ConfigService or other providers. */
  static forRootAsync(options: PostgresStorageAsyncOptions): DynamicModule {
    const optionsModule = PostgresOptionsModule.forRootAsync(options);

    return {
      module: PostgresStorageModule,
      global: true,
      imports: [
        optionsModule,
        TypeOrmModule.forRootAsync({
          imports: [optionsModule],
          inject: [POSTGRES_STORAGE_OPTIONS],
          useFactory: (opts: PostgresStorageOptions) => ({
            type: 'postgres' as const,
            host: opts.host,
            port: opts.port,
            database: opts.database,
            username: opts.username,
            password: opts.password,
            ssl: opts.ssl ?? false,
            extra: {
              max: opts.poolSize ?? 25,
              min: 2,
              idleTimeoutMillis: 30_000,
              statement_timeout: 30_000,
            },
            entities,
            synchronize: opts.synchronize ?? false,
          }),
        }),
        TypeOrmModule.forFeature(entities),
      ],
      providers: repositoryProviders,
      exports: repositoryExports,
    };
  }
}
