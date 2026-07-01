import {
  CanActivate,
  ExecutionContext,
  ForbiddenException,
  Injectable,
} from '@nestjs/common';
import { ClsService } from 'nestjs-cls';
import type { Organization } from '@skillspell/shared';

/**
 * Marketplace feature gate guard.
 *
 * Applied to marketplace routes to enforce the organization-level `marketplaceEnabled` flag.
 *
 * - If org.marketplaceEnabled === true, allow access.
 * - If org.marketplaceEnabled === false, throw ForbiddenException.
 * - If org is null/undefined (development/unauth scenario), allow access.
 *
 * Relies on ClsService (nestjs-cls) to fetch org from request context.
 * Guard should be used with @UseGuards(MarketplaceGuard) on routes that need feature gating.
 */
@Injectable()
export class MarketplaceGuard implements CanActivate {
  constructor(private readonly cls: ClsService) {}

  canActivate(context: ExecutionContext): boolean {
    // Fetch organization from CLS (set in OrganizationContextGuard (runs after JwtAuthGuard))
    const org = this.cls.get<Organization | undefined>('org');

    // Allow access if org is null/undefined (development fallback or unauth)
    if (!org) {
      return true;
    }

    // Check marketplace enabled flag
    if (!org.marketplaceEnabled) {
      throw new ForbiddenException(
        'Marketplace is disabled for this organization',
      );
    }

    return true;
  }
}
