import { Fragment, useEffect, useMemo, useState } from 'react';
import { useNavigate } from 'react-router';
import { fetchMySubmissions, type MySubmission } from '../services/api/marketplace.js';
import { useToast } from '../components/common/ToastContext.js';
import Spinner from '../components/common/Spinner.js';
import { formatDateTime } from '../utils/formatDate.js';
import { Button } from '../components/common/Button.js';

// --- Status badge config ---------------------------------------------------

const BADGE_STYLES: Record<string, string> = {
  pending_review: 'bg-amber-50 text-amber-700',
  approved: 'bg-emerald-50 text-emerald-700',
  rejected: 'bg-red-50 text-red-600',
  removed: 'bg-slate-50 text-slate-500',
};

const DOT_STYLES: Record<string, string> = {
  pending_review: 'bg-amber-400',
  approved: 'bg-emerald-400',
  rejected: 'bg-red-400',
  removed: 'bg-slate-400',
};

const BADGE_LABELS: Record<string, string> = {
  pending_review: 'Pending Review',
  approved: 'Approved',
  rejected: 'Rejected',
  removed: 'Removed',
};

// Ordered tab list — "all" first, then statuses in priority order
const TAB_ORDER = ['all', 'pending_review', 'approved', 'rejected', 'removed'];

