import { useState, useCallback, useEffect } from 'react';
import { getAnalytics, type AnalyticsPeriod, type AnalyticsResponse } from '../../services/api/analytics.js';
import PeriodPicker from './analytics/PeriodPicker.js';
import KpiTiles from './analytics/KpiTiles.js';
import SkillsChart from './analytics/SkillsChart.js';
import DownloadsChart from './analytics/DownloadsChart.js';
import FunnelChart from './analytics/FunnelChart.js';
import TopSkillsTable from './analytics/TopSkillsTable.js';
import CategoryChart from './analytics/CategoryChart.js';
import UserGrowthChart from './analytics/UserGrowthChart.js';

function SkeletonCard({ height = 'h-[220px]' }: { height?: string }) {
  return (
    <div className={`rounded-xl border border-slate-200 bg-white p-5 ${height} animate-pulse`}>
      <div className="h-3 w-1/3 rounded bg-slate-200 mb-2" />
      <div className="h-2 w-1/4 rounded bg-slate-100 mb-6" />
      <div className="h-full rounded bg-slate-100" />
    </div>
  );
}

export default function AdminAnalyticsTab() {
  const [period, setPeriod] = useState<AnalyticsPeriod>('30d');
  const [customFrom, setCustomFrom] = useState('');
  const [customTo, setCustomTo] = useState('');
  const [data, setData] = useState<AnalyticsResponse | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const fetchData = useCallback(async (p: AnalyticsPeriod, from?: string, to?: string) => {
    setLoading(true);
    setError(null);
    try {
      const result = await getAnalytics(p, from, to);
      setData(result);
    } catch {
      setError('Failed to load analytics data.');
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    fetchData('30d');
  }, [fetchData]);

  function handlePeriodChange(p: AnalyticsPeriod, from?: string, to?: string) {
    setPeriod(p);
    if (from) setCustomFrom(from);
    if (to) setCustomTo(to);
    if (p !== 'custom' || (from && to)) {
      fetchData(p, from, to);
    }
  }

  return (
    <div>
      {/* Header */}
      <div className="mb-6 flex flex-wrap items-center justify-between gap-4">
        <div>
          <h3 className="text-lg font-semibold text-slate-900">Analytics</h3>
          <p className="mt-0.5 text-sm text-slate-500">
            Platform usage metrics for your organization.
          </p>
        </div>
        <PeriodPicker
          value={period}
          customFrom={customFrom}
          customTo={customTo}
          onChange={handlePeriodChange}
        />
      </div>

      {/* Error state */}
      {error && (
        <div className="mb-6 rounded-xl border border-red-200 bg-red-50 p-4 text-sm text-red-700 flex items-center justify-between">
          {error}
          <button
            type="button"
            onClick={() => fetchData(period, customFrom || undefined, customTo || undefined)}
            className="ml-4 font-medium underline hover:no-underline"
          >
            Try again
          </button>
        </div>
      )}

      {/* KPI row */}
      <div className="mb-6">
        {loading || !data ? (
          <div className="grid grid-cols-2 gap-4 sm:grid-cols-4">
            {[0,1,2,3].map(i => (
              <div key={i} className="rounded-xl border border-slate-200 bg-white px-5 py-4 animate-pulse">
                <div className="h-2 w-1/2 rounded bg-slate-200 mb-3" />
                <div className="h-7 w-2/3 rounded bg-slate-100" />
              </div>
            ))}
          </div>
        ) : (
          <KpiTiles kpis={data.kpis} />
        )}
      </div>

      {/* Charts — row 1: Funnel + Top Skills + Category */}
      <div className="mb-4 grid grid-cols-1 gap-4 lg:grid-cols-3">
        {loading || !data ? (
          <><SkeletonCard /><SkeletonCard /><SkeletonCard /></>
        ) : (
          <>
            <FunnelChart data={data.submissionFunnel} />
            <TopSkillsTable data={data.topSkills} />
            <CategoryChart data={data.categoryBreakdown} />
          </>
        )}
      </div>

      {/* Charts — row 2: Skills Created + Downloads */}
      <div className="mb-4 grid grid-cols-1 gap-4 lg:grid-cols-2">
        {loading || !data ? (
          <><SkeletonCard /><SkeletonCard /></>
        ) : (
          <>
            <SkillsChart data={data.skillsCreated} />
            <DownloadsChart data={data.downloads} />
          </>
        )}
      </div>

      {/* Charts — row 3: User Growth */}
      <div className="grid grid-cols-1 gap-4">
        {loading || !data ? (
          <SkeletonCard />
        ) : (
          <UserGrowthChart data={data.userGrowth} />
        )}
      </div>
    </div>
  );
}
