import { request } from './client.js';

export type AnalyticsPeriod = '7d' | '30d' | '90d' | 'custom';

export interface AnalyticsKpis {
  totalSkillsCreated: number;
  totalDownloads: number;
  totalMembers: number;
  avgReviewHours: number;
  skillsDelta: number;
  downloadsDelta: number;
}

export interface AnalyticsResponse {
  kpis: AnalyticsKpis;
  skillsCreated: { date: string; count: number }[];
  downloads: { date: string; count: number }[];
  submissionFunnel: { submitted: number; approved: number; rejected: number; pending: number };
  topSkills: { name: string; downloads: number }[];
  userGrowth: { date: string; count: number }[];
  categoryBreakdown: { name: string; count: number }[];
}

export function getAnalytics(
  period: AnalyticsPeriod,
  from?: string,
  to?: string,
): Promise<AnalyticsResponse> {
  const params = new URLSearchParams({ period });
  if (period === 'custom' && from && to) {
    params.set('from', from);
    params.set('to', to);
  }
  return request<AnalyticsResponse>(`/api/admin/analytics?${params.toString()}`);
}
