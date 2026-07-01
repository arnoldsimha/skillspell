export const ADMIN_ANALYTICS_REPOSITORY = Symbol('ADMIN_ANALYTICS_REPOSITORY');

export type AnalyticsGranularity = 'day' | 'week' | 'month';

export interface AnalyticsDatePoint {
  date: string;
  count: number;
}

export interface AnalyticsFunnel {
  submitted: number;
  approved: number;
  rejected: number;
  pending: number;
}

export interface AnalyticsTopSkill {
  name: string;
  downloads: number;
}

export interface AnalyticsCategoryCount {
  name: string;
  count: number;
}

export interface AnalyticsKpiRaw {
  totalSkillsCreated: number;
  totalDownloads: number;
  totalMembers: number;
  avgReviewHours: number;
}

export interface IAdminAnalyticsRepository {
  getSkillsCreatedByDay(
    orgId: string,
    from: Date,
    to: Date,
    granularity: AnalyticsGranularity,
  ): Promise<AnalyticsDatePoint[]>;

  getDownloadsByDay(
    orgId: string,
    from: Date,
    to: Date,
    granularity: AnalyticsGranularity,
  ): Promise<AnalyticsDatePoint[]>;

  getSubmissionFunnel(
    orgId: string,
    from: Date,
    to: Date,
  ): Promise<AnalyticsFunnel>;

  getTopSkills(
    orgId: string,
    from: Date,
    to: Date,
    limit: number,
  ): Promise<AnalyticsTopSkill[]>;

  getUserGrowthByDay(
    orgId: string,
    from: Date,
    to: Date,
    granularity: AnalyticsGranularity,
  ): Promise<AnalyticsDatePoint[]>;

  getCategoryBreakdown(orgId: string): Promise<AnalyticsCategoryCount[]>;

  getKpiTotals(
    orgId: string,
    from: Date,
    to: Date,
  ): Promise<AnalyticsKpiRaw>;
}
