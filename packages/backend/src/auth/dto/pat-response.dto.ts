import { Expose, Exclude } from 'class-transformer';

/**
 * PAT list item response — excludes tokenHash and rawToken.
 * Used for GET /api/auth/tokens.
 */
@Exclude()
export class PatListItemDto {
  @Expose()
  id!: string;

  @Expose()
  userId!: string;

  @Expose()
  name!: string;

  @Expose()
  prefix!: string;

  @Expose()
  expiresAt!: string;

  @Expose()
  revokedAt!: string | null;

  @Expose()
  lastUsedAt!: string | null;

  @Expose()
  createdAt!: string;
}

/**
 * Create PAT response — includes rawToken (returned once only) but excludes tokenHash.
 * Used for POST /api/auth/tokens.
 *
 * Raw token visible once at creation; hash never returned to clients.
 */
@Exclude()
export class CreatePatResponseDto extends PatListItemDto {
  /** Raw token — returned exactly once. Store it now; it cannot be retrieved again. */
  @Expose()
  rawToken!: string;
}
