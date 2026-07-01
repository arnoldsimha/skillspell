import { BarChart, Bar, XAxis, YAxis, Tooltip, ResponsiveContainer, Cell, LabelList } from 'recharts';

interface FunnelChartProps {
  data: { submitted: number; approved: number; rejected: number; pending: number };
}

const FUNNEL_COLORS: Record<string, string> = {
  Submitted: '#6366f1',
  Approved: '#10b981',
  Rejected: '#f87171',
  Pending: '#fbbf24',
};

function BarLabel(props: {
  x?: number; y?: number; width?: number; height?: number; value?: number;
}) {
  const { x = 0, y = 0, width = 0, height = 0, value = 0 } = props;
  const midY = y + height / 2;

  if (value === 0) {
    return (
      <text x={x + 8} y={midY} dominantBaseline="middle" fill="#94a3b8" fontSize={11} fontWeight={600}>
        0
      </text>
    );
  }

  return (
    <text x={x + width - 8} y={midY} textAnchor="end" dominantBaseline="middle" fill="#fff" fontSize={11} fontWeight={600}>
      {value}
    </text>
  );
}

export default function FunnelChart({ data }: FunnelChartProps) {
  const chartData = [
    { name: 'Submitted', count: data.submitted },
    { name: 'Approved', count: data.approved },
    { name: 'Rejected', count: data.rejected },
    { name: 'Pending', count: data.pending },
  ];

  const isEmpty = chartData.every(d => d.count === 0);

  return (
    <div className="rounded-xl border border-slate-200 bg-white p-5">
      <p className="text-sm font-semibold text-slate-700">Submission Funnel</p>
      <p className="mb-4 text-xs text-slate-400">Submissions by outcome this period</p>
      {isEmpty ? (
        <div className="flex h-[180px] items-center justify-center text-sm text-slate-400">No submissions</div>
      ) : (
      <ResponsiveContainer width="100%" height={180}>
        <BarChart
          layout="vertical"
          data={chartData}
          margin={{ top: 4, right: 36, left: 0, bottom: 0 }}
        >
          <XAxis type="number" tick={{ fontSize: 11, fill: '#94a3b8' }} tickLine={false} axisLine={false} allowDecimals={false} />
          <YAxis type="category" dataKey="name" tick={{ fontSize: 12, fill: '#475569' }} tickLine={false} axisLine={false} width={68} />
          <Tooltip
            contentStyle={{ fontSize: 12, borderRadius: 8, border: '1px solid #e2e8f0' }}
            cursor={{ fill: '#f1f5f9' }}
          />
          <Bar dataKey="count" name="Count" radius={[0, 3, 3, 0]}>
            {chartData.map(entry => (
              <Cell key={entry.name} fill={FUNNEL_COLORS[entry.name]} />
            ))}
            <LabelList dataKey="count" content={BarLabel as never} />
          </Bar>
        </BarChart>
      </ResponsiveContainer>
      )}
    </div>
  );
}
