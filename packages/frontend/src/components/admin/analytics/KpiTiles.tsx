import type { AnalyticsKpis } from '../../../services/api/analytics.js';

interface KpiTilesProps {
  kpis: AnalyticsKpis;
}

function DeltaBadge({ delta }: { delta: number }) {
  if (delta === 0) return null;
  const positive = delta > 0;
  return (
    <span className={`text-xs font-semibold ${positive ? 'text-emerald-600' : 'text-red-500'}`}>
      {positive ? '↑' : '↓'} {Math.abs(delta)}%
    </span>
  );
}

export default function KpiTiles({ kpis }: KpiTilesProps) {
  const tiles: { label: string; value: number; delta: number | null; suffix: string; subtitle?: string }[] = [
    {
      label: 'Skills Created',
      value: kpis.totalSkillsCreated,
      delta: kpis.skillsDelta,
      suffix: '',
    },
    {
      label: 'Downloads',
      value: kpis.totalDownloads,
      delta: kpis.downloadsDelta,
      suffix: '',
    },
    {
      label: 'Total Members',
      value: kpis.totalMembers,
      delta: null,
      suffix: '',
      subtitle: 'All org members',
    },
    {
      label: 'Avg Review Time',
      value: kpis.avgReviewHours,
      delta: null,
      suffix: 'h',
    },
  ];

  return (
    <div className="grid grid-cols-2 gap-4 sm:grid-cols-4">
      {tiles.map(tile => (
        <div
          key={tile.label}
          className="rounded-xl border border-slate-200 bg-white px-5 py-4"
        >
          <p className="text-xs font-semibold uppercase tracking-widest text-slate-500">
            {tile.label}
          </p>
          <div className="mt-1.5 flex items-baseline gap-2">
            <span className="text-2xl font-bold text-slate-800">
              {tile.value}{tile.suffix}
            </span>
            {tile.delta !== null && <DeltaBadge delta={tile.delta} />}
          </div>
          <p className="mt-0.5 text-xs text-slate-400">
            {tile.subtitle ?? (tile.delta !== null ? 'vs previous period' : null)}
          </p>
        </div>
      ))}
    </div>
  );
}
