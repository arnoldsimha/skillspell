import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import { vi, describe, it, expect, beforeEach } from 'vitest';
import AdminAnalyticsTab from '../AdminAnalyticsTab.js';
import * as analyticsApi from '../../../services/api/analytics.js';

vi.mock('../../../services/api/analytics.js');

// Chart children format axis dates via user prefs; provide them without
// mounting the real PreferencesProvider.
vi.mock('../../../hooks/useUserPreferences.js', () => ({
  useUserPreferences: () => ({
    prefs: { timezone: 'UTC', dateFormat: 'DD/MM/YYYY' },
  }),
}));

global.ResizeObserver = class ResizeObserver {
  observe() {}
  unobserve() {}
  disconnect() {}
};

const stubResponse: analyticsApi.AnalyticsResponse = {
  kpis: {
    totalSkillsCreated: 12,
    totalDownloads: 88,
    totalMembers: 15,
    avgReviewHours: 3.2,
    skillsDelta: 20,
    downloadsDelta: -5,
  },
  skillsCreated: [{ date: '2026-05-01T00:00:00Z', count: 3 }],
  downloads: [{ date: '2026-05-01T00:00:00Z', count: 10 }],
  submissionFunnel: { submitted: 8, approved: 6, rejected: 1, pending: 1 },
  topSkills: [{ name: 'Code Reviewer', downloads: 30 }],
  userGrowth: [{ date: '2026-05-01T00:00:00Z', count: 2 }],
  categoryBreakdown: [{ name: 'Engineering', count: 7 }],
};

describe('AdminAnalyticsTab', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.mocked(analyticsApi.getAnalytics).mockResolvedValue(stubResponse);
  });

  it('fetches analytics with 30d on mount', async () => {
    render(<AdminAnalyticsTab />);
    await waitFor(() =>
      expect(analyticsApi.getAnalytics).toHaveBeenCalledWith('30d', undefined, undefined),
    );
  });

  it('renders KPI values after loading', async () => {
    render(<AdminAnalyticsTab />);
    await waitFor(() => expect(screen.getAllByText('12')[0]).toBeInTheDocument());
    expect(screen.getAllByText('88')[0]).toBeInTheDocument();
    expect(screen.getAllByText('15')[0]).toBeInTheDocument();
  });

  it('shows error state and retry button on fetch failure', async () => {
    vi.mocked(analyticsApi.getAnalytics).mockRejectedValue(new Error('Network error'));
    render(<AdminAnalyticsTab />);
    await waitFor(() =>
      expect(screen.getByText(/failed to load/i)).toBeInTheDocument(),
    );
    expect(screen.getByRole('button', { name: /try again/i })).toBeInTheDocument();
  });

  it('re-fetches when period changes to 7d', async () => {
    render(<AdminAnalyticsTab />);
    await waitFor(() => screen.getAllByText('12')[0]);
    fireEvent.click(screen.getByRole('button', { name: '7d' }));
    await waitFor(() =>
      expect(analyticsApi.getAnalytics).toHaveBeenCalledWith('7d', undefined, undefined),
    );
  });
});
