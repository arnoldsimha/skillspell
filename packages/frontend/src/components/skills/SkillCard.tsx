import type { SkillSummary } from '@skillspell/shared';
import { formatDate } from '../../utils/formatDate.js';

interface SkillCardProps {
  skill: SkillSummary;
  selected: boolean;
  onClick: () => void;
}

const STATUS_STYLES: Record<string, { bg: string; text: string; dot: string }> = {
  draft: { bg: 'bg-amber-500/10', text: 'text-amber-400', dot: 'bg-amber-400' },
  ready: { bg: 'bg-emerald-500/10', text: 'text-emerald-400', dot: 'bg-emerald-400' },
  in_review: { bg: 'bg-sky-500/10', text: 'text-sky-400', dot: 'bg-sky-400' },
  published: { bg: 'bg-purple-500/10', text: 'text-purple-400', dot: 'bg-purple-400' },
};

const DEFAULT_STATUS = { bg: 'bg-slate-500/10', text: 'text-slate-400', dot: 'bg-slate-400' };

export default function SkillCard({ skill, selected, onClick }: SkillCardProps) {
  const statusStyle = STATUS_STYLES[skill.status] ?? DEFAULT_STATUS;

  return (
    <button
      onClick={onClick}
      className={`group w-full rounded-xl p-3 text-left transition-all duration-200
        ${
          selected
            ? 'bg-indigo-500/15 ring-1 ring-indigo-500/30'
            : 'hover:bg-white/[0.04]'
        }
      `}
    >
      <div className="flex items-start justify-between gap-2">
        <h3 className={`truncate text-sm font-semibold transition-colors ${
          selected ? 'text-indigo-300' : 'text-slate-200 group-hover:text-white'
        }`}>
          {skill.name}
        </h3>
        <span
          className={`flex shrink-0 items-center gap-1 rounded-full px-2 py-0.5 text-[10px] font-medium ${statusStyle.bg} ${statusStyle.text}`}
        >
          <span className={`h-1.5 w-1.5 rounded-full ${statusStyle.dot}`} />
          {skill.status === 'in_review' ? 'in review' : skill.status}
        </span>
      </div>
      <p className="mt-1.5 line-clamp-2 text-[11px] leading-relaxed text-slate-500">{skill.description}</p>
      <div className="mt-2 flex items-center gap-3 text-[10px] text-slate-600">
        <span className="flex items-center gap-1">
          <svg className="h-3 w-3" fill="none" viewBox="0 0 24 24" strokeWidth={1.5} stroke="currentColor">
            <path strokeLinecap="round" strokeLinejoin="round" d="M9.568 3H5.25A2.25 2.25 0 0 0 3 5.25v4.318c0 .597.237 1.17.659 1.591l9.581 9.581c.699.699 1.78.872 2.607.33a18.095 18.095 0 0 0 5.223-5.223c.542-.827.369-1.908-.33-2.607L11.16 3.66A2.25 2.25 0 0 0 9.568 3Z" />
            <path strokeLinecap="round" strokeLinejoin="round" d="M6 6h.008v.008H6V6Z" />
          </svg>
          v{skill.version}
        </span>
        <span>{formatDate(skill.updatedAt)}</span>
      </div>
    </button>
  );
}
