/**
 * EvalRunProgress — Real-time progress display for eval runs.
 *
 * Shows:
 *   - Progress bar with "X of Y completed"
 *   - Elapsed timer
 *   - Per-eval status list with icons and scores
 *   - Cancel button
 */

import { useState, useEffect, useRef } from 'react';
import { formatElapsed } from '../../hooks/useProgressMessages.js';
import type { EvalRunProgress as EvalRunProgressState, EvalStatusEntry } from '../../hooks/useEvalRunner.js';

interface Props {
  progress: EvalRunProgressState;
  onCancel: () => void;
}

/** Status icon for each eval state. Returns JSX for animated states, string for static ones. */
function StatusIcon({ status }: { status: EvalStatusEntry['status'] }) {
  switch (status) {
    case 'pending':
      return <span>⏳</span>;
    case 'executing':
      return (
        <div className="h-3.5 w-3.5 animate-spin rounded-full border-2 border-indigo-200 border-t-indigo-600" />
      );
    case 'grading':
      return (
        <div className="h-3.5 w-3.5 animate-spin rounded-full border-2 border-amber-200 border-t-amber-600" />
      );
    case 'completed':
      return <span>✅</span>;
    case 'failed':
      return <span>❌</span>;
    default:
      return <span>⏳</span>;
  }
}

/** Badge color for the overall grading result. */
function overallBadgeClass(overall?: 'pass' | 'fail' | 'partial'): string {
  switch (overall) {
    case 'pass':
      return 'bg-emerald-100 text-emerald-700';
    case 'fail':
      return 'bg-red-100 text-red-700';
    case 'partial':
      return 'bg-amber-100 text-amber-700';
    default:
      return 'bg-slate-100 text-slate-500';
  }
}

/** Human-readable status label. */
function statusLabel(entry: EvalStatusEntry): string {
  switch (entry.status) {
    case 'pending':
      return 'Waiting…';
    case 'executing':
      return 'Running…';
    case 'grading':
      return 'Grading…';
    case 'completed':
      return entry.overall === 'pass'
        ? 'Passed'
        : entry.overall === 'fail'
          ? 'Failed'
          : entry.overall === 'partial'
            ? 'Partial'
            : 'Done';
    case 'failed':
      return 'Error';
    default:
      return '';
  }
}

