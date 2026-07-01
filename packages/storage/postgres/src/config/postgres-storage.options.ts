/**
 * Configuration options for the PostgreSQL storage module.
 *
 * Consumers provide these values via `PostgresStorageModule.forRoot()` or
 * `PostgresStorageModule.forRootAsync()`.
 */
export interface PostgresStorageOptions {
  host: string;
  port: number;
  database: string;
  username: string;
  password: string;
  ssl?: boolean | { rejectUnauthorized: boolean; ca?: string };
  poolSize?: number;
  /** NEVER set to true in production — auto-syncs schema from entities. */
  synchronize?: boolean;
}

export const POSTGRES_STORAGE_OPTIONS = Symbol('POSTGRES_STORAGE_OPTIONS');
