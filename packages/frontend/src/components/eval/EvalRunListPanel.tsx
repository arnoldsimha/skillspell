import { useMemo, useState } from 'react';
import type { EvalRun, EvalCase, EvalGrading } from '@skillspell/shared';
import type { ComparisonSuggestion } from '../../utils/comparisonRanker.js';
import { formatDuration } from '../../utils/formatDuration.js';
import { InfoTip } from '../common/InfoTip.js';
import { formatDateWithPrefs } from '../../utils/formatDate.js';
import { useUserPreferences } from '../../hooks/useUserPreferences.js';

interface EvalRunListPanelProps {
  /** All available runs (already filtered by version if needed). */
  runs: EvalRun[];
  /** All eval cases for resolving names. */
  evalCases: EvalCase[];
  /** Index of the currently viewed run. */
  currentIndex: number;
  /** Navigate to a run by its array index. */
  onGoToIndex: (index: number) => void;

  // Comparison selection
  selectedRunIds: Set<string>;
  onToggleRunSelection: (runId: string) => void;
  onClearRunSelection: () => void;
  onCompare: () => void;
  /** Run ID in slot A (used to determine which runs are selectable). */
  slotA?: string | null;
  /** Error message when a selection was blocked (e.g., cross-case). */
  selectionError?: string | null;

  // Smart suggestions (Phase 3)
  /** Ranked suggestions for slot B when slot A is filled. */
  comparisonSuggestions?: ComparisonSuggestion[];
  /** One-click compare: sets A to this run and auto-picks best B. */
  onQuickCompare?: (runId: string) => void;
  /** Select a suggestion for slot B. */
  onSelectSuggestion?: (runId: string) => void;
}

interface RunGroup {
  evalId: string;
  caseName: string;
  runs: Array<{ run: EvalRun; globalIndex: number }>;
}

/**
 * Left-side panel listing all eval runs, grouped by test case.
 * Users can click to navigate, and check two runs for comparison.
 */
