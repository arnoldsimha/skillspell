import { PieChart, Pie, Cell, Tooltip, ResponsiveContainer, Legend } from 'recharts';

interface CategoryChartProps {
  data: { name: string; count: number }[];
}

const COLORS = ['#6366f1', '#10b981', '#f59e0b', '#f87171', '#60a5fa', '#a78bfa'];

export default function CategoryChart({ data }: CategoryChartProps) {
  return (
    <div className="rounded-xl border border-slate-200 bg-white p-5">
      <p className="text-sm font-semibold text-slate-700">Skills by Category</p>
      <p className="mb-4 text-xs text-slate-400">Current distribution</p>
      {data.length === 0 ? (
        <div className="flex h-[180px] items-center justify-center text-sm text-slate-400">No categories</div>
      ) : (
        <ResponsiveContainer width="100%" height={180}>
          <PieChart>
            <Pie
              data={data}
              dataKey="count"
              nameKey="name"
              cx="50%"
              cy="50%"
              innerRadius={45}
              outerRadius={75}
              paddingAngle={2}
            >
              {data.map((_, i) => (
                <Cell key={i} fill={COLORS[i % COLORS.length]} />
              ))}
            </Pie>
            <Tooltip
              contentStyle={{ fontSize: 12, borderRadius: 8, border: '1px solid #e2e8f0' }}
            />
            <Legend
              iconType="circle"
              iconSize={8}
              wrapperStyle={{ fontSize: 11, paddingTop: 8 }}
            />
          </PieChart>
        </ResponsiveContainer>
      )}
    </div>
  );
}
