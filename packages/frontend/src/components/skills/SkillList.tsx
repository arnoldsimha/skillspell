import type { SkillSummary } from '@skillspell/shared';
import SkillCard from './SkillCard.js';

interface SkillListProps {
  skills: SkillSummary[];
  loading: boolean;
  selectedId: string | null;
  onSelect: (skill: SkillSummary) => void;
}

function SkeletonCard() {
  return (
    <div className="rounded-xl p-3">
      <div className="mb-2.5 h-4 w-3/4 rounded-md animate-shimmer-dark" />
      <div className="mb-2 h-3 w-full rounded-md animate-shimmer-dark" />
      <div className="flex gap-2">
        <div className="h-3 w-12 rounded-md animate-shimmer-dark" />
        <div className="h-3 w-10 rounded-md animate-shimmer-dark" />
      </div>
    </div>
  );
}

export default function SkillList({ skills, loading, selectedId, onSelect }: SkillListProps) {
  if (loading) {
    return (
      <div className="space-y-1">
        <SkeletonCard />
        <SkeletonCard />
        <SkeletonCard />
      </div>
    );
  }

  if (skills.length === 0) {
    return (
      <div className="flex flex-col items-center justify-center py-12 text-center px-4">
        <div className="flex h-12 w-12 items-center justify-center rounded-xl bg-white/[0.04] mb-3">
          <svg
            className="h-6 w-6 text-slate-600"
            fill="none"
            viewBox="0 0 24 24"
            strokeWidth={1.5}
            stroke="currentColor"
          >
            <path
              strokeLinecap="round"
              strokeLinejoin="round"
              d="M19.5 14.25v-2.625a3.375 3.375 0 0 0-3.375-3.375h-1.5A1.125 1.125 0 0 1 13.5 7.125v-1.5a3.375 3.375 0 0 0-3.375-3.375H8.25m2.25 0H5.625c-.621 0-1.125.504-1.125 1.125v17.25c0 .621.504 1.125 1.125 1.125h12.75c.621 0 1.125-.504 1.125-1.125V11.25a9 9 0 0 0-9-9Z"
            />
          </svg>
        </div>
        <p className="text-sm font-medium text-slate-400">No skills yet</p>
        <p className="mt-1 text-xs text-slate-600">Create your first skill to get started</p>
      </div>
    );
  }

  return (
    <div className="space-y-0.5">
      {skills.map((skill) => (
        <SkillCard
          key={skill.id}
          skill={skill}
          selected={skill.id === selectedId}
          onClick={() => onSelect(skill)}
        />
      ))}
    </div>
  );
}
