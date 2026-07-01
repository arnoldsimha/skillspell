import { IsUUID } from 'class-validator';

/**
 * DTO for POST /api/auth/cli/refresh.
 * Validates userId as UUID v4 before any DB lookup.
 */
export class CliRefreshDto {
  @IsUUID('4', { message: 'userId must be a valid UUID v4' })
  userId!: string;
}
