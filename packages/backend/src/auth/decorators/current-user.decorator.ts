import { createParamDecorator, ExecutionContext } from '@nestjs/common';
import type { User } from '@skillspell/shared';

/**
 * Extract the authenticated user from the request.
 *
 * The JWT strategy attaches the user object to `request.user` after
 * validating the JWT token. This decorator provides convenient access.
 *
 * Usage:
 * ```typescript
 * @Get('me')
 * async getProfile(@CurrentUser() user: User) {
 *   return user;
 * }
 *
 * // Or extract a specific property:
 * @Get('my-skills')
 * async getMySkills(@CurrentUser('id') userId: string) { ... }
 * ```
 */
export const CurrentUser = createParamDecorator(
  (data: keyof User | undefined, ctx: ExecutionContext) => {
    const request = ctx.switchToHttp().getRequest();
    const user = request.user as User | undefined;

    if (!user) return undefined;
    return data ? user[data] : user;
  },
);
