import { SetMetadata } from '@nestjs/common';

/**
 * Metadata key for the @Public() decorator.
 * Routes decorated with @Public() skip JWT authentication.
 */
export const IS_PUBLIC_KEY = 'isPublic';

/**
 * Mark a route as public — skips the global JwtAuthGuard.
 *
 * Usage:
 * ```typescript
 * @Public()
 * @Post('login')
 * async login(@Body() dto: LoginDto) { ... }
 * ```
 */
export const Public = () => SetMetadata(IS_PUBLIC_KEY, true);
