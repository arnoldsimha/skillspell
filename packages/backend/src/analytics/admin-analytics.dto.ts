import { IsEnum, IsOptional, IsDateString, ValidateIf } from 'class-validator';

export type AnalyticsPeriod = '7d' | '30d' | '90d' | 'custom';

export class AnalyticsQueryDto {
  @IsEnum(['7d', '30d', '90d', 'custom'])
  @IsOptional()
  period?: AnalyticsPeriod = '30d';

  @ValidateIf(o => o.period === 'custom')
  @IsDateString()
  from?: string;

  @ValidateIf(o => o.period === 'custom')
  @IsDateString()
  to?: string;
}

export interface AnalyticsKpis {
  totalSkillsCreated: number;
  totalDownloads: number;
  totalMembers: number;
  avgReviewHours: number;
  skillsDelta: number;
  downloadsDelta: number;
}

export interface AnalyticsResponseDto {
  kpis: AnalyticsKpis;
  skillsCreated: { date: string; count: number }[];
  downloads: { date: string; count: number }[];
  submissionFunnel: { submitted: number; approved: number; rejected: number; pending: number };
  topSkills: { name: string; downloads: number }[];
  userGrowth: { date: string; count: number }[];
  categoryBreakdown: { name: string; count: number }[];
}
