import { Test, TestingModule } from '@nestjs/testing';
import { AdminAnalyticsController } from './admin-analytics.controller.js';
import { AdminAnalyticsService } from './admin-analytics.service.js';
import type { User } from '@skillspell/shared';

const makeAdmin = (overrides = {}): User =>
  ({ id: 'u1', orgId: 'org-1', email: 'admin@test.com', role: 'admin', ...overrides }) as User;

const stubResponse = {
  kpis: { totalSkillsCreated: 5, totalDownloads: 20, totalMembers: 10, avgReviewHours: 2, skillsDelta: 10, downloadsDelta: 25 },
  skillsCreated: [],
  downloads: [],
  submissionFunnel: { submitted: 5, approved: 4, rejected: 1, pending: 0 },
  topSkills: [],
  userGrowth: [],
  categoryBreakdown: [],
};

describe('AdminAnalyticsController', () => {
  let controller: AdminAnalyticsController;
  let mockService: { getAnalytics: jest.Mock };

  beforeEach(async () => {
    mockService = { getAnalytics: jest.fn().mockResolvedValue(stubResponse) };
    const module: TestingModule = await Test.createTestingModule({
      controllers: [AdminAnalyticsController],
      providers: [{ provide: AdminAnalyticsService, useValue: mockService }],
    }).compile();
    controller = module.get(AdminAnalyticsController);
  });

  it('calls service with orgId and query, returns result', async () => {
    const result = await controller.getAnalytics(makeAdmin(), { period: '30d' });
    expect(mockService.getAnalytics).toHaveBeenCalledWith('org-1', { period: '30d' });
    expect(result).toEqual(stubResponse);
  });

  it('passes custom period params to service', async () => {
    await controller.getAnalytics(makeAdmin(), { period: 'custom', from: '2026-04-01', to: '2026-05-01' });
    expect(mockService.getAnalytics).toHaveBeenCalledWith('org-1', {
      period: 'custom',
      from: '2026-04-01',
      to: '2026-05-01',
    });
  });
});