export function EvalRunListPanel({
  runs,
  evalCases,
  currentIndex,
  onGoToIndex,
  selectedRunIds,
  onToggleRunSelection,
  onClearRunSelection,
  onCompare,
  slotA,
  selectionError,
  comparisonSuggestions = [],
  onQuickCompare,
  onSelectSuggestion,
}: EvalRunListPanelProps) {
  const { prefs } = useUserPreferences();
  const [collapsedGroups, setCollapsedGroups] = useState<Set<string>>(new Set());

  // Group runs by their eval case (test case)
  const groups: RunGroup[] = useMemo(() => {
    const map = new Map<string, RunGroup>();

    runs.forEach((run, globalIndex) => {
      const existing = map.get(run.evalId);
      if (existing) {
        existing.runs.push({ run, globalIndex });
      } else {
        const evalCase = evalCases.find((ec) => ec.id === run.evalId);
        map.set(run.evalId, {
          evalId: run.evalId,
          caseName: evalCase?.name || `Test ${run.evalId.slice(0, 6)}…`,
          runs: [{ run, globalIndex }],
        });
      }
    });

    return Array.from(map.values());
  }, [runs, evalCases]);

  const toggleGroup = (evalId: string) => {
    setCollapsedGroups((prev) => {
      const next = new Set(prev);
      if (next.has(evalId)) {
        next.delete(evalId);
      } else {
        next.add(evalId);
      }
      return next;
    });
  };

  // currentIndex is used for navigation; individual run is accessed via runs[currentIndex] directly

  // Derive whether we have a valid comparison pair (exactly 2 selected)
  const canCompare = selectedRunIds.size === 2;

  // Check if comparison is meaningful — need at least 2 runs total
  const hasEnoughRuns = runs.length >= 2;

  // Check if any test case has multiple runs (same case, different version/iteration)
  const hasMultiRunGroup = useMemo(
    () => groups.some((g) => g.runs.length >= 2),
    [groups],
  );

  // Determine the evalId of slot A to disable cross-case checkboxes
  const slotAEvalId = useMemo(() => {
    if (!slotA) return null;
    return runs.find((r) => r.id === slotA)?.evalId ?? null;
  }, [slotA, runs]);

  if (runs.length === 0) {
    return (
      <div className="flex flex-col items-center justify-center h-full p-4 text-center">
        <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-slate-100 mb-3">
          <svg className="h-5 w-5 text-slate-400" fill="none" viewBox="0 0 24 24" strokeWidth={1.5} stroke="currentColor">
            <path strokeLinecap="round" strokeLinejoin="round" d="M3 13.125C3 12.504 3.504 12 4.125 12h2.25c.621 0 1.125.504 1.125 1.125v6.75C7.5 20.496 6.996 21 6.375 21h-2.25A1.125 1.125 0 0 1 3 19.875v-6.75ZM9.75 8.625c0-.621.504-1.125 1.125-1.125h2.25c.621 0 1.125.504 1.125 1.125v11.25c0 .621-.504 1.125-1.125 1.125h-2.25a1.125 1.125 0 0 1-1.125-1.125V8.625ZM16.5 4.125c0-.621.504-1.125 1.125-1.125h2.25C20.496 3 21 3.504 21 4.125v15.75c0 .621-.504 1.125-1.125 1.125h-2.25a1.125 1.125 0 0 1-1.125-1.125V4.125Z" />
          </svg>
        </div>
        <p className="text-xs text-slate-500 font-medium">No runs yet</p>
        <p className="text-[10px] text-slate-400 mt-1">Run evals to see results here</p>
      </div>
    );
  }

  return (
    <div className="flex flex-col h-full">
      {/* Comparison bar */}
      <div className={`px-3 py-2.5 border-b transition-colors duration-200 ${
        selectedRunIds.size > 0
          ? 'bg-purple-50/80 border-purple-200/60'
          : 'bg-slate-50/80 border-slate-200/60'
      }`}>
        <div className="flex items-center justify-between mb-1.5">
          <div className="flex items-center gap-1.5">
            <svg className="h-3.5 w-3.5 text-purple-500" fill="none" viewBox="0 0 24 24" strokeWidth={2} stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" d="M7.5 21 3 16.5m0 0L7.5 12M3 16.5h13.5m0-13.5L21 7.5m0 0L16.5 12M21 7.5H7.5" />
            </svg>
            <span className="text-[10px] font-bold text-slate-600 uppercase tracking-wider">Compare</span>
            {hasEnoughRuns && (
              <InfoTip text="Check two runs below to compare them side by side. For meaningful results, compare runs of the same test case across different skill versions." size="h-3 w-3" />
            )}
          </div>
        </div>

        {/* Guidance when comparison isn't possible (only 1 run) */}
        {!hasEnoughRuns && (
          <div className="flex items-start gap-2 px-1 py-1">
            <svg className="h-3.5 w-3.5 text-slate-400 shrink-0 mt-0.5" fill="none" viewBox="0 0 24 24" strokeWidth={2} stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" d="m11.25 11.25.041-.02a.75.75 0 0 1 1.063.852l-.708 2.836a.75.75 0 0 0 1.063.853l.041-.021M21 12a9 9 0 1 1-18 0 9 9 0 0 1 18 0Zm-9-3.75h.008v.008H12V8.25Z" />
            </svg>
            <p className="text-[10px] text-slate-500 leading-tight">
              Only 1 run available. To compare, run evals on a different skill version or re-run to see variance.
            </p>
          </div>
        )}

        {/* Selection slots — visible whenever ≥ 2 runs exist */}
        {hasEnoughRuns && (
          <>
            {/* Hint when no test case has multiple runs */}
            {!hasMultiRunGroup && selectedRunIds.size === 0 && (
              <div className="flex items-start gap-1.5 px-1 py-1 mb-1.5">
                <svg className="h-3 w-3 text-blue-400 shrink-0 mt-0.5" fill="none" viewBox="0 0 24 24" strokeWidth={2} stroke="currentColor">
                  <path strokeLinecap="round" strokeLinejoin="round" d="m11.25 11.25.041-.02a.75.75 0 0 1 1.063.852l-.708 2.836a.75.75 0 0 0 1.063.853l.041-.021M21 12a9 9 0 1 1-18 0 9 9 0 0 1 18 0Zm-9-3.75h.008v.008H12V8.25Z" />
                </svg>
                <p className="text-[10px] text-blue-500 leading-tight">
                  Each test has only 1 run. For best results, edit the skill → re-run evals → compare same test across versions.
                </p>
              </div>
            )}

            <div className="space-y-1">
              {Array.from(selectedRunIds).map((runId, idx) => {
                const run = runs.find((r) => r.id === runId);
                const caseName = run && evalCases.find((ec) => ec.id === run.evalId)?.name;
                const label = caseName
                  ? `${caseName}${run?.skillVersion ? ` · v${run.skillVersion}` : ''}`
                  : `Run ${runId.slice(0, 6)}…`;
                const runGlobalIndex = runs.findIndex((r) => r.id === runId);
                return (
                  <div
                    key={runId}
                    onClick={() => { if (runGlobalIndex >= 0) onGoToIndex(runGlobalIndex); }}
                    className="flex items-center gap-1.5 px-2 py-1 rounded-lg bg-white border border-purple-200 text-[10px] cursor-pointer hover:bg-purple-50/50 transition-colors"
                  >
                    <span className="font-bold text-purple-500 w-3 shrink-0">{idx === 0 ? 'A' : 'B'}</span>
                    <span className="text-purple-700 font-medium truncate flex-1">{label}</span>
                    <ScoreBadgeMini grading={run?.grading} />
                    <button
                      onClick={(e) => { e.stopPropagation(); onToggleRunSelection(runId); }}
                      className="text-purple-400 hover:text-purple-700 transition-colors shrink-0"
                      title="Deselect"
                    >
                      ×
                    </button>
                  </div>
                );
              })}
              {selectedRunIds.size < 2 && (
                <div className="flex items-center gap-1.5 px-2 py-1 rounded-lg border border-dashed border-slate-300 text-[10px] text-slate-400">
                  <span className="font-bold w-3 shrink-0">{selectedRunIds.size === 0 ? 'A' : 'B'}</span>
                  <span className="italic">
                    {selectedRunIds.size === 0 ? 'Check a run below…' : 'Check one more…'}
                  </span>
                </div>
              )}

              {/* Smart suggestions for slot B */}
              {selectedRunIds.size === 1 && comparisonSuggestions.length > 0 && (
                <div className="mt-2">
                  <div className="flex items-center gap-1 mb-1">
                    <svg className="h-3 w-3 text-amber-500" fill="none" viewBox="0 0 24 24" strokeWidth={2} stroke="currentColor">
                      <path strokeLinecap="round" strokeLinejoin="round" d="M12 18v-5.25m0 0a6.01 6.01 0 0 0 1.5-.189m-1.5.189a6.01 6.01 0 0 1-1.5-.189m3.75 7.478a12.06 12.06 0 0 1-4.5 0m3.75 2.383a14.406 14.406 0 0 1-3 0M14.25 18v-.192c0-.983.658-1.823 1.508-2.316a7.5 7.5 0 1 0-7.517 0c.85.493 1.509 1.333 1.509 2.316V18" />
                    </svg>
                    <span className="text-[10px] font-semibold text-slate-500 uppercase tracking-wider">Suggestions</span>
                    <InfoTip text="Smart suggestions for slot B based on version adjacency, score changes, and re-run variance" size="h-3 w-3" />
                  </div>
                  <div className="space-y-0.5">
                    {comparisonSuggestions.map((s) => (
                      <button
                        key={s.runId}
                        onClick={() => onSelectSuggestion?.(s.runId)}
                        className="w-full flex items-center gap-1.5 px-2 py-1 rounded-lg text-[10px] hover:bg-purple-50/80 border border-transparent hover:border-purple-200 transition-all duration-150 text-left group"
                        title={`Click to set as slot B: ${s.reason}`}
                      >
                        <PriorityBadge priority={s.priority} />
                        <span className="text-slate-600 font-medium truncate flex-1">{s.label}</span>
                        <span className="text-slate-400 group-hover:text-purple-500 truncate max-w-[100px]">{s.reason}</span>
                      </button>
                    ))}
                  </div>
                </div>
              )}
            </div>

            {/* Selection error banner (e.g., cross-case blocked) */}
            {selectionError && (
              <div className="flex items-start gap-1.5 mt-1.5 px-1 animate-pulse">
                <svg className="h-3 w-3 text-red-500 shrink-0 mt-0.5" fill="none" viewBox="0 0 24 24" strokeWidth={2} stroke="currentColor">
                  <path strokeLinecap="round" strokeLinejoin="round" d="M12 9v3.75m-9.303 3.376c-.866 1.5.217 3.374 1.948 3.374h14.71c1.73 0 2.813-1.874 1.948-3.374L13.949 3.378c-.866-1.5-3.032-1.5-3.898 0L2.697 16.126ZM12 15.75h.007v.008H12v-.008Z" />
                </svg>
                <p className="text-[10px] text-red-600 leading-tight font-medium">
                  {selectionError}
                </p>
              </div>
            )}

            {/* Compare + Clear row */}
            {selectedRunIds.size > 0 && (
              <div className="flex items-center gap-2 mt-2">
                {canCompare && (
                  <button
                    onClick={onCompare}
                    className="flex-1 flex items-center justify-center gap-1.5 rounded-lg px-3 py-1.5 text-xs font-semibold bg-purple-600 text-white shadow-sm hover:bg-purple-700 transition-all duration-200"
                  >
                    <svg className="h-3.5 w-3.5" fill="none" viewBox="0 0 24 24" strokeWidth={2} stroke="currentColor">
                      <path strokeLinecap="round" strokeLinejoin="round" d="M7.5 21 3 16.5m0 0L7.5 12M3 16.5h13.5m0-13.5L21 7.5m0 0L16.5 12M21 7.5H7.5" />
                    </svg>
                    Compare Selected
                  </button>
                )}
                <button
                  onClick={onClearRunSelection}
                  className="rounded-lg px-2.5 py-1.5 text-[10px] font-medium text-purple-400 hover:text-purple-600 hover:bg-purple-100/50 transition-colors"
                >
                  Clear
                </button>
              </div>
            )}
          </>
        )}
      </div>

      {/* Run list grouped by test case */}
      <div className="flex-1 overflow-y-auto">
        {groups.map((group) => {
          const isCollapsed = collapsedGroups.has(group.evalId);

          return (
            <div key={group.evalId}>
              {/* Group header */}
              <button
                onClick={() => toggleGroup(group.evalId)}
                className="w-full flex items-center gap-2 px-3 py-2 bg-slate-50/80 border-b border-slate-200/60 hover:bg-slate-100/80 transition-colors text-left"
              >
                <svg
                  className={`h-3 w-3 text-slate-400 transition-transform duration-200 ${isCollapsed ? '' : 'rotate-90'}`}
                  fill="none"
                  viewBox="0 0 24 24"
                  strokeWidth={2.5}
                  stroke="currentColor"
                >
                  <path strokeLinecap="round" strokeLinejoin="round" d="m8.25 4.5 7.5 7.5-7.5 7.5" />
                </svg>
                <span className="text-xs font-semibold text-slate-700 truncate flex-1">{group.caseName}</span>
                <span className="text-[10px] text-slate-400 font-medium shrink-0">
                  {group.runs.length} run{group.runs.length !== 1 ? 's' : ''}
                </span>
              </button>

              {/* Run rows */}
              {!isCollapsed && group.runs.map(({ run, globalIndex }) => {
                const isActive = globalIndex === currentIndex;
                const isSelected = selectedRunIds.has(run.id);
                // Disable checkbox if slot A is filled and this run is from a different test case
                const isCrossCaseDisabled = slotAEvalId !== null && !isSelected && run.evalId !== slotAEvalId;

                return (
                  <div
                    key={run.id}
                    onClick={() => onGoToIndex(globalIndex)}
                    className={`group flex items-center gap-2 px-3 py-2 border-b border-slate-100 cursor-pointer transition-all duration-150 ${
                      isActive
                        ? 'bg-indigo-50/80 border-l-2 border-l-indigo-500'
                        : 'hover:bg-slate-50/80 border-l-2 border-l-transparent'
                    } ${isCrossCaseDisabled ? 'opacity-50' : ''}`}
                  >
                    {/* Selection checkbox */}
                    <input
                      type="checkbox"
                      checked={isSelected}
                      disabled={isCrossCaseDisabled}
                      onChange={(e) => {
                        e.stopPropagation();
                        onToggleRunSelection(run.id);
                      }}
                      onClick={(e) => e.stopPropagation()}
                      className="h-3.5 w-3.5 rounded border-slate-300 text-purple-600 focus:ring-purple-500 cursor-pointer shrink-0 disabled:cursor-not-allowed disabled:opacity-50"
                      title={isCrossCaseDisabled ? 'Only runs from the same test case can be compared' : 'Select for comparison'}
                    />

                    {/* Run info */}
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center gap-1.5">
                        {run.skillVersion && (
                          <span className="inline-flex items-center px-1.5 py-0.5 rounded-md bg-slate-100 text-slate-600 text-[10px] font-semibold shrink-0">
                            v{run.skillVersion}
                          </span>
                        )}
                        <ScoreBadgeMini grading={run.grading} />
                        <ClaimsBadgeMini grading={run.grading} />
                        <StatusDotMini status={run.status} />
                      </div>
                      <div className="text-[10px] text-slate-400 mt-0.5 truncate">
                        {formatDateWithPrefs(run.createdAt, prefs)}
                        {run.timing?.durationMs != null && (
                          <span className="ml-1">· {formatDuration(run.timing.durationMs)}</span>
                        )}
                      </div>
                    </div>

                    {/* Quick compare button */}
                    {onQuickCompare && !isCrossCaseDisabled && !isSelected && group.runs.length >= 2 && (
                      <button
                        onClick={(e) => {
                          e.stopPropagation();
                          onQuickCompare(run.id);
                        }}
                        className="opacity-0 group-hover:opacity-100 p-1 rounded-md text-slate-400 hover:text-purple-600 hover:bg-purple-50 transition-all duration-150 shrink-0"
                        title="Quick compare — auto-pick the best run to compare against"
                      >
                        <svg className="h-3.5 w-3.5" fill="none" viewBox="0 0 24 24" strokeWidth={2} stroke="currentColor">
                          <path strokeLinecap="round" strokeLinejoin="round" d="M7.5 21 3 16.5m0 0L7.5 12M3 16.5h13.5m0-13.5L21 7.5m0 0L16.5 12M21 7.5H7.5" />
                        </svg>
                      </button>
                    )}
                  </div>
                );
              })}
            </div>
          );
        })}
      </div>

      {/* Footer summary */}
      <div className="px-3 py-2 border-t border-slate-200/80 bg-slate-50/80">
        <div className="text-[10px] text-slate-400 text-center">
          {runs.length} run{runs.length !== 1 ? 's' : ''} · {groups.length} test case{groups.length !== 1 ? 's' : ''}
        </div>
      </div>
    </div>
  );
}

