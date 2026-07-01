import {
  AreaChart, Area, XAxis, YAxis, Tooltip, ResponsiveContainer,
} from 'recharts';
import { formatChartAxisLabel } from '../../../utils/formatDate.js';

interface DownloadsChartProps {
  data: { date: string; count: number }[];
}

export default function DownloadsChart({ data }: DownloadsChartProps) {
  const formatted = data.map(d => ({
    date: formatChartAxisLabel(d.date),
    count: d.count,
  }));

  return (
    <div className="rounded-xl border border-slate-200 bg-white p-5">
      <p className="text-sm font-semibold text-slate-700">Download Trends</p>
      <p className="mb-4 text-xs text-slate-400">Marketplace downloads per period</p>
      {formatted.length === 0 ? (
        <div className="flex h-[180px] items-center justify-center text-sm text-slate-400">No data</div>
      ) : (
        <ResponsiveContainer width="100%" height={180}>
          <AreaChart data={formatted} margin={{ top: 4, right: 4, left: -20, bottom: 0 }}>
            <defs>
              <linearGradient id="dlGrad" x1="0" y1="0" x2="0" y2="1">
                <stop offset="5%" stopColor="#6366f1" stopOpacity={0.2} />
                <stop offset="95%" stopColor="#6366f1" stopOpacity={0} />
              </linearGradient>
            </defs>
            <XAxis dataKey="date" tick={{ fontSize: 11, fill: '#94a3b8' }} tickLine={false} axisLine={false} />
            <YAxis tick={{ fontSize: 11, fill: '#94a3b8' }} tickLine={false} axisLine={false} allowDecimals={false} />
            <Tooltip
              contentStyle={{ fontSize: 12, borderRadius: 8, border: '1px solid #e2e8f0' }}
            />
            <Area
              type="monotone"
              dataKey="count"
              name="Downloads"
              stroke="#6366f1"
              strokeWidth={2}
              fill="url(#dlGrad)"
            />
          </AreaChart>
        </ResponsiveContainer>
      )}
    </div>
  );
}
