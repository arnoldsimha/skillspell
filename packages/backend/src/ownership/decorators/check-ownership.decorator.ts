import { SetMetadata } from '@nestjs/common';

/**
 * Metadata key used by SkillOwnerGuard to look up the route-param name
 * that contains the skill ID.
 */
export const CHECK_OWNERSHIP_KEY = 'checkOwnership';

/**
 * Decorator that marks a route (or controller) as requiring skill-ownership
 * verification.
 *
 * @param paramName — name of the route parameter that holds the skill ID
 *                    (e.g. `'id'` or `'skillId'`).
 *
 * Usage:
 * ```ts
 * @CheckOwnership('id')
 * @Put(':id')
 * async update(@Param('id') id: string) { ... }
 * ```
 *
 * Can also be applied at the controller level when **every** route in the
 * controller uses the same param:
 * ```ts
 * @CheckOwnership('skillId')
 * @Controller('skills/:skillId/evals')
 * export class EvalController { ... }
 * ```
 */
export const CheckOwnership = (paramName: string) =>
  SetMetadata(CHECK_OWNERSHIP_KEY, paramName);
