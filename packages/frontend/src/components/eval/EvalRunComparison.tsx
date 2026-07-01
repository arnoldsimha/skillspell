import React, { useMemo } from 'react';
import type { EvalRun, EvalCase, EvalAssertionResult } from '@skillspell/shared';
import { computeWordDiff } from '../../utils/diff.js';
import { formatDuration } from '../../utils/formatDuration.js';
import { InfoTip } from '../common/InfoTip.js';
import { EvalGrades } from './EvalGrades.js';
import { useUserPreferences } from '../../hooks/useUserPreferences.js';
import { formatDateWithPrefs } from '../../utils/formatDate.js';

interface EvalRunComparisonProps {
  runA: EvalRun;
  runB: EvalRun;
  evalCases: EvalCase[];
  onClose: () => void;
}

/**
 * Side-by-side comparison of two eval runs.
 * Shows output diff, grading comparison, and assertion flip summary.
 *
 * Performance: wrapped in React.memo; diff is memoized.
 */
export const EvalRunComparison = React.memo(function EvalRunComparison({
  runA,
  runB,
  evalCases,
  onClose,
}: EvalRunComparisonProps) {
  const { prefs } = useUserPreferences();
  const caseA = evalCases.find((c) => c.id === runA.evalId);
  const caseB = evalCases.find((c) => c.id === runB.evalId);

  // Memoize the word diff between the two outputs
  const outputDiff = useMemo(
    () => computeWordDiff(runA.outputWithSkill, runB.outputWithSkill),
    [runA.outputWithSkill, runB.outputWithSkill],
  );

  // Compute assertion flip summary
  const flips = useMemo(() => {
    const resultsA = runA.grading.assertionResults;
    const resultsB = runB.grading.assertionResults;
    let improved = 0;
    let regressed = 0;
    let unchanged = 0;

    const maxLen = Math.max(resultsA.length, resultsB.length);
    const details: Array<{
      label: string;
      passedA: boolean;
      passedB: boolean;
      flip: 'improved' | 'regressed' | 'unchanged';
    }> = [];

    for (let i = 0; i < maxLen; i++) {
      const a: EvalAssertionResult | undefined = resultsA[i];
      const b: EvalAssertionResult | undefined = resultsB[i];
      const pA = a?.passed ?? false;
      const pB = b?.passed ?? false;
      const label = b?.assertion?.value || a?.assertion?.value || `Assertion ${i + 1}`;

      if (!pA && pB) {
        improved++;
        details.push({ label, passedA: pA, passedB: pB, flip: 'improved' });
      } else if (pA && !pB) {
        regressed++;
        details.push({ label, passedA: pA, passedB: pB, flip: 'regressed' });
      } else {
        unchanged++;
        details.push({ label, passedA: pA, passedB: pB, flip: 'unchanged' });
      }
    }

    return { improved, regressed, unchanged, details };
  }, [runA.grading.assertionResults, runB.grading.assertionResults]);

  return (
    <div className="flex flex-col h-full">
      {/* Header */}
      <div className="flex items-center justify-between px-6 py-4 border-b border-slate-200/80 bg-white">
        <div className="flex items-center gap-3">
          <div className="flex h-8 w-8 items-center justify-center rounded-lg bg-purple-50">
            <svg className="h-4 w-4 text-purple-600" fill="none" viewBox="0 0 24 24" strokeWidth={2} stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" d="M7.5 21 3 16.5m0 0L7.5 12M3 16.5h13.5m0-13.5L21 7.5m0 0L16.5 12M21 7.5H7.5" />
            </svg>
          </div>
          <div>
            <h2 className="text-lg font-bold text-slate-800">Run Comparison</h2>
            <p className="text-xs text-slate-500">
              Comparing two eval runs side by side
            </p>
          </div>
          <InfoTip text="Comparing two eval runs for the same or different test cases. Differences in output and assertion results are highlighted." />
        </div>
        <button
          onClick={onClose}
          className="rounded-xl p-2 text-slate-400 hover:bg-slate-100 hover:text-slate-700 transition-all duration-200"
          aria-label="Close comparison"
        >
          <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
          </svg>
        </button>
      </div>

      {/* Scrollable content */}
      <div className="flex-1 overflow-y-auto p-6 space-y-6">
        {/* Run metadata cards */}
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          <RunMetaCard
            label="Run A"
            run={runA}
            evalCase={caseA}
            formatDate={(iso) => formatDateWithPrefs(iso, prefs)}
            color="indigo"
          />
          <RunMetaCard
            label="Run B"
            run={runB}
            evalCase={caseB}
            formatDate={(iso) => formatDateWithPrefs(iso, prefs)}
            color="purple"
          />
        </div>

        {/* Assertion flip summary */}
        <div className="flex items-center gap-3 rounded-xl border border-slate-200 bg-slate-50/80 px-4 py-3 flex-wrap">
          <span className="text-xs font-semibold text-slate-600 uppercase tracking-wide">Assertion Changes:</span>
          <InfoTip text="Shows which assertions changed between the two runs — green means an assertion that was failing now passes, red means a previously passing assertion now fails" size="h-3 w-3" />
          {flips.improved > 0 && (
            <span className="inline-flex items-center gap-1 text-xs font-semibold text-emerald-700 bg-emerald-50 px-2 py-0.5 rounded-full">
              🟢↑ {flips.improved} improved
            </span>
          )}
          {flips.regressed > 0 && (
            <span className="inline-flex items-center gap-1 text-xs font-semibold text-red-700 bg-red-50 px-2 py-0.5 rounded-full">
              🔴↓ {flips.regressed} regressed
            </span>
          )}
          {flips.unchanged > 0 && (
            <span className="inline-flex items-center gap-1 text-xs font-semibold text-slate-500 bg-slate-100 px-2 py-0.5 rounded-full">
              ⚪ {flips.unchanged} unchanged
            </span>
          )}
        </div>

        {/* Assertion flip details */}
        {flips.details.some((d) => d.flip !== 'unchanged') && (
          <div className="rounded-xl border border-slate-200 overflow-hidden">
            <table className="min-w-full divide-y divide-slate-200">
              <thead className="bg-slate-50/80">
                <tr>
                  <th className="px-4 py-2 text-left text-[10px] font-bold text-slate-500 uppercase tracking-wider">Assertion</th>
                  <th className="px-4 py-2 text-center text-[10px] font-bold text-indigo-500 uppercase tracking-wider">Run A</th>
                  <th className="px-4 py-2 text-center text-[10px] font-bold text-purple-500 uppercase tracking-wider">Run B</th>
                  <th className="px-4 py-2 text-center text-[10px] font-bold text-slate-500 uppercase tracking-wider">Change</th>
                </tr>
              </thead>
              <tbody className="bg-white divide-y divide-slate-100">
                {flips.details.map((d, i) => (
                  <tr key={i} className="hover:bg-slate-50/50">
                    <td className="px-4 py-2 text-sm text-slate-700 max-w-xs truncate" title={d.label}>
                      {d.label}
                    </td>
                    <td className="px-4 py-2 text-center">
                      <PassFailDot passed={d.passedA} />
                    </td>
                    <td className="px-4 py-2 text-center">
                      <PassFailDot passed={d.passedB} />
                    </td>
                    <td className="px-4 py-2 text-center">
                      {d.flip === 'improved' && <span className="text-emerald-600 text-xs font-semibold">🟢↑</span>}
                      {d.flip === 'regressed' && <span className="text-red-600 text-xs font-semibold">🔴↓</span>}
                      {d.flip === 'unchanged' && <span className="text-slate-400 text-xs">—</span>}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}

        {/* Output diff */}
        <section>
          <div className="flex items-center gap-2 mb-3">
            <svg className="h-4 w-4 text-indigo-500" fill="none" viewBox="0 0 24 24" strokeWidth={2} stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" d="M19.5 14.25v-2.625a3.375 3.375 0 0 0-3.375-3.375h-1.5A1.125 1.125 0 0 1 13.5 7.125v-1.5a3.375 3.375 0 0 0-3.375-3.375H8.25m0 12.75h7.5m-7.5 3H12M10.5 2.25H5.625c-.621 0-1.125.504-1.125 1.125v17.25c0 .621.504 1.125 1.125 1.125h12.75c.621 0 1.125-.504 1.125-1.125V11.25a9 9 0 0 0-9-9Z" />
            </svg>
            <h3 className="text-sm font-bold text-slate-700 uppercase tracking-wide">Output Diff</h3>
            <InfoTip text="Word-level differences between the two run outputs. Green = text in Run B but not A. Red = text in Run A but not B." />
          </div>

          {runA.outputWithSkill === runB.outputWithSkill ? (
            <div className="flex items-center gap-2 rounded-xl border border-slate-200 bg-slate-50/50 px-4 py-3">
              <svg className="h-4 w-4 text-slate-400" fill="none" viewBox="0 0 24 24" strokeWidth={2} stroke="currentColor">
                <path strokeLinecap="round" strokeLinejoin="round" d="m11.25 11.25.041-.02a.75.75 0 0 1 1.063.852l-.708 2.836a.75.75 0 0 0 1.063.853l.041-.021M21 12a9 9 0 1 1-18 0 9 9 0 0 1 18 0Zm-9-3.75h.008v.008H12V8.25Z" />
              </svg>
              <p className="text-sm text-slate-500">Outputs are identical.</p>
            </div>
          ) : outputDiff === null ? (
            <div className="flex items-center gap-2 rounded-xl border border-amber-100 bg-amber-50/50 px-4 py-3">
              <svg className="h-4 w-4 text-amber-500" fill="none" viewBox="0 0 24 24" strokeWidth={2} stroke="currentColor">
                <path strokeLinecap="round" strokeLinejoin="round" d="M12 9v3.75m-9.303 3.376c-.866 1.5.217 3.374 1.948 3.374h14.71c1.73 0 2.813-1.874 1.948-3.374L13.949 3.378c-.866-1.5-3.032-1.5-3.898 0L2.697 16.126ZM12 15.75h.007v.008H12v-.008Z" />
              </svg>
              <p className="text-sm text-amber-700">Output too large for inline diff view.</p>
            </div>
          ) : (
            <div className="rounded-xl border border-slate-200 bg-white p-5 max-h-96 overflow-y-auto">
              <p className="text-sm leading-relaxed whitespace-pre-wrap">
                {outputDiff.map((segment, i) => {
                  if (segment.type === 'equal') {
                    return <span key={i}>{segment.text}</span>;
                  }
                  if (segment.type === 'removed') {
                    return (
                      <span key={i} className="bg-red-100 text-red-700 line-through decoration-red-400/60 rounded px-0.5">
                        {segment.text}
                      </span>
                    );
                  }
                  return (
                    <span key={i} className="bg-emerald-100 text-emerald-800 rounded px-0.5">
                      {segment.text}
                    </span>
                  );
                })}
              </p>
            </div>
          )}
        </section>

        {/* Grading comparison */}
        <section>
          <div className="flex items-center gap-2 mb-3">
            <svg className="h-4 w-4 text-emerald-500" fill="none" viewBox="0 0 24 24" strokeWidth={2} stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" d="M9 12.75 11.25 15 15 9.75M21 12a9 9 0 1 1-18 0 9 9 0 0 1 18 0Z" />
            </svg>
            <h3 className="text-sm font-bold text-slate-700 uppercase tracking-wide">Grading Details</h3>
          </div>
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <div>
              <div className="flex items-center gap-2 mb-2">
                <span className="inline-flex items-center px-2 py-0.5 rounded-full bg-indigo-50 text-indigo-700 text-[10px] font-semibold uppercase tracking-wide">
                  Run A
                </span>
                <GradingSmallBadge overall={runA.grading.overall} score={runA.grading.score} />
              </div>
              <EvalGrades grading={runA.grading} />
            </div>
            <div>
              <div className="flex items-center gap-2 mb-2">
                <span className="inline-flex items-center px-2 py-0.5 rounded-full bg-purple-50 text-purple-700 text-[10px] font-semibold uppercase tracking-wide">
                  Run B
                </span>
                <GradingSmallBadge overall={runB.grading.overall} score={runB.grading.score} />
              </div>
              <EvalGrades grading={runB.grading} />
            </div>
          </div>
        </section>
      </div>
    </div>
  );
});

/* ─── Helper Components ──────────────────────────────────────────────── */

function RunMetaCard({
  label,
  run,
  evalCase,
  formatDate,
  color,
}: {
  label: string;
  run: EvalRun;
  evalCase?: EvalCase;
  formatDate: (iso: string) => string;
  color: 'indigo' | 'purple';
}) {
  const borderColor = color === 'indigo' ? 'border-indigo-100' : 'border-purple-100';
  const bgColor = color === 'indigo' ? 'bg-indigo-50/50' : 'bg-purple-50/50';
  const labelColor = color === 'indigo' ? 'text-indigo-700 bg-indigo-50' : 'text-purple-700 bg-purple-50';

  return (
    <div className={`rounded-xl border ${borderColor} ${bgColor} p-4`}>
      <div className="flex items-center gap-2 mb-2">
        <span className={`inline-flex items-center px-2 py-0.5 rounded-full text-[10px] font-semibold uppercase tracking-wide ${labelColor}`}>
          {label}
        </span>
        {run.skillVersion && (
          <span className="inline-flex items-center px-1.5 py-0.5 rounded-full bg-slate-100 text-slate-600 text-[10px] font-semibold">
            v{run.skillVersion}
          </span>
        )}
      </div>
      <div className="space-y-1 text-xs text-slate-600">
        {evalCase && (
          <div className="flex items-center gap-1">
            <span className="text-slate-400">Case:</span>
            <span className="font-medium text-slate-700">{evalCase.name}</span>
          </div>
        )}
        <div className="flex items-center gap-1">
          <span className="text-slate-400">Status:</span>
          <span className={`font-medium ${
            run.grading.overall === 'pass' ? 'text-emerald-600' :
            run.grading.overall === 'fail' ? 'text-red-600' : 'text-amber-600'
          }`}>
            {run.grading.overall} ({run.grading.score}/100)
          </span>
        </div>
        <div className="flex items-center gap-1">
          <span className="text-slate-400">Duration:</span>
          <span className="font-mono">{formatDuration(run.timing.durationMs)}</span>
        </div>
        <div className="flex items-center gap-1">
          <span className="text-slate-400">Date:</span>
          <span>{formatDate(run.createdAt)}</span>
        </div>
      </div>
    </div>
  );
}

function PassFailDot({ passed }: { passed: boolean }) {
  return (
    <span className={`inline-flex h-5 w-5 items-center justify-center rounded-full text-[10px] font-bold ${
      passed ? 'bg-emerald-100 text-emerald-700' : 'bg-red-100 text-red-700'
    }`}>
      {passed ? '✓' : '✗'}
    </span>
  );
}

function GradingSmallBadge({ overall, score }: { overall: string; score: number }) {
  const config: Record<string, string> = {
    pass: 'bg-emerald-50 text-emerald-700 border-emerald-200/60',
    fail: 'bg-red-50 text-red-700 border-red-200/60',
    partial: 'bg-amber-50 text-amber-700 border-amber-200/60',
  };
  return (
    <span className={`inline-flex items-center gap-1 px-2 py-0.5 rounded-full border text-[10px] font-semibold ${config[overall] || config.partial}`}>
      {overall === 'pass' ? '✓' : overall === 'fail' ? '✗' : '~'} {score}/100
    </span>
  );
}
