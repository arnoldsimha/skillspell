import { Test, TestingModule } from '@nestjs/testing';
import { CACHE_MANAGER } from '@nestjs/cache-manager';
import { AdminAnalyticsService } from './admin-analytics.service.js';
import { ADMIN_ANALYTICS_REPOSITORY } from '@skillspell/shared';

const makeRepo = () => ({
  getSkillsCreatedByDay: jest.fn().mockResolvedValue([]),
  getDownloadsByDay: jest.fn().mockResolvedValue([]),
  getSubmissionFunnel: jest.fn().mockResolvedValue({ submitted: 0, approved: 0, rejected: 0, pending: 0 }),
  getTopSkills: jest.fn().mockResolvedValue([]),
  getUserGrowthByDay: jest.fn().mockResolvedValue([]),
  getCategoryBreakdown: jest.fn().mockResolvedValue([]),
  getKpiTotals: jest.fn().mockResolvedValue({ totalSkillsCreated: 5, totalDownloads: 20, totalMembers: 10, avgReviewHours: 2.5 }),
});

const makeCache = () => ({
  get: jest.fn().mockResolvedValue(null),
  set: jest.fn().mockResolvedValue(undefined),
});

describe('AdminAnalyticsService', () => {
  let service: AdminAnalyticsService;
  let repo: ReturnType<typeof makeRepo>;
  let cache: ReturnType<typeof makeCache>;

  beforeEach(async () => {
    repo = makeRepo();
    cache = makeCache();
    const module: TestingModule = await Test.createTestingModule({
      providers: [
        AdminAnalyticsService,
        { provide: ADMIN_ANALYTICS_REPOSITORY, useValue: repo },
        { provide: CACHE_MANAGER, useValue: cache },
      ],
    }).compile();
    service = module.get(AdminAnalyticsService);
  });

  it('returns cached result without hitting repo', async () => {
    const cachedData = { kpis: {}, skillsCreated: [] } as any;
    cache.get.mockResolvedValue(cachedData);
    const result = await service.getAnalytics('org-1', { period: '30d' });
    expect(result).toEqual(cachedData);
    expect(repo.getSkillsCreatedByDay).not.toHaveBeenCalled();
  });

  it('runs all repo queries in parallel on cache miss', async () => {
    await service.getAnalytics('org-1', { period: '7d' });
    expect(repo.getSkillsCreatedByDay).toHaveBeenCalledWith('org-1', expect.any(Date), expect.any(Date), 'day');
    expect(repo.getDownloadsByDay).toHaveBeenCalled();
    expect(repo.getSubmissionFunnel).toHaveBeenCalled();
    expect(repo.getTopSkills).toHaveBeenCalledWith('org-1', expect.any(Date), expect.any(Date), 5);
    expect(repo.getUserGrowthByDay).toHaveBeenCalled();
    expect(repo.getCategoryBreakdown).toHaveBeenCalledWith('org-1');
    expect(repo.getKpiTotals).toHaveBeenCalledTimes(2);
  });

  it('stores result in cache with 10-minute TTL', async () => {
    await service.getAnalytics('org-1', { period: '30d' });
    expect(cache.set).toHaveBeenCalledWith(
      'analytics:org-1:30d',
      expect.any(Object),
      600_000,
    );
  });

  it('uses week granularity for 30d period', async () => {
    await service.getAnalytics('org-1', { period: '30d' });
    expect(repo.getSkillsCreatedByDay).toHaveBeenCalledWith(
      'org-1', expect.any(Date), expect.any(Date), 'week',
    );
  });

  it('uses month granularity for 90d period', async () => {
    await service.getAnalytics('org-1', { period: '90d' });
    expect(repo.getSkillsCreatedByDay).toHaveBeenCalledWith(
      'org-1', expect.any(Date), expect.any(Date), 'month',
    );
  });

  it('calculates skillsDelta correctly', async () => {
    repo.getKpiTotals
      .mockResolvedValueOnce({ totalSkillsCreated: 10, totalDownloads: 40, totalMembers: 20, avgReviewHours: 1 })
      .mockResolvedValueOnce({ totalSkillsCreated: 5, totalDownloads: 20, totalMembers: 20, avgReviewHours: 1 });
    const result = await service.getAnalytics('org-1', { period: '30d' });
    expect(result.kpis.skillsDelta).toBe(100);
    expect(result.kpis.downloadsDelta).toBe(100);
  });
});
