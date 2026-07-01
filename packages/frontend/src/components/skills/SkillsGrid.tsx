import { useState, useMemo, useEffect } from 'react';
import type { SkillSummary } from '@skillspell/shared';
import { formatDate } from '../../utils/formatDate.js';

const SKILLS_PER_PAGE = 30;

const STATUS_STYLES: Record<string, { bg: string; text: string; dot: string }> = {
  draft: { bg: 'bg-amber-500/10', text: 'text-amber-400', dot: 'bg-amber-400' },
  ready: { bg: 'bg-emerald-500/10', text: 'text-emerald-400', dot: 'bg-emerald-400' },
  in_review: { bg: 'bg-sky-500/10', text: 'text-sky-400', dot: 'bg-sky-400' },
  published: { bg: 'bg-purple-500/10', text: 'text-purple-400', dot: 'bg-purple-400' },
};

const DEFAULT_STATUS = { bg: 'bg-slate-200', text: 'text-slate-500', dot: 'bg-slate-400' };

interface SkillsGridProps {
  skills: SkillSummary[];
  loading: boolean;
  onSelectSkill: (skill: SkillSummary) => void;
  onCreateNew: () => void;
}

function SkeletonGridCard() {
  return (
    <div className="rounded-xl border border-slate-200 bg-white p-5 shadow-sm">
      <div className="mb-3 h-5 w-3/4 rounded-md animate-shimmer" />
      <div className="mb-2 h-3.5 w-full rounded-md animate-shimmer" />
      <div className="mb-4 h-3.5 w-2/3 rounded-md animate-shimmer" />
      <div className="flex gap-2">
        <div className="h-5 w-14 rounded-full animate-shimmer" />
        <div className="h-5 w-20 rounded-full animate-shimmer" />
      </div>
    </div>
  );
}