export function MySubmissionsPage() {
  const navigate = useNavigate();
  const { addToast } = useToast();
  const [submissions, setSubmissions] = useState<MySubmission[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(false);
  const [expandedIds, setExpandedIds] = useState<Set<string>>(new Set());
  const [activeTab, setActiveTab] = useState<string>('all');

  useEffect(() => {
    let cancelled = false;
    fetchMySubmissions()
      .then((data) => { if (!cancelled) setSubmissions(data); })
      .catch(() => {
        if (!cancelled) {
          setError(true);
          addToast('error', 'Failed to load submissions');
        }
      })
      .finally(() => { if (!cancelled) setLoading(false); });
    return () => { cancelled = true; };
  }, [addToast]);

  function toggleExpand(id: string) {
    setExpandedIds((prev) => {
      const next = new Set(prev);
      next.has(id) ? next.delete(id) : next.add(id);
      return next;
    });
  }

  // Count per status for tab badges
  const countsByStatus = useMemo(() => {
    const counts: Record<string, number> = {};
    for (const s of submissions) {
      counts[s.status] = (counts[s.status] ?? 0) + 1;
    }
    return counts;
  }, [submissions]);

  // Visible tabs: "all" + any status that has at least one submission
  const visibleTabs = useMemo(
    () => TAB_ORDER.filter((t) => t === 'all' || (countsByStatus[t] ?? 0) > 0),
    [countsByStatus],
  );

  const filtered = useMemo(
    () => (activeTab === 'all' ? submissions : submissions.filter((s) => s.status === activeTab)),
    [submissions, activeTab],
  );

  // Reset to "all" if the active tab disappears (e.g. after a status change)
  useEffect(() => {
    if (!visibleTabs.includes(activeTab)) setActiveTab('all');
  }, [visibleTabs, activeTab]);

  // Loading state
  if (loading) {
    return (
      <div className="flex h-full items-center justify-center">
        <Spinner />
      </div>
    );
  }

  return (
    <div className="flex flex-col gap-6 p-6">
      {/* Page header */}
      <div>
        <h1 className="text-xl font-bold text-slate-800">My Submissions</h1>
        <p className="mt-1 text-sm text-slate-500">
          Track your skill submissions to the SkillSpell Marketplace.
        </p>
      </div>

      {/* Error state */}
      {error && (
        <div className="rounded-xl border border-red-200 bg-red-50 p-4 text-sm text-red-700">
          Failed to load submissions. Refresh the page to try again.
        </div>
      )}

      {/* Empty state */}
      {!error && submissions.length === 0 && (
        <div className="flex flex-col items-center justify-center py-16 text-center">
          <svg className="h-10 w-10 text-slate-300" fill="none" viewBox="0 0 24 24" strokeWidth={1.5} stroke="currentColor">
            <path strokeLinecap="round" strokeLinejoin="round" d="M9 12h3.75M9 15h3.75M9 18h3.75m3 .75H18a2.25 2.25 0 0 0 2.25-2.25V6.108c0-1.135-.845-2.098-1.976-2.192a48.424 48.424 0 0 0-1.123-.08m-5.801 0c-.065.21-.1.433-.1.664 0 .414.336.75.75h4.5a.75.75 0 0 0 .75-.75 2.25 2.25 0 0 0-.1-.664m-5.8 0A2.251 2.251 0 0 1 13.5 2.25H15c1.012 0 1.867.668 2.15 1.586m-5.8 0c-.376.023-.75.05-1.124.08C9.095 4.01 8.25 4.973 8.25 6.108V8.25m0 0H4.875c-.621 0-1.125.504-1.125 1.125v11.25c0 .621.504 1.125 1.125 1.125h9.75c.621 0 1.125-.504 1.125-1.125V9.375c0-.621-.504-1.125-1.125-1.125H8.25Z" />
          </svg>
          <p className="mt-3 text-base font-medium text-slate-700">No submissions yet</p>
          <p className="mt-1 text-sm text-slate-500">
            When you submit a skill to the marketplace, it will appear here.
          </p>
        </div>
      )}

      {/* Tabs + Table */}
      {!error && submissions.length > 0 && (
        <div className="flex flex-col gap-0 overflow-hidden rounded-xl border border-slate-200/80 bg-white shadow-sm">
          {/* Tab bar */}
          <div className="flex border-b border-slate-100 bg-slate-50/50 px-2 pt-2">
            {visibleTabs.map((tab) => {
              const isActive = tab === activeTab;
              const count = tab === 'all' ? submissions.length : (countsByStatus[tab] ?? 0);
              return (
                <button
                  key={tab}
                  type="button"
                  onClick={() => setActiveTab(tab)}
                  className={`relative flex items-center gap-1.5 px-3 pb-2 pt-1.5 text-sm font-medium transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-indigo-500 ${
                    isActive
                      ? 'border-b-2 border-indigo-500 text-indigo-600'
                      : 'border-b-2 border-transparent text-slate-500 hover:text-slate-700'
                  }`}
                >
                  {tab === 'all' ? 'All' : (BADGE_LABELS[tab] ?? tab)}
                  <span
                    className={`rounded-full px-1.5 py-0.5 text-xs font-semibold tabular-nums ${
                      isActive
                        ? 'bg-indigo-100 text-indigo-600'
                        : 'bg-slate-100 text-slate-500'
                    }`}
                  >
                    {count}
                  </span>
                </button>
              );
            })}
          </div>

          {/* Table */}
          <table className="w-full text-left text-sm">
            <thead>
              <tr className="border-b border-slate-100 bg-slate-50/50">
                <th scope="col" className="px-4 py-3 font-medium text-slate-500">Skill</th>
                <th scope="col" className="px-4 py-3 font-medium text-slate-500">Version</th>
                <th scope="col" className="px-4 py-3 font-medium text-slate-500">Submitted</th>
                <th scope="col" className="px-4 py-3 font-medium text-slate-500">Status</th>
              </tr>
            </thead>
            <tbody>
              {filtered.map((row) => {
                const isRejected = row.status === 'rejected';
                const isRemoved = row.status === 'removed';
                const isExpandable = isRejected || isRemoved;
                const isExpanded = expandedIds.has(row.id);
                return (
                  <Fragment key={row.id}>
                    <tr
                      className={`border-b border-slate-100 last:border-0 transition-colors ${isExpandable ? 'cursor-pointer hover:bg-slate-50/50' : ''}`}
                      onClick={isExpandable ? () => toggleExpand(row.id) : undefined}
                    >
                      <td className="px-4 py-3 text-slate-700">
                        <div className="flex items-center gap-2">
                          <Button
                            type="button"
                            onClick={(e) => { e.stopPropagation(); navigate(`/skills/${row.skillId}`); }}
                            variant="link"
                            size="sm"
                          >
                            {row.skillName}
                          </Button>
                          {isExpandable && (
                            <svg
                              className={`h-4 w-4 text-slate-400 transition-transform duration-200 ${isExpanded ? 'rotate-180' : ''}`}
                              fill="none" viewBox="0 0 24 24" strokeWidth={2} stroke="currentColor"
                            >
                              <path strokeLinecap="round" strokeLinejoin="round" d="m19.5 8.25-7.5 7.5-7.5-7.5" />
                            </svg>
                          )}
                        </div>
                      </td>
                      <td className="px-4 py-3 text-slate-700">{row.version != null ? `v${row.version}` : '—'}</td>
                      <td className="px-4 py-3 text-slate-500">{formatDateTime(row.submittedAt)}</td>
                      <td className="px-4 py-3">
                        <span
                          className={`inline-flex items-center gap-1.5 rounded-full px-2.5 py-1 text-xs font-bold ${BADGE_STYLES[row.status] ?? 'bg-slate-50 text-slate-500'}`}
                          aria-label={`${BADGE_LABELS[row.status] ?? row.status} marketplace submission`}
                        >
                          <span className={`h-1.5 w-1.5 rounded-full ${DOT_STYLES[row.status] ?? 'bg-slate-400'}`} />
                          {BADGE_LABELS[row.status] ?? row.status}
                        </span>
                      </td>
                    </tr>
                    {isRejected && isExpanded && (
                      <tr className="bg-amber-50/40">
                        <td colSpan={4} className="px-4 py-3 border-b border-slate-100">
                          <p className="text-sm text-slate-700">
                            <span className="font-medium text-slate-500">Review note: </span>
                            {row.reviewNote ?? 'No review note provided.'}
                          </p>
                        </td>
                      </tr>
                    )}
                    {isRemoved && isExpanded && (
                      <tr className="bg-red-50/40">
                        <td colSpan={4} className="px-4 py-3 border-b border-slate-100">
                          <div className="flex flex-col gap-1 text-sm text-slate-700">
                            {row.reviewedAt && (
                              <p>
                                <span className="font-medium text-slate-500">Removed on: </span>
                                {formatDateTime(row.reviewedAt)}
                              </p>
                            )}
                            <p>
                              <span className="font-medium text-slate-500">Reason: </span>
                              {row.removalReason ?? 'No reason provided.'}
                            </p>
                          </div>
                        </td>
                      </tr>
                    )}
                  </Fragment>
                );
              })}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}
