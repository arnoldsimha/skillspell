interface TopSkillsTableProps {
  data: { name: string; downloads: number }[];
}

export default function TopSkillsTable({ data }: TopSkillsTableProps) {
  const max = data[0]?.downloads ?? 1;

  return (
    <div className="rounded-xl border border-slate-200 bg-white p-5">
      <p className="text-sm font-semibold text-slate-700">Top Downloaded Skills</p>
      <p className="mb-4 text-xs text-slate-400">This period</p>
      {data.length === 0 ? (
        <p className="text-sm text-slate-400">No downloads yet</p>
      ) : (
        <div className="space-y-3">
          {data.map((skill, i) => (
            <div key={skill.name} className="flex items-center gap-3">
              <span className="w-5 text-right text-xs font-bold text-slate-400">#{i + 1}</span>
              <div className="flex-1 min-w-0">
                <p className="truncate text-sm text-slate-700">{skill.name}</p>
                <div className="mt-1 h-1.5 w-full rounded-full bg-slate-100">
                  <div
                    className="h-1.5 rounded-full bg-indigo-500"
                    style={{ width: `${Math.round((skill.downloads / max) * 100)}%` }}
                  />
                </div>
              </div>
              <span className="text-xs text-slate-500 shrink-0">{skill.downloads}</span>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
