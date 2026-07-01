import { useState, useRef, useEffect } from 'react';
import type { EvalRun, EvalCase } from '@skillspell/shared';
import { formatDuration } from '../../utils/formatDuration.js';
import { formatDateWithPrefs } from '../../utils/formatDate.js';
import { useUserPreferences } from '../../hooks/useUserPreferences.js';

interface EvalNavigationProps {
  currentIndex: number;
  totalRuns: number;
  hasPrev: boolean;
  hasNext: boolean;
  onPrev: () => void;
  onNext: () => void;
  evalName?: string;

  // Enriched metadata (Phase 4.1)
  skillVersion?: number;
  grading?: { overall: string; score: number };
  timing?: { durationMs: number; totalTokens: number };
  createdAt?: string;

  // Mini run picker (Phase 4.2)
  runs?: EvalRun[];
  evalCases?: EvalCase[];
  onGoToIndex?: (index: number) => void;
}

/**
 * Prev/Next navigation bar with enriched metadata and a mini run picker.
 * Shows version, score, timing, and date for the current run.
 * Click the counter to open a dropdown that lists all runs for quick jumping.
 */
export function EvalNavigation({
  currentIndex,
  totalRuns,
  hasPrev,
  hasNext,
  onPrev,
  onNext,
  evalName,
  skillVersion,
  grading,
  timing,
  createdAt,
  runs,
  evalCases,
  onGoToIndex,
}: EvalNavigationProps) {
  const { prefs } = useUserPreferences();
  const [pickerOpen, setPickerOpen] = useState(false);
  const pickerRef = useRef<HTMLDivElement>(null);

  // Close picker on outside click
  useEffect(() => {
    if (!pickerOpen) return;
    const handleClick = (e: MouseEvent) => {
      if (pickerRef.current && !pickerRef.current.contains(e.target as Node)) {
        setPickerOpen(false);
      }
    };
    document.addEventListener('mousedown', handleClick);
    return () => document.removeEventListener('mousedown', handleClick);
  }, [pickerOpen]);

  // Close picker on Escape
  useEffect(() => {
    if (!pickerOpen) return;
    const handleKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') setPickerOpen(false);
    };
    document.addEventListener('keydown', handleKey);
    return () => document.removeEventListener('keydown', handleKey);
  }, [pickerOpen]);

  const hasRunPicker = runs && runs.length > 1 && onGoToIndex;

  return (
    <nav
      className="flex items-center justify-between px-6 py-3 bg-white border-b border-slate-200/80"
      aria-label="Eval run navigation"
    >
      {/* Prev button */}
      <button
        onClick={onPrev}
        disabled={!hasPrev}
        aria-label="Previous run"
        className={`flex items-center gap-1.5 rounded-xl px-3.5 py-2 text-sm font-medium transition-all duration-200 ${
          hasPrev
            ? 'bg-slate-100 hover:bg-slate-200 text-slate-700'
            : 'bg-slate-50 text-slate-400 cursor-not-allowed'
        }`}
      >
        <svg className="h-4 w-4" fill="none" viewBox="0 0 24 24" strokeWidth={2} stroke="currentColor">
          <path strokeLinecap="round" strokeLinejoin="round" d="M15.75 19.5 8.25 12l7.5-7.5" />
        </svg>
        <span>Previous</span>
      </button>

      {/* Center info */}
      <div className="text-center relative" ref={pickerRef}>
        {/* Counter — clickable when run picker is available */}
        <div className="font-semibold text-slate-800">
          {hasRunPicker ? (
            <button
              onClick={() => setPickerOpen((v) => !v)}
              className="inline-flex items-center gap-1.5 px-2 py-0.5 rounded-lg hover:bg-slate-100 transition-colors"
              title="Click to jump to any run"
            >
              <span className="text-indigo-600">{currentIndex + 1}</span>
              <span className="text-slate-400">of</span>
              <span>{totalRuns}</span>
              <svg className={`h-3 w-3 text-slate-400 transition-transform duration-200 ${pickerOpen ? 'rotate-180' : ''}`} fill="none" viewBox="0 0 24 24" strokeWidth={2.5} stroke="currentColor">
                <path strokeLinecap="round" strokeLinejoin="round" d="m19.5 8.25-7.5 7.5-7.5-7.5" />
              </svg>
            </button>
          ) : (
            <>
              <span className="text-indigo-600">{currentIndex + 1}</span>
              <span className="text-slate-400 mx-1">of</span>
              <span>{totalRuns}</span>
            </>
          )}
        </div>

        {/* Enriched metadata line */}
        <div className="flex items-center justify-center gap-1.5 mt-0.5 flex-wrap">
          {evalName && (
            <span className="text-xs text-slate-500 font-medium">{evalName}</span>
          )}
          {skillVersion != null && (
            <>
              {evalName && <span className="text-slate-300">·</span>}
              <span className="inline-flex items-center px-1.5 py-0.5 rounded-md bg-slate-100 text-slate-600 text-[10px] font-semibold">
                v{skillVersion}
              </span>
            </>
          )}
          {grading && (
            <>
              <span className="text-slate-300">·</span>
              <GradingPill overall={grading.overall} score={grading.score} />
            </>
          )}
        </div>

        {/* Secondary metadata line: date, duration, tokens */}
        {(createdAt || timing) && (
          <div className="flex items-center justify-center gap-1.5 mt-0.5 text-[10px] text-slate-400">
            {createdAt && <span>{formatDateWithPrefs(createdAt, prefs)}</span>}
            {timing?.durationMs != null && (
              <>
                <span className="text-slate-300">·</span>
                <span>{formatDuration(timing.durationMs)}</span>
              </>
            )}
            {timing?.totalTokens != null && (
              <>
                <span className="text-slate-300">·</span>
                <span>{timing.totalTokens.toLocaleString()} tokens</span>
              </>
            )}
          </div>
        )}

        {/* Keyboard hint */}
        <div className="text-[10px] text-slate-400 mt-1">
          Use <kbd className="px-1.5 py-0.5 rounded-md bg-slate-100 border border-slate-200 text-slate-500 font-mono">←</kbd>{' '}
          <kbd className="px-1.5 py-0.5 rounded-md bg-slate-100 border border-slate-200 text-slate-500 font-mono">→</kbd>{' '}
          to navigate
        </div>

        {/* Mini run picker dropdown */}
        {pickerOpen && hasRunPicker && (
          <div className="absolute top-full left-1/2 -translate-x-1/2 mt-2 w-72 max-h-64 overflow-y-auto rounded-xl border border-slate-200 bg-white shadow-xl z-50 py-1">
            {runs.map((run, idx) => {
              const caseName = evalCases?.find((ec) => ec.id === run.evalId)?.name;
              const isActive = idx === currentIndex;
              return (
                <button
                  key={run.id}
                  onClick={() => {
                    onGoToIndex(idx);
                    setPickerOpen(false);
                  }}
                  className={`w-full flex items-center gap-2 px-3 py-1.5 text-left transition-colors ${
                    isActive
                      ? 'bg-indigo-50 text-indigo-700'
                      : 'hover:bg-slate-50 text-slate-700'
                  }`}
                >
                  <span className={`text-[10px] font-bold w-5 text-right shrink-0 ${isActive ? 'text-indigo-600' : 'text-slate-400'}`}>
                    {idx + 1}
                  </span>
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-1.5">
                      {caseName && (
                        <span className="text-xs font-medium truncate">{caseName}</span>
                      )}
                      {run.skillVersion != null && (
                        <span className="inline-flex items-center px-1 py-0.5 rounded bg-slate-100 text-[9px] font-semibold text-slate-500 shrink-0">
                          v{run.skillVersion}
                        </span>
                      )}
                    </div>
                  </div>
                  {run.grading && (
                    <GradingPill overall={run.grading.overall} score={run.grading.score} />
                  )}
                </button>
              );
            })}
          </div>
        )}
      </div>

      {/* Next button */}
      <button
        onClick={onNext}
        disabled={!hasNext}
        aria-label="Next run"
        className={`flex items-center gap-1.5 rounded-xl px-3.5 py-2 text-sm font-medium transition-all duration-200 ${
          hasNext
            ? 'bg-slate-100 hover:bg-slate-200 text-slate-700'
            : 'bg-slate-50 text-slate-400 cursor-not-allowed'
        }`}
      >
        <span>Next</span>
        <svg className="h-4 w-4" fill="none" viewBox="0 0 24 24" strokeWidth={2} stroke="currentColor">
          <path strokeLinecap="round" strokeLinejoin="round" d="m8.25 4.5 7.5 7.5-7.5 7.5" />
        </svg>
      </button>
    </nav>
  );
}

/* ─── Helper Components ──────────────────────────────────────────────── */

function GradingPill({ overall, score }: { overall: string; score: number }) {
  const config: Record<string, string> = {
    pass: 'text-emerald-700 bg-emerald-50',
    fail: 'text-red-700 bg-red-50',
    partial: 'text-amber-700 bg-amber-50',
  };
  const icon = overall === 'pass' ? '✓' : overall === 'fail' ? '✗' : '~';
  return (
    <span className={`inline-flex items-center gap-0.5 px-1.5 py-0.5 rounded-md text-[10px] font-semibold shrink-0 ${config[overall] || config.partial}`}>
      {icon} {score}
    </span>
  );
}

