import { SetMetadata } from '@nestjs/common';

/**
 * Metadata key for the @SetupRoute() decorator.
 * Routes decorated with @SetupRoute() are always accessible
 * regardless of whether initial setup has been completed.
 */
export const IS_SETUP_ROUTE_KEY = 'isSetupRoute';

/**
 * Mark a route as part of the setup flow — bypasses the global SetupGuard.
 *
 * Use this on endpoints that must be accessible before initial setup
 * is complete (e.g. setup-status check, the setup endpoint itself).
 *
 * Usage:
 * ```typescript
 * @SetupRoute()
 * @Public()
 * @Get('setup-status')
 * async getSetupStatus() { ... }
 * ```
 */
export const SetupRoute = () => SetMetadata(IS_SETUP_ROUTE_KEY, true);
