import { BadRequestException, Injectable, Inject } from '@nestjs/common';
import { CACHE_MANAGER, type Cache } from '@nestjs/cache-manager';
import {
  ADMIN_ANALYTICS_REPOSITORY,
  type IAdminAnalyticsRepository,
  type AnalyticsGranularity,
} from '@skillspell/shared';
import type { AnalyticsQueryDto, AnalyticsResponseDto } from './admin-analytics.dto.js';

const CACHE_TTL_MS = 600_000; // 10 minutes
const TOP_SKILLS_LIMIT = 5;

@Injectable()
export class AdminAnalyticsService {
  constructor(
    @Inject(ADMIN_ANALYTICS_REPOSITORY)
    private readonly analyticsRepo: IAdminAnalyticsRepository,
    @Inject(CACHE_MANAGER)
    private readonly cacheManager: Cache,
  ) {}

  async getAnalytics(
    orgId: string,
    query: AnalyticsQueryDto,
  ): Promise<AnalyticsResponseDto> {
    const { from, to } = this.resolveDateRange(query);
    // For preset periods the key is stable (period name is deterministic).
    // normalise custom range dates to ISO date strings (YYYY-MM-DD) so that
    // semantically equivalent but differently formatted inputs share the same cache entry.
    const cacheKey = query.period === 'custom'
      ? `analytics:${orgId}:custom:${new Date(query.from!).toISOString().slice(0, 10)}:${new Date(query.to!).toISOString().slice(0, 10)}`
      : `analytics:${orgId}:${query.period ?? '30d'}`;

    const cached = await this.cacheManager.get<AnalyticsResponseDto>(cacheKey);
    if (cached) return cached;

    const granularity = this.resolveGranularity(from, to);
    const prevFrom = new Date(from.getTime() - (to.getTime() - from.getTime()));
    const prevTo = from;

    const [
      skillsCreated,
      downloads,
      submissionFunnel,
      topSkills,
      userGrowth,
      categoryBreakdown,
      kpiCurrent,
      kpiPrev,
    ] = await Promise.all([
      this.analyticsRepo.getSkillsCreatedByDay(orgId, from, to, granularity),
      this.analyticsRepo.getDownloadsByDay(orgId, from, to, granularity),
      this.analyticsRepo.getSubmissionFunnel(orgId, from, to),
      this.analyticsRepo.getTopSkills(orgId, from, to, TOP_SKILLS_LIMIT),
      this.analyticsRepo.getUserGrowthByDay(orgId, from, to, granularity),
      this.analyticsRepo.getCategoryBreakdown(orgId),
      this.analyticsRepo.getKpiTotals(orgId, from, to),
      this.analyticsRepo.getKpiTotals(orgId, prevFrom, prevTo),
    ]);

    const delta = (curr: number, prev: number): number => {
      if (prev === 0) return curr > 0 ? 100 : 0;
      return Math.round(((curr - prev) / prev) * 100);
    };

    const result: AnalyticsResponseDto = {
      kpis: {
        totalSkillsCreated: kpiCurrent.totalSkillsCreated,
        totalDownloads: kpiCurrent.totalDownloads,
        totalMembers: kpiCurrent.totalMembers,
        avgReviewHours: Math.round(kpiCurrent.avgReviewHours * 10) / 10,
        skillsDelta: delta(kpiCurrent.totalSkillsCreated, kpiPrev.totalSkillsCreated),
        downloadsDelta: delta(kpiCurrent.totalDownloads, kpiPrev.totalDownloads),
      },
      skillsCreated,
      downloads,
      submissionFunnel,
      topSkills,
      userGrowth,
      categoryBreakdown,
    };

    await this.cacheManager.set(cacheKey, result, CACHE_TTL_MS);
    return result;
  }

  private resolveDateRange(query: AnalyticsQueryDto): { from: Date; to: Date } {
    const to = new Date();
    to.setHours(23, 59, 59, 999);

    if (query.period === 'custom' && query.from && query.to) {
      const from = new Date(query.from);
      const to = new Date(query.to);
      // reject inverted date ranges early (would silently return all zeros otherwise)
      if (from >= to)
        throw new BadRequestException('`from` must be earlier than `to`');
      // cap custom ranges to prevent full-table-scan analytics queries
      const maxDays = 365;
      const diffDays = (to.getTime() - from.getTime()) / (24 * 60 * 60 * 1000);
      if (diffDays > maxDays)
        throw new BadRequestException(`Date range cannot exceed ${maxDays} days`);
      return { from, to };
    }

    const days = query.period === '7d' ? 7 : query.period === '90d' ? 90 : 30;
    const from = new Date(to.getTime() - days * 24 * 60 * 60 * 1000);
    return { from, to };
  }

  private resolveGranularity(from: Date, to: Date): AnalyticsGranularity {
    const days = (to.getTime() - from.getTime()) / (24 * 60 * 60 * 1000);
    if (days <= 14) return 'day';
    if (days < 60) return 'week';
    return 'month';
  }
}
