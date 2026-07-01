import { Controller, Get, Query } from '@nestjs/common';
import { Roles } from '../auth/decorators/roles.decorator.js';
import { CurrentUser } from '../auth/decorators/current-user.decorator.js';
import type { User } from '@skillspell/shared';
import { AdminAnalyticsService } from './admin-analytics.service.js';
import { AnalyticsQueryDto, type AnalyticsResponseDto } from './admin-analytics.dto.js';

@Controller('admin/analytics')
@Roles('admin')
export class AdminAnalyticsController {
  constructor(private readonly analyticsService: AdminAnalyticsService) {}

  @Get()
  async getAnalytics(
    @CurrentUser() user: User,
    @Query() query: AnalyticsQueryDto,
  ): Promise<AnalyticsResponseDto> {
    return this.analyticsService.getAnalytics(user.orgId, query);
  }
}