export default function EvalRunProgress({ progress, onCancel }: Props) {
  const [showCancelConfirm, setShowCancelConfirm] = useState(false);
  const listRef = useRef<HTMLDivElement>(null);

  // Auto-scroll to the latest entry
  useEffect(() => {
    if (listRef.current) {
      listRef.current.scrollTop = listRef.current.scrollHeight;
    }
  }, [progress.evalStatuses.length]);

  const pct =
    progress.total > 0
      ? Math.round((progress.completed / progress.total) * 100)
      : 0;

  return (
    <div className="relative bg-white border border-slate-200 rounded-xl shadow-sm p-5 space-y-4 animate-fade-in-up">
      {/* Header row */}
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-2">
          <span className="text-lg">🧪</span>
          <span className="font-semibold text-slate-800">Running Evals</span>
          {progress.running && (
            <span className="inline-block w-2 h-2 rounded-full bg-blue-500 animate-pulse" />
          )}
        </div>
        <div className="flex items-center gap-3">
          <span className="text-xs text-slate-400 font-medium tabular-nums">
            ⏱ {formatElapsed(progress.elapsed)}
          </span>
          {progress.running && (
            <button
              onClick={() => setShowCancelConfirm(true)}
              className="text-xs text-red-500 hover:text-red-700 font-medium px-2 py-1 rounded hover:bg-red-50 transition-colors"
            >
              Cancel
            </button>
          )}
        </div>
      </div>

      {/* Progress bar */}
      <div className="space-y-1.5">
        <div className="flex items-center justify-between text-xs text-slate-500">
          <span>
            {progress.completed} of {progress.total} completed
          </span>
          <span className="tabular-nums">{pct}%</span>
        </div>
        <div className="w-full bg-slate-100 rounded-full h-2 overflow-hidden">
          <div
            className="h-full bg-blue-500 rounded-full transition-all duration-500 ease-out"
            style={{ width: `${pct}%` }}
          />
        </div>
      </div>

      {/* Per-eval status list */}
      {progress.evalStatuses.length > 0 && (
        <div
          ref={listRef}
          className="max-h-64 overflow-y-auto space-y-1 pr-1 scrollbar-thin scrollbar-thumb-slate-200"
        >
          {progress.evalStatuses.map((entry) => (
            <div
              key={entry.index}
              className={`flex items-center gap-2 px-3 py-1.5 rounded-lg text-sm transition-colors ${
                entry.status === 'executing' || entry.status === 'grading'
                  ? 'bg-blue-50'
                  : entry.status === 'completed' || entry.status === 'failed'
                    ? 'bg-slate-50'
                    : ''
              }`}
            >
              {/* Status icon */}
              <span className="flex-shrink-0 text-sm flex items-center justify-center w-4">
                <StatusIcon status={entry.status} />
              </span>

              {/* Eval name */}
              <span
                className={`flex-1 truncate ${
                  entry.status === 'executing' || entry.status === 'grading'
                    ? 'text-blue-700 font-medium'
                    : entry.status === 'pending'
                      ? 'text-slate-400'
                      : 'text-slate-700'
                }`}
              >
                {entry.evalName}
              </span>

              {/* Status label / score */}
              <span className="flex-shrink-0 text-xs text-slate-500">
                {entry.status === 'executing' || entry.status === 'grading' ? (
                  <span className="text-blue-600">{statusLabel(entry)}</span>
                ) : entry.status === 'completed' || entry.status === 'failed' ? (
                  <span className="flex items-center gap-1.5">
                    {entry.score != null && (
                      <span
                        className={`px-1.5 py-0.5 rounded text-[10px] font-semibold ${overallBadgeClass(
                          entry.overall,
                        )}`}
                      >
                        {entry.score}
                      </span>
                    )}
                    {entry.durationMs != null && (
                      <span className="text-slate-400 tabular-nums">
                        {(entry.durationMs / 1000).toFixed(1)}s
                      </span>
                    )}
                  </span>
                ) : (
                  <span className="text-slate-400">{statusLabel(entry)}</span>
                )}
              </span>
            </div>
          ))}
        </div>
      )}

      {/* Error message */}
      {progress.error && (
        <div className="text-sm text-red-600 bg-red-50 rounded-lg px-3 py-2">
          ⚠️ {progress.error}
        </div>
      )}

      {/* Cancel confirmation dialog — rendered over the progress card */}
      {showCancelConfirm && (
        <div className="absolute inset-0 z-10 flex items-center justify-center bg-white/80 backdrop-blur-[2px] rounded-xl">
          <div className="bg-white border border-slate-200 rounded-xl shadow-lg p-5 mx-4 max-w-sm w-full space-y-3 animate-scale-in">
            <p className="text-sm font-semibold text-slate-800">Cancel eval run?</p>
            <p className="text-xs text-slate-500">
              {progress.completed} of {progress.total} evals have completed.
              Completed results will be kept, but remaining evals will be skipped.
            </p>
            <div className="flex items-center justify-end gap-2 pt-1">
              <button
                onClick={() => setShowCancelConfirm(false)}
                className="text-xs font-medium text-slate-600 hover:text-slate-800 px-3 py-1.5 rounded-lg hover:bg-slate-100 transition-colors"
              >
                Continue Running
              </button>
              <button
                onClick={() => {
                  setShowCancelConfirm(false);
                  onCancel();
                }}
                className="text-xs font-medium text-white bg-red-500 hover:bg-red-600 px-3 py-1.5 rounded-lg transition-colors"
              >
                Yes, Cancel
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