/* ─── Mini Helper Components ──────────────────────────────────────────── */

function ScoreBadgeMini({ grading }: { grading?: { overall: string; score: number } }) {
  if (!grading) return null;
  const config: Record<string, string> = {
    pass: 'text-emerald-700 bg-emerald-50',
    fail: 'text-red-700 bg-red-50',
    partial: 'text-amber-700 bg-amber-50',
  };
  const icon = grading.overall === 'pass' ? '✓' : grading.overall === 'fail' ? '✗' : '~';
  return (
    <span className={`inline-flex items-center gap-0.5 px-1.5 py-0.5 rounded-md text-[10px] font-semibold ${config[grading.overall] || config.partial}`}>
      {icon} {grading.score}
    </span>
  );
}

function StatusDotMini({ status }: { status: string }) {
  const colors: Record<string, string> = {
    completed: 'bg-emerald-400',
    failed: 'bg-red-400',
    running: 'bg-indigo-400 animate-pulse',
    pending: 'bg-slate-300',
  };
  return (
    <span
      className={`inline-block h-1.5 w-1.5 rounded-full shrink-0 ${colors[status] || colors.pending}`}
      title={status}
    />
  );
}

function ClaimsBadgeMini({ grading }: { grading?: EvalGrading }) {
  const claims = grading?.extractedClaims;
  if (!claims || claims.length === 0) return null;
  const unverified = claims.filter((c) => !c.verified).length;
  if (unverified === 0) return null;
  return (
    <span
      className="inline-flex items-center gap-0.5 px-1 py-0.5 rounded-md text-[9px] font-semibold bg-red-50 text-red-600"
      title={`${unverified} unverified claim${unverified !== 1 ? 's' : ''} found in output`}
    >
      ⚠ {unverified}
    </span>
  );
}

function PriorityBadge({ priority }: { priority: number }) {
  const configs: Record<number, { bg: string; text: string; label: string }> = {
    1: { bg: 'bg-emerald-50', text: 'text-emerald-700', label: '★' },
    2: { bg: 'bg-amber-50', text: 'text-amber-700', label: '▲' },
    3: { bg: 'bg-blue-50', text: 'text-blue-600', label: '◆' },
    4: { bg: 'bg-slate-100', text: 'text-slate-600', label: '↻' },
    5: { bg: 'bg-slate-50', text: 'text-slate-400', label: '=' },
  };
  const c = configs[priority] ?? configs[5];
  return (
    <span
      className={`inline-flex items-center justify-center h-4 w-4 rounded text-[9px] font-bold shrink-0 ${c.bg} ${c.text}`}
      title={`Priority ${priority}`}
    >
      {c.label}
    </span>
  );
}

