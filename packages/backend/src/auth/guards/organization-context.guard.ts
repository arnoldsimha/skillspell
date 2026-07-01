import {
  CanActivate,
  ExecutionContext,
  Injectable,
  Logger,
} from '@nestjs/common';
import { ClsService } from 'nestjs-cls';
import { OrganizationService } from '../../organization/organization.service.js';

/**
 * Global guard that fetches and stores the authenticated user's organization in CLS.
 *
 * Applied globally via APP_GUARD after JwtAuthGuard and ClsGuard.
 * - If user is authenticated (request.user exists), fetch their org via user.orgId
 * - Store the organization in CLS with key 'org' for downstream guards/services
 * - If fetch fails or org not found, log but allow request through (org will be undefined)
 *
 * MarketplaceGuard reads org from CLS — this guard ensures it's available.
 *
 * Must run AFTER ClsGuard so that user is already in the context.
 */
@Injectable()
export class OrganizationContextGuard implements CanActivate {
  private readonly logger = new Logger(OrganizationContextGuard.name);

  constructor(
    private readonly cls: ClsService,
    private readonly orgService: OrganizationService,
  ) {}

  async canActivate(context: ExecutionContext): Promise<boolean> {
    const request = context.switchToHttp().getRequest();

    // Only attempt to fetch org if user is authenticated
    if (!request.user) {
      return true;
    }

    try {
      // User.orgId is populated after auth — fetch the organization
      const orgId = request.user.orgId;
      if (!orgId) {
        this.logger.warn(
          `User ${request.user.id} has no orgId — organization context will be unavailable`,
        );
        return true;
      }

      const org = await this.orgService.getOrganizationById(orgId);
      try {
        this.cls.set('org', org);
      } catch (clsError) {
        this.logger.error(
          `Failed to set organization in CLS for orgId ${orgId}: ${clsError instanceof Error ? clsError.message : String(clsError)}`,
        );
      }
    } catch (error) {
      this.logger.error(
        `Failed to fetch organization for user ${request.user?.id}: ${error instanceof Error ? error.message : String(error)}`,
      );
      // Allow request through even if org fetch fails — services should handle missing org gracefully
    }

    return true;
  }
}
