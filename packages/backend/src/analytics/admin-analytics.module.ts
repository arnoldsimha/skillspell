import { Module } from '@nestjs/common';
import { AdminAnalyticsController } from './admin-analytics.controller.js';
import { AdminAnalyticsService } from './admin-analytics.service.js';

@Module({
  controllers: [AdminAnalyticsController],
  providers: [AdminAnalyticsService],
})
export class AdminAnalyticsModule {}
