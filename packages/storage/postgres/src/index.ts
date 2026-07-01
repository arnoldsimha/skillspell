// Module
export { PostgresStorageModule } from './postgres-storage.module';
export type { PostgresStorageAsyncOptions } from './postgres-storage.module';

// Options
export {
  POSTGRES_STORAGE_OPTIONS,
  type PostgresStorageOptions,
} from './config/postgres-storage.options';

// Entities (exported for migration scripts and advanced use cases)
export {
  SkillEntity,
  SkillVersionEntity,
  SkillDiagramEntity,
  SessionMessageEntity,
  EvalCaseEntity,
  EvalRunEntity,
  EvalFeedbackEntity,
  EvalBenchmarkEntity,
  OrganizationEntity,
  UserEntity,
  UserCredentialEntity,
  RefreshTokenEntity,
  SsoLinkEntity,
  SetupStateEntity,
  SamlConfigEntity,
} from './entities/index';

// Repository implementations (exported for type reference — consumers inject via tokens)
export { PostgresSkillRepository } from './repositories/skill.repository';
export { PostgresEvalRepository } from './repositories/eval.repository';
export { PostgresSessionRepository } from './repositories/session.repository';
export { PostgresUserRepository } from './repositories/user.repository';
export { PostgresCredentialRepository } from './repositories/credential.repository';
export { PostgresAuthTokenRepository } from './repositories/auth-token.repository';
export { PostgresOrganizationRepository } from './repositories/organization.repository';
export { PostgresSamlConfigRepository } from './repositories/saml-config.repository';