export default function SkillsGrid({ skills, loading, onSelectSkill, onCreateNew }: SkillsGridProps) {
  const [search, setSearch] = useState('');
  const [currentPage, setCurrentPage] = useState(1);

  // Reset to page 1 when the skills list changes (e.g. after delete)
  useEffect(() => {
    setCurrentPage(1);
  }, [skills]);

  // Filter skills by name and description
  const filtered = useMemo(() => {
    if (!search.trim()) return skills;
    const q = search.toLowerCase();
    return skills.filter(
      (s) =>
        (s.name ?? '').toLowerCase().includes(q) ||
        (s.description ?? '').toLowerCase().includes(q),
    );
  }, [skills, search]);

  // Reset to page 1 when search changes
  const handleSearchChange = (value: string) => {
    setSearch(value);
    setCurrentPage(1);
  };

  // Pagination
  const totalPages = Math.max(1, Math.ceil(filtered.length / SKILLS_PER_PAGE));
  const safePage = Math.min(currentPage, totalPages);
  const startIdx = (safePage - 1) * SKILLS_PER_PAGE;
  const pageSkills = filtered.slice(startIdx, startIdx + SKILLS_PER_PAGE);

  // Generate page numbers to display
  const getPageNumbers = (): (number | 'ellipsis')[] => {
    if (totalPages <= 7) {
      return Array.from({ length: totalPages }, (_, i) => i + 1);
    }
    const pages: (number | 'ellipsis')[] = [1];
    if (safePage > 3) pages.push('ellipsis');
    const start = Math.max(2, safePage - 1);
    const end = Math.min(totalPages - 1, safePage + 1);
    for (let i = start; i <= end; i++) pages.push(i);
    if (safePage < totalPages - 2) pages.push('ellipsis');
    pages.push(totalPages);
    return pages;
  };

  return (
    <div className="flex h-full flex-col overflow-hidden">
      {/* Header */}
      <div className="shrink-0 border-b border-slate-200 bg-white px-6 py-5 sm:px-8">
        <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
          <div>
            <h1 className="text-2xl font-bold text-slate-800">My Skills</h1>
            <p className="mt-1 text-sm text-slate-500">
              {filtered.length} skill{filtered.length !== 1 ? 's' : ''} found
              {search && ` for "${search}"`}
            </p>
          </div>
          <button
            onClick={onCreateNew}
            className="flex items-center gap-2 rounded-xl bg-gradient-to-r from-indigo-600 to-purple-600 px-5 py-2.5 text-sm font-semibold text-white shadow-lg shadow-indigo-500/25 hover:shadow-xl hover:shadow-indigo-500/30 hover:brightness-110 transition-all duration-200"
          >
            <svg className="h-4 w-4" fill="none" viewBox="0 0 24 24" strokeWidth={2.5} stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" d="M12 4.5v15m7.5-7.5h-15" />
            </svg>
            Create Skill
          </button>
        </div>

        {/* Search bar */}
        <div className="mt-4 relative max-w-lg">
          <svg
            className="absolute left-3.5 top-1/2 -translate-y-1/2 h-4 w-4 text-slate-400"
            fill="none"
            viewBox="0 0 24 24"
            strokeWidth={2}
            stroke="currentColor"
          >
            <path
              strokeLinecap="round"
              strokeLinejoin="round"
              d="m21 21-5.197-5.197m0 0A7.5 7.5 0 1 0 5.196 5.196a7.5 7.5 0 0 0 10.607 10.607Z"
            />
          </svg>
          <input
            type="text"
            placeholder="Search by name or description…"
            value={search}
            onChange={(e) => handleSearchChange(e.target.value)}
            className="w-full rounded-xl border border-slate-200 bg-slate-50 py-2.5 pl-10 pr-4 text-sm text-slate-700 placeholder:text-slate-400 focus:border-indigo-400 focus:bg-white focus:outline-none focus:ring-2 focus:ring-indigo-500/20 transition-all duration-200"
          />
          {search && (
            <button
              onClick={() => handleSearchChange('')}
              className="absolute right-3 top-1/2 -translate-y-1/2 rounded-md p-0.5 text-slate-400 hover:text-slate-600 transition-colors"
              aria-label="Clear search"
            >
              <svg className="h-4 w-4" fill="none" viewBox="0 0 24 24" strokeWidth={2} stroke="currentColor">
                <path strokeLinecap="round" strokeLinejoin="round" d="M6 18 18 6M6 6l12 12" />
              </svg>
            </button>
          )}
        </div>
      </div>

      {/* Grid content */}
      <div className="flex-1 overflow-y-auto px-6 py-6 sm:px-8">
        {loading ? (
          <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3">
            {Array.from({ length: 6 }).map((_, i) => (
              <SkeletonGridCard key={i} />
            ))}
          </div>
        ) : pageSkills.length === 0 ? (
          <div className="flex flex-col items-center justify-center py-20 text-center animate-fade-in-up">
            <div className="flex h-16 w-16 items-center justify-center rounded-2xl bg-slate-100 mb-4">
              <svg className="h-8 w-8 text-slate-400" fill="none" viewBox="0 0 24 24" strokeWidth={1.5} stroke="currentColor">
                <path
                  strokeLinecap="round"
                  strokeLinejoin="round"
                  d="m21 21-5.197-5.197m0 0A7.5 7.5 0 1 0 5.196 5.196a7.5 7.5 0 0 0 10.607 10.607Z"
                />
              </svg>
            </div>
            {search ? (
              <>
                <p className="text-lg font-semibold text-slate-600">No matching skills</p>
                <p className="mt-1 text-sm text-slate-400">
                  Try adjusting your search or{' '}
                  <button onClick={() => handleSearchChange('')} className="text-indigo-500 hover:text-indigo-600 font-medium">
                    clear the filter
                  </button>
                </p>
              </>
            ) : (
              <>
                <p className="text-lg font-semibold text-slate-600">No skills yet</p>
                <p className="mt-1 text-sm text-slate-400">Create your first skill to get started</p>
                <button
                  onClick={onCreateNew}
                  className="mt-4 flex items-center gap-2 rounded-xl bg-gradient-to-r from-indigo-600 to-purple-600 px-5 py-2.5 text-sm font-semibold text-white shadow-lg shadow-indigo-500/25 hover:shadow-xl hover:shadow-indigo-500/30 hover:brightness-110 transition-all duration-200"
                >
                  <svg className="h-4 w-4" fill="none" viewBox="0 0 24 24" strokeWidth={2.5} stroke="currentColor">
                    <path strokeLinecap="round" strokeLinejoin="round" d="M12 4.5v15m7.5-7.5h-15" />
                  </svg>
                  Create Skill
                </button>
              </>
            )}
          </div>
        ) : (
          <>
            <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3">
              {pageSkills.map((skill, idx) => {
                const statusStyle = STATUS_STYLES[skill.status] ?? DEFAULT_STATUS;
                return (
                  <button
                    key={skill.id}
                    onClick={() => onSelectSkill(skill)}
                    className="group rounded-xl border border-slate-200 bg-white p-5 text-left shadow-sm hover:shadow-md hover:border-indigo-200 hover:bg-indigo-50/30 transition-all duration-200 animate-fade-in-up"
                    style={{ animationDelay: `${Math.min(idx, 8) * 30}ms` }}
                  >
                    {/* Title + status */}
                    <div className="flex items-start justify-between gap-3">
                      <h3 className="truncate text-sm font-semibold text-slate-800 group-hover:text-indigo-700 transition-colors">
                        {skill.name}
                      </h3>
                      <span
                        className={`flex shrink-0 items-center gap-1 rounded-full px-2 py-0.5 text-[10px] font-medium ${statusStyle.bg} ${statusStyle.text}`}
                      >
                        <span className={`h-1.5 w-1.5 rounded-full ${statusStyle.dot}`} />
                        {skill.status === 'in_review' ? 'in review' : skill.status}
                      </span>
                    </div>

                    {/* Description */}
                    <p className="mt-2 line-clamp-2 text-xs leading-relaxed text-slate-500">
                      {skill.description}
                    </p>

                    {/* Meta */}
                    <div className="mt-3 flex items-center gap-3 text-[11px] text-slate-400">
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
              })}
            </div>

            {/* Pagination */}
            {totalPages > 1 && (
              <div className="mt-8 flex items-center justify-center gap-1">
                {/* Previous */}
                <button
                  onClick={() => setCurrentPage((p) => Math.max(1, p - 1))}
                  disabled={safePage === 1}
                  className="flex items-center gap-1 rounded-lg px-3 py-2 text-xs font-medium text-slate-500 hover:bg-slate-100 hover:text-slate-700 disabled:opacity-40 disabled:hover:bg-transparent disabled:cursor-not-allowed transition-colors"
                >
                  <svg className="h-3.5 w-3.5" fill="none" viewBox="0 0 24 24" strokeWidth={2} stroke="currentColor">
                    <path strokeLinecap="round" strokeLinejoin="round" d="M15.75 19.5 8.25 12l7.5-7.5" />
                  </svg>
                  Prev
                </button>

                {/* Page numbers */}
                {getPageNumbers().map((page, idx) =>
                  page === 'ellipsis' ? (
                    <span key={`ellipsis-${idx}`} className="px-2 text-xs text-slate-400">
                      …
                    </span>
                  ) : (
                    <button
                      key={page}
                      onClick={() => setCurrentPage(page)}
                      className={`min-w-[32px] rounded-lg px-2.5 py-2 text-xs font-medium transition-colors ${
                        page === safePage
                          ? 'bg-indigo-500 text-white shadow-sm shadow-indigo-500/25'
                          : 'text-slate-500 hover:bg-slate-100 hover:text-slate-700'
                      }`}
                    >
                      {page}
                    </button>
                  ),
                )}

                {/* Next */}
                <button
                  onClick={() => setCurrentPage((p) => Math.min(totalPages, p + 1))}
                  disabled={safePage === totalPages}
                  className="flex items-center gap-1 rounded-lg px-3 py-2 text-xs font-medium text-slate-500 hover:bg-slate-100 hover:text-slate-700 disabled:opacity-40 disabled:hover:bg-transparent disabled:cursor-not-allowed transition-colors"
                >
                  Next
                  <svg className="h-3.5 w-3.5" fill="none" viewBox="0 0 24 24" strokeWidth={2} stroke="currentColor">
                    <path strokeLinecap="round" strokeLinejoin="round" d="m8.25 4.5 7.5 7.5-7.5 7.5" />
                  </svg>
                </button>
              </div>
            )}

            {/* Page info */}
            {totalPages > 1 && (
              <p className="mt-3 text-center text-[11px] text-slate-400">
                Showing {startIdx + 1}–{Math.min(startIdx + SKILLS_PER_PAGE, filtered.length)} of {filtered.length} skills
              </p>
            )}
          </>
        )}
      </div>
    </div>
  );
}
