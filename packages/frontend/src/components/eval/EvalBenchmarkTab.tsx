import { useState, useMemo, useCallback, useRef } from 'react';
import type { EvalBenchmark, EvalCase, EvalAssertion, SkillVersionSummary, StatsSummary, ConfigStats, IterationStats, AssertionReplacementSuggestion } from '@skillspell/shared';
import { formatDuration } from '../../utils/formatDuration.js';
import { InfoTip } from '../common/InfoTip.js';
import { formatDateWithPrefs } from '../../utils/formatDate.js';
import { useUserPreferences } from '../../hooks/useUserPreferences.js';
import { SparklineWithLabel } from '../common/Sparkline.js';
import { VersionComparisonView } from './VersionComparisonView.js';
import { NonDiscriminatingHelpDialog } from './NonDiscriminatingHelpDialog.js';
import { AssertionReplacementDialog } from './AssertionReplacementDialog.js';
import { suggestAssertionReplacements, updateEvalCase } from '../../services/api/index.js';
import { useToast } from '../common/ToastContext.js';

interface EvalBenchmarkTabProps {
  benchmark: EvalBenchmark | null;
  isLoading: boolean;
  /** Available skill versions for the cross-version comparison picker. */
  versions?: SkillVersionSummary[];
  /** The currently selected page-level version filter (undefined = all). */
  selectedVersion?: number;
  /** Callback to load a benchmark for a specific version. Returns the benchmark. */
  onLoadBenchmark?: (version: number) => Promise<EvalBenchmark | null>;
  /** Skill ID needed for the "Fix with AI" assertion replacement feature. */
  skillId?: string;
  /** All eval cases — needed to apply assertion replacements back to the source data. */
  evalCases?: EvalCase[];
  /** Called after assertion replacements are applied so parent can reload eval cases. */
  onAssertionsUpdated?: () => void;
  /** Callback to run all evals—invoked after assertion replacements are applied. */
  onRunEvals?: () => void | Promise<void>;
}

/**
 * Quantitative benchmark view with summary stat cards, per-assertion
 * breakdown table, and per-eval-case breakdown table.
 */
// eslint-disable-next-line @typescript-eslint/no-unused-vars
export function EvalBenchmarkTab({ benchmark, isLoading, versions, selectedVersion: _selectedVersion, onLoadBenchmark, skillId, evalCases, onAssertionsUpdated, onRunEvals }: EvalBenchmarkTabProps) {
  const { prefs } = useUserPreferences();
  const { addToast } = useToast();

  // Non-discriminating help dialog state
  const [showNonDiscHelp, setShowNonDiscHelp] = useState(false);

  // AI assertion replacement state
  const [aiSuggestions, setAiSuggestions] = useState<AssertionReplacementSuggestion[]>([]);
  const [aiLoading, setAiLoading] = useState(false);
  const [aiLoadingMsg, setAiLoadingMsg] = useState<string | undefined>(undefined);
  const [showAiDialog, setShowAiDialog] = useState(false);
  const [aiApplying, setAiApplying] = useState(false);
  const aiAbortRef = useRef<AbortController | null>(null);

  // Count non-discriminating assertions
  // eslint-disable-next-line react-hooks/preserve-manual-memoization
  const nonDiscCount = useMemo(() => {
    if (!benchmark?.byAssertionValue) return 0;
    return benchmark.byAssertionValue.filter((v) => v.discrimination === 'non-discriminating').length;
  }, [benchmark?.byAssertionValue]);

  // Handle "Fix with AI" button click
  // eslint-disable-next-line react-hooks/preserve-manual-memoization
  const handleFixWithAi = useCallback(async () => {
    if (!skillId || !benchmark?.byAssertionValue) return;
    const nonDisc = benchmark.byAssertionValue.filter((v) => v.discrimination === 'non-discriminating');
    if (nonDisc.length === 0) return;

    // Cancel any previous in-flight request
    aiAbortRef.current?.abort();
    const controller = new AbortController();
    aiAbortRef.current = controller;

    // Open dialog immediately with loading state (non-closeable)
    setAiLoading(true);
    setAiLoadingMsg(undefined); // default message for AI analysis
    setAiSuggestions([]);
    setShowAiDialog(true);
    try {
      const suggestions = await suggestAssertionReplacements(
        skillId,
        nonDisc.map((v) => ({
          assertionValue: v.assertionValue,
          assertionType: v.assertionType,
          description: v.description,
          withSkillPassRate: v.withSkillPassRate,
          baselinePassRate: v.baselinePassRate,
        })),
        controller.signal,
      );
      if (!controller.signal.aborted) {
        setAiSuggestions(suggestions);
      }
    } catch (err) {
      if (!controller.signal.aborted) {
        // On error close the dialog so user can retry
        setShowAiDialog(false);
        addToast('error', err instanceof Error ? err.message : 'Failed to generate assertion replacements. Please try again.');
      }
    } finally {
      if (!controller.signal.aborted) {
        setAiLoading(false);
      }
    }
  }, [skillId, benchmark?.byAssertionValue, addToast]);

  // Handle applying accepted assertion replacements + running evals
  const handleApplyReplacements = useCallback(async (accepted: AssertionReplacementSuggestion[]) => {
    if (accepted.length === 0 || !skillId || !evalCases || evalCases.length === 0) return;
    setAiApplying(true);
    try {
      // Build replacement entries from accepted suggestions.
      // The AI's `original` field may be truncated/modified, so we use multiple matching strategies.
      const replacements = accepted.map((s) => ({
        origType: s.original.assertionType.trim().toLowerCase(),
        origValue: s.original.assertionValue.trim().toLowerCase(),
        repl: {
          type: s.replacement.type as EvalAssertion['type'],
          value: s.replacement.value,
          ...(s.replacement.description ? { description: s.replacement.description } : {}),
        } as EvalAssertion,
      }));

      // Match function: try exact, normalized, or substring inclusion
      const findReplacement = (a: EvalAssertion): EvalAssertion | undefined => {
        const aType = a.type.trim().toLowerCase();
        const aValue = a.value.trim().toLowerCase();
        for (const r of replacements) {
          // Exact match
          if (aType === r.origType && aValue === r.origValue) return r.repl;
          // Substring: the eval case value contains the AI's original value (AI may have truncated)
          if (aType === r.origType && aValue.includes(r.origValue)) return r.repl;
          // Substring: the AI's original contains the eval case value
          if (aType === r.origType && r.origValue.includes(aValue)) return r.repl;
          // Cross-type match via substring (AI may mis-report type, e.g. contains vs regex)
          if (aValue.includes(r.origValue) || r.origValue.includes(aValue)) return r.repl;
        }
        return undefined;
      };

      // Find all eval cases that contain at least one matching assertion and update them
      const updatePromises: Promise<EvalCase>[] = [];
      let totalReplacements = 0;
      for (const ec of evalCases) {
        let changed = false;
        const updatedAssertions = ec.assertions.map((a) => {
          const repl = findReplacement(a);
          if (repl) {
            changed = true;
            totalReplacements++;
            return repl;
          }
          return a;
        });
        if (changed) {
          updatePromises.push(updateEvalCase(skillId, ec.id, { assertions: updatedAssertions }));
        }
      }

      if (updatePromises.length === 0) {
        console.warn('[Fix with AI] No matches found.',
          'Originals:', replacements.map((r) => `${r.origType}::${r.origValue.substring(0, 60)}`),
          'EC assertion keys:', evalCases.flatMap((ec) => ec.assertions.map((a) => `${a.type}::${a.value.substring(0, 60)}`)),
        );
        addToast('error', 'No matching assertions found in eval cases. The assertions may have already been changed.');
        setShowAiDialog(false);
        setAiSuggestions([]);
        return;
      }

      await Promise.all(updatePromises);
      addToast('success', `${totalReplacements} assertion${totalReplacements !== 1 ? 's' : ''} replaced across ${updatePromises.length} test case${updatePromises.length !== 1 ? 's' : ''}.`);
      onAssertionsUpdated?.();

      // Now run evals automatically — switch dialog to "running evals" loading state
      setAiSuggestions([]);
      setAiLoadingMsg('Running evals with updated assertions…');
      setAiLoading(true); // re-use loading state to show spinner in dialog
      try {
        await onRunEvals?.();
        addToast('success', 'Evals completed — benchmark updated.');
      } catch {
        addToast('error', 'Eval run failed. You can re-run from the top bar.');
      }
      setShowAiDialog(false);
    } catch (err) {
      addToast('error', err instanceof Error ? err.message : 'Failed to update eval cases');
      setShowAiDialog(false);  // ensure dialog closes on unexpected error
    } finally {
      setAiApplying(false);
      setAiLoading(false);
    }
  }, [skillId, evalCases, onAssertionsUpdated, onRunEvals, addToast]);

  // Version comparison state
  const [compareVersionA, setCompareVersionA] = useState<number | ''>('');
  const [compareVersionB, setCompareVersionB] = useState<number | ''>('');
  const [comparisonBenchmarkA, setComparisonBenchmarkA] = useState<EvalBenchmark | null>(null);
  const [comparisonBenchmarkB, setComparisonBenchmarkB] = useState<EvalBenchmark | null>(null);
  const [comparisonLoading, setComparisonLoading] = useState(false);
  const [comparisonActive, setComparisonActive] = useState(false);

  // Sorted versions list (descending) — memoized
  const sortedVersions = useMemo(() => {
    if (!versions || versions.length < 2) return [];
    return [...versions].sort((a, b) => b.version - a.version);
  }, [versions]);

  // Handle starting comparison
  const handleStartComparison = useCallback(async () => {
    if (compareVersionA === '' || compareVersionB === '' || !onLoadBenchmark) return;
    if (compareVersionA === compareVersionB) return;

    setComparisonLoading(true);
    try {
      const [bmA, bmB] = await Promise.all([
        onLoadBenchmark(compareVersionA),
        onLoadBenchmark(compareVersionB),
      ]);
      setComparisonBenchmarkA(bmA);
      setComparisonBenchmarkB(bmB);
      setComparisonActive(true);
    } finally {
      setComparisonLoading(false);
    }
  }, [compareVersionA, compareVersionB, onLoadBenchmark]);

  // Handle clearing comparison
  const handleClearComparison = useCallback(() => {
    setComparisonActive(false);
    setComparisonBenchmarkA(null);
    setComparisonBenchmarkB(null);
    setCompareVersionA('');
    setCompareVersionB('');
  }, []);

  if (isLoading) {
    return (
      <div className="flex items-center justify-center h-64">
        <div className="h-10 w-10 animate-spin-ease rounded-full border-[3px] border-indigo-200 border-t-indigo-600" />
      </div>
    );
  }

  if (!benchmark || benchmark.totalRuns === 0) {
    return (
      <div className="flex flex-col items-center justify-center h-64 gap-3">
        <div className="flex h-12 w-12 items-center justify-center rounded-xl bg-slate-100">
          <svg className="h-6 w-6 text-slate-400" fill="none" viewBox="0 0 24 24" strokeWidth={1.5} stroke="currentColor">
            <path strokeLinecap="round" strokeLinejoin="round" d="M3 13.125C3 12.504 3.504 12 4.125 12h2.25c.621 0 1.125.504 1.125 1.125v6.75C7.5 20.496 6.996 21 6.375 21h-2.25A1.125 1.125 0 0 1 3 19.875v-6.75ZM9.75 8.625c0-.621.504-1.125 1.125-1.125h2.25c.621 0 1.125.504 1.125 1.125v11.25c0 .621-.504 1.125-1.125 1.125h-2.25a1.125 1.125 0 0 1-1.125-1.125V8.625ZM16.5 4.125c0-.621.504-1.125 1.125-1.125h2.25C20.496 3 21 3.504 21 4.125v15.75c0 .621-.504 1.125-1.125 1.125h-2.25a1.125 1.125 0 0 1-1.125-1.125V4.125Z" />
          </svg>
        </div>
        <p className="text-sm text-slate-500 font-medium">No benchmark data available</p>
        <p className="text-xs text-slate-400">Run some evals first to generate benchmarks</p>
      </div>
    );
  }

  // If version comparison is active, show the comparison view
  if (comparisonActive && comparisonBenchmarkA && comparisonBenchmarkB && compareVersionA !== '' && compareVersionB !== '') {
    return (
      <div className="h-full p-6 overflow-y-auto">
        <VersionComparisonView
          versionA={compareVersionA}
          versionB={compareVersionB}
          benchmarkA={comparisonBenchmarkA}
          benchmarkB={comparisonBenchmarkB}
          onClose={handleClearComparison}
        />
      </div>
    );
  }

  return (
    <div className="h-full p-6 space-y-8 overflow-y-auto">
      {/* Cross-version comparison picker — only show when ≥ 2 versions exist */}
      {sortedVersions.length >= 2 && onLoadBenchmark && (
        <section className="rounded-xl border border-blue-100 bg-blue-50/30 p-4">
          <div className="flex items-center gap-2 mb-3">
            <svg className="h-4 w-4 text-blue-500" fill="none" viewBox="0 0 24 24" strokeWidth={2} stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" d="M7.5 21 3 16.5m0 0L7.5 12M3 16.5h13.5m0-13.5L21 7.5m0 0L16.5 12M21 7.5H7.5" />
            </svg>
            <h3 className="text-sm font-bold text-slate-700 uppercase tracking-wide">Compare Versions</h3>
            <InfoTip text="Select two skill versions to compare their aggregate benchmark metrics side-by-side. Helps identify which version performs better across all test cases." />
          </div>
          <div className="flex items-center gap-3 flex-wrap">
            <label className="flex items-center gap-1.5">
              <span className="text-xs font-medium text-slate-500">Compare</span>
              <select
                value={compareVersionA}
                onChange={(e) => setCompareVersionA(e.target.value === '' ? '' : Number(e.target.value))}
                className="rounded-lg border border-slate-200 bg-white px-2 py-1.5 text-xs font-medium text-slate-700 shadow-sm hover:border-slate-300 focus:border-blue-400 focus:ring-1 focus:ring-blue-400 cursor-pointer transition-all"
                aria-label="Select first version to compare"
              >
                <option value="">Select version…</option>
                {sortedVersions.map((v) => (
                  <option key={v.version} value={v.version} disabled={v.version === compareVersionB}>
                    v{v.version}
                  </option>
                ))}
              </select>
            </label>
            <span className="text-xs text-slate-400 font-medium">with</span>
            <label className="flex items-center gap-1.5">
              <select
                value={compareVersionB}
                onChange={(e) => setCompareVersionB(e.target.value === '' ? '' : Number(e.target.value))}
                className="rounded-lg border border-slate-200 bg-white px-2 py-1.5 text-xs font-medium text-slate-700 shadow-sm hover:border-slate-300 focus:border-blue-400 focus:ring-1 focus:ring-blue-400 cursor-pointer transition-all"
                aria-label="Select second version to compare"
              >
                <option value="">Select version…</option>
                {sortedVersions.map((v) => (
                  <option key={v.version} value={v.version} disabled={v.version === compareVersionA}>
                    v{v.version}
                  </option>
                ))}
              </select>
            </label>
            <button
              onClick={handleStartComparison}
              disabled={compareVersionA === '' || compareVersionB === '' || compareVersionA === compareVersionB || comparisonLoading}
              className={`rounded-xl px-3.5 py-1.5 text-xs font-semibold transition-all duration-200 ${
                compareVersionA === '' || compareVersionB === '' || compareVersionA === compareVersionB || comparisonLoading
                  ? 'bg-slate-100 text-slate-400 cursor-not-allowed'
                  : 'bg-gradient-to-r from-blue-600 to-indigo-600 text-white shadow-lg shadow-blue-500/20 hover:shadow-xl hover:brightness-110'
              }`}
            >
              {comparisonLoading ? (
                <span className="flex items-center gap-1.5">
                  <span className="h-3 w-3 animate-spin rounded-full border-2 border-white/30 border-t-white" />
                  Loading…
                </span>
              ) : (
                'Compare'
              )}
            </button>
          </div>
        </section>
      )}

      {/* Summary stats cards */}
      <section>
        <div className="flex items-center gap-2 mb-1">
          <svg className="h-4 w-4 text-indigo-500" fill="none" viewBox="0 0 24 24" strokeWidth={2} stroke="currentColor">
            <path strokeLinecap="round" strokeLinejoin="round" d="M3 13.125C3 12.504 3.504 12 4.125 12h2.25c.621 0 1.125.504 1.125 1.125v6.75C7.5 20.496 6.996 21 6.375 21h-2.25A1.125 1.125 0 0 1 3 19.875v-6.75ZM9.75 8.625c0-.621.504-1.125 1.125-1.125h2.25c.621 0 1.125.504 1.125 1.125v11.25c0 .621-.504 1.125-1.125 1.125h-2.25a1.125 1.125 0 0 1-1.125-1.125V8.625ZM16.5 4.125c0-.621.504-1.125 1.125-1.125h2.25C20.496 3 21 3.504 21 4.125v15.75c0 .621-.504 1.125-1.125 1.125h-2.25a1.125 1.125 0 0 1-1.125-1.125V4.125Z" />
          </svg>
          <h3 className="text-sm font-bold text-slate-700 uppercase tracking-wide">Summary</h3>
          <InfoTip text="High-level metrics aggregated across all eval runs for this skill." />
        </div>
        <div className="grid grid-cols-2 md:grid-cols-4 gap-3 mt-3">
          <StatCard label="Total Runs" value={benchmark.totalRuns.toString()} icon="runs" tooltip="Total number of eval runs executed for this skill" />
          <StatCard
            label="Pass Rate"
            value={`${benchmark.passRate.toFixed(1)}%`}
            color={benchmark.passRate >= 80 ? 'green' : benchmark.passRate >= 50 ? 'yellow' : 'red'}
            icon="rate"
            tooltip="Percentage of runs where all assertions passed — green ≥ 80%, yellow ≥ 50%, red < 50%"
          />
          <StatCard
            label="Avg Score"
            value={`${benchmark.averageScore.toFixed(1)}/100`}
            icon="score"
            tooltip="Average grading score across all runs (0–100). Higher is better."
          />
          <StatCard
            label="Avg Duration"
            value={formatDuration(benchmark.averageDurationMs)}
            icon="time"
            tooltip="Average wall-clock time per eval run, including model inference"
          />
        </div>
      </section>

      {/* Variance stats: with-skill vs baseline comparison */}
      {benchmark.withSkillStats && (
        <section>
          <div className="flex items-center gap-2 mb-1">
            <svg className="h-4 w-4 text-blue-500" fill="none" viewBox="0 0 24 24" strokeWidth={2} stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" d="M7.5 14.25v2.25m3-4.5v4.5m3-6.75v6.75m3-9v9M6 20.25h12A2.25 2.25 0 0 0 20.25 18V6A2.25 2.25 0 0 0 18 3.75H6A2.25 2.25 0 0 0 3.75 6v12A2.25 2.25 0 0 0 6 20.25Z" />
            </svg>
            <h3 className="text-sm font-bold text-slate-700 uppercase tracking-wide">
              Variance Analysis
            </h3>
            <InfoTip text="Statistical spread across multiple runs. Lower standard deviation (±) means more consistent results. Compares with-skill vs baseline performance." />
          </div>

          <div className="grid grid-cols-1 md:grid-cols-2 gap-4 mt-3">
            {/* With-skill stats */}
            <ConfigStatsCard
              label="With Skill"
              stats={benchmark.withSkillStats}
              color="indigo"
              tooltip="Performance metrics when the skill instructions are active"
            />

            {/* Baseline stats */}
            {benchmark.baselineStats && (
              <ConfigStatsCard
                label="Baseline (No Skill)"
                stats={benchmark.baselineStats}
                color="slate"
                tooltip="Performance metrics without the skill — serves as a control group for comparison"
              />
            )}
          </div>

          {/* Delta comparison */}
          {benchmark.delta && (
            <div className="mt-4 rounded-xl border border-blue-100 bg-blue-50/50 p-4">
              <div className="flex items-center gap-2 mb-3">
                <h4 className="text-xs font-bold text-blue-700 uppercase tracking-wide">
                  Skill vs Baseline Delta
                </h4>
                <InfoTip text="How much the skill improves (green) or regresses (red) compared to the no-skill baseline. Positive values mean the skill output is better for that metric." />
              </div>
              <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
                <DeltaBadge label="Pass Rate" value={benchmark.delta.passRate} unit="%" higherIsBetter tooltip="Change in pass rate — positive means the skill helps more tests pass" />
                <DeltaBadge label="Score" value={benchmark.delta.score} unit="" higherIsBetter tooltip="Change in grading score — positive means higher quality output with skill" />
                <DeltaBadge label="Duration" value={benchmark.delta.durationMs} unit="" higherIsBetter={false} formatter={(n) => formatDuration(Math.abs(n))} tooltip="Change in response time — negative (green) means the skill is faster" />
                <DeltaBadge label="Tokens" value={benchmark.delta.tokens} unit="" higherIsBetter={false} tooltip="Change in token usage — negative (green) means the skill uses fewer tokens" />
              </div>
            </div>
          )}
        </section>
      )}

      {/* Analyst notes */}
      {benchmark.notes && benchmark.notes.length > 0 && (
        <section>
          <div className="flex items-center gap-2 mb-3">
            <svg className="h-4 w-4 text-amber-500" fill="none" viewBox="0 0 24 24" strokeWidth={2} stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" d="M12 18v-5.25m0 0a6.01 6.01 0 0 0 1.5-.189m-1.5.189a6.01 6.01 0 0 1-1.5-.189m3.75 7.478a12.06 12.06 0 0 1-4.5 0m3.75 2.383a14.406 14.406 0 0 1-3 0M14.25 18v-.192c0-.983.658-1.823 1.508-2.316a7.5 7.5 0 1 0-7.517 0c.85.493 1.509 1.333 1.509 2.316V18" />
            </svg>
            <h3 className="text-sm font-bold text-slate-700 uppercase tracking-wide">Analyst Notes</h3>
            <InfoTip text="Auto-generated observations about patterns and anomalies in your eval data. These highlight areas that may need attention." />
          </div>
          <div className="space-y-2">
            {benchmark.notes.map((note, i) => (
              <div
                key={i}
                className="rounded-lg border border-amber-100 bg-amber-50/50 px-4 py-3 text-sm text-amber-800 flex items-start gap-2"
              >
                <span className="flex-1">{note}</span>
                {note.includes('non-discriminating') && (
                  <button
                    onClick={() => setShowNonDiscHelp(true)}
                    className="shrink-0 flex h-5 w-5 items-center justify-center rounded-full border border-amber-300 bg-amber-100 text-amber-700 hover:bg-amber-200 transition-colors text-[10px] font-bold"
                    title="Learn more about non-discriminating assertions"
                    aria-label="Learn more about non-discriminating assertions"
                  >
                    ?
                  </button>
                )}
              </div>
            ))}
          </div>
        </section>
      )}

      {/* Per-assertion breakdown */}
      {benchmark.byAssertion.length > 0 && (
        <section>
          <div className="flex items-center gap-2 mb-3">
            <svg className="h-4 w-4 text-purple-500" fill="none" viewBox="0 0 24 24" strokeWidth={2} stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" d="M9 12.75 11.25 15 15 9.75M21 12a9 9 0 1 1-18 0 9 9 0 0 1 18 0Z" />
            </svg>
            <h3 className="text-sm font-bold text-slate-700 uppercase tracking-wide">By Assertion Type</h3>
            <InfoTip text="Pass rates broken down by assertion type (e.g. contains, regex, semantic). Helps identify which types of checks fail most often." />
          </div>
          <div className="overflow-x-auto rounded-xl border border-slate-200">
            <table className="min-w-full divide-y divide-slate-200">
              <thead className="bg-slate-50/80">
                <tr>
                  <th className="px-4 py-3 text-left text-[10px] font-bold text-slate-500 uppercase tracking-wider">
                    Type
                  </th>
                  <th className="px-4 py-3 text-right text-[10px] font-bold text-slate-500 uppercase tracking-wider">
                    Checks
                  </th>
                  <th className="px-4 py-3 text-right text-[10px] font-bold text-slate-500 uppercase tracking-wider">
                    Passed
                  </th>
                  <th className="px-4 py-3 text-right text-[10px] font-bold text-slate-500 uppercase tracking-wider">
                    Pass Rate
                  </th>
                  <th className="px-4 py-3 text-center text-[10px] font-bold text-slate-500 uppercase tracking-wider">
                    Discrimination
                  </th>
                </tr>
              </thead>
              <tbody className="bg-white divide-y divide-slate-100">
                {benchmark.byAssertion.map((stat) => (
                  <tr key={stat.assertionType} className="hover:bg-slate-50/50 transition-colors">
                    <td className="px-4 py-3 font-mono text-sm text-slate-700">
                      {stat.assertionType}
                    </td>
                    <td className="px-4 py-3 text-right text-sm text-slate-600">
                      {stat.totalChecks}
                    </td>
                    <td className="px-4 py-3 text-right text-sm text-slate-600">
                      {stat.passCount}
                    </td>
                    <td className="px-4 py-3 text-right">
                      <PassRateBadge rate={stat.passRate} />
                    </td>
                    <td className="px-4 py-3 text-center">
                      {stat.discrimination && <DiscriminationBadge value={stat.discrimination} />}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </section>
      )}

      {/* Per-eval-case breakdown */}
      {benchmark.byEvalCase.length > 0 && (
        <section>
          <div className="flex items-center gap-2 mb-3">
            <svg className="h-4 w-4 text-amber-500" fill="none" viewBox="0 0 24 24" strokeWidth={2} stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" d="M9.75 3.104v5.714a2.25 2.25 0 0 1-.659 1.591L5 14.5M9.75 3.104c-.251.023-.501.05-.75.082m.75-.082a24.301 24.301 0 0 1 4.5 0m0 0v5.714c0 .597.237 1.17.659 1.591L19.8 15.3M14.25 3.104c.251.023.501.05.75.082M19.8 15.3l-1.57.393A9.065 9.065 0 0 1 12 15a9.065 9.065 0 0 0-6.23.693L5 14.5m14.8.8 1.402 1.402c1.232 1.232.65 3.318-1.067 3.611l-.772.13c-1.687.282-3.41.395-5.13.334l-.213-.01a8.86 8.86 0 0 1-2.89-.614L5 18.5" />
            </svg>
            <h3 className="text-sm font-bold text-slate-700 uppercase tracking-wide">By Eval Case</h3>
            <InfoTip text="Performance of each individual test case across all its runs. Identifies which test cases consistently pass or fail." />
          </div>
          <div className="overflow-x-auto rounded-xl border border-slate-200">
            <table className="min-w-full divide-y divide-slate-200">
              <thead className="bg-slate-50/80">
                <tr>
                  <th className="px-4 py-3 text-left text-[10px] font-bold text-slate-500 uppercase tracking-wider">
                    Name
                  </th>
                  <th className="px-4 py-3 text-right text-[10px] font-bold text-slate-500 uppercase tracking-wider">
                    Runs
                  </th>
                  <th className="px-4 py-3 text-right text-[10px] font-bold text-slate-500 uppercase tracking-wider">
                    Passed
                  </th>
                  <th className="px-4 py-3 text-right text-[10px] font-bold text-slate-500 uppercase tracking-wider">
                    Pass Rate
                  </th>
                  <th className="px-4 py-3 text-right text-[10px] font-bold text-slate-500 uppercase tracking-wider">
                    Avg Score
                  </th>
                </tr>
              </thead>
              <tbody className="bg-white divide-y divide-slate-100">
                {benchmark.byEvalCase.map((stat) => (
                  <tr key={stat.evalId} className="hover:bg-slate-50/50 transition-colors">
                    <td className="px-4 py-3 text-sm font-medium text-slate-700">
                      {stat.evalName}
                    </td>
                    <td className="px-4 py-3 text-right text-sm text-slate-600">
                      {stat.runCount}
                    </td>
                    <td className="px-4 py-3 text-right text-sm text-slate-600">
                      {stat.passCount}
                    </td>
                    <td className="px-4 py-3 text-right">
                      <PassRateBadge rate={stat.passRate} />
                    </td>
                    <td className="px-4 py-3 text-right text-sm text-slate-600">
                      {stat.averageScore.toFixed(1)}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </section>
      )}

      {/* Per-assertion-value breakdown with discrimination (Phase 2) */}
      {benchmark.byAssertionValue && benchmark.byAssertionValue.length > 0 && (
        <section>
          <div className="flex items-center gap-2 mb-3">
            <svg className="h-4 w-4 text-orange-500" fill="none" viewBox="0 0 24 24" strokeWidth={2} stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" d="M3.75 3v11.25A2.25 2.25 0 0 0 6 16.5h2.25M3.75 3h-1.5m1.5 0h16.5m0 0h1.5m-1.5 0v11.25A2.25 2.25 0 0 1 18 16.5h-2.25m-7.5 0h7.5m-7.5 0-1 3m8.5-3 1 3m0 0 .5 1.5m-.5-1.5h-9.5m0 0-.5 1.5" />
            </svg>
            <h3 className="text-sm font-bold text-slate-700 uppercase tracking-wide">By Assertion Value</h3>
            <InfoTip text="Pass rates for each specific assertion (not just by type). Shows whether each assertion discriminates between skill and baseline — non-discriminating assertions always pass regardless of the skill." />
            {/* Fix with AI button — only when there are non-discriminating assertions and skillId is available */}
            {skillId && nonDiscCount > 0 && (
              <button
                onClick={handleFixWithAi}
                disabled={aiLoading}
                className={`ml-auto rounded-lg px-3 py-1.5 text-xs font-semibold transition-all duration-200 ${
                  aiLoading
                    ? 'bg-slate-100 text-slate-400 cursor-not-allowed'
                    : 'bg-gradient-to-r from-indigo-600 to-purple-600 text-white shadow-md shadow-indigo-500/20 hover:shadow-lg hover:brightness-110'
                }`}
              >
                {aiLoading ? (
                  <span className="flex items-center gap-1.5">
                    <span className="h-3 w-3 animate-spin rounded-full border-2 border-white/30 border-t-white" />
                    Analyzing…
                  </span>
                ) : (
                  <span className="flex items-center gap-1">
                    ✨ Fix with AI
                    <span className="bg-white/20 rounded px-1 text-[10px]">{nonDiscCount}</span>
                  </span>
                )}
              </button>
            )}
          </div>
          <div className="overflow-x-auto rounded-xl border border-slate-200">
            <table className="min-w-full divide-y divide-slate-200">
              <thead className="bg-slate-50/80">
                <tr>
                  <th className="px-4 py-3 text-left text-[10px] font-bold text-slate-500 uppercase tracking-wider">Assertion</th>
                  <th className="px-4 py-3 text-left text-[10px] font-bold text-slate-500 uppercase tracking-wider">Type</th>
                  <th className="px-4 py-3 text-right text-[10px] font-bold text-slate-500 uppercase tracking-wider">With Skill</th>
                  <th className="px-4 py-3 text-right text-[10px] font-bold text-slate-500 uppercase tracking-wider">Baseline</th>
                  <th className="px-4 py-3 text-center text-[10px] font-bold text-slate-500 uppercase tracking-wider">
                    <span className="inline-flex items-center gap-1">
                      Discrimination
                      <button
                        onClick={() => setShowNonDiscHelp(true)}
                        className="flex h-4 w-4 items-center justify-center rounded-full border border-slate-300 bg-slate-100 text-slate-500 hover:bg-slate-200 hover:text-slate-700 transition-colors text-[9px] font-bold"
                        title="What does discrimination mean?"
                        aria-label="Learn about discrimination categories"
                      >
                        ?
                      </button>
                    </span>
                  </th>
                </tr>
              </thead>
              <tbody className="bg-white divide-y divide-slate-100">
                {benchmark.byAssertionValue.map((v, i) => (
                  <tr key={i} className="hover:bg-slate-50/50 transition-colors">
                    <td className="px-4 py-3 text-sm text-slate-700 max-w-xs truncate" title={v.assertionValue}>
                      {v.description || v.assertionValue}
                    </td>
                    <td className="px-4 py-3 font-mono text-xs text-slate-500">{v.assertionType}</td>
                    <td className="px-4 py-3 text-right">
                      <PassRateBadge rate={v.withSkillPassRate} />
                      <span className="text-[10px] text-slate-400 ml-1">({v.totalWithSkillChecks})</span>
                    </td>
                    <td className="px-4 py-3 text-right">
                      {v.totalBaselineChecks > 0 ? (
                        <>
                          <PassRateBadge rate={v.baselinePassRate} />
                          <span className="text-[10px] text-slate-400 ml-1">({v.totalBaselineChecks})</span>
                        </>
                      ) : (
                        <span className="text-xs text-slate-400">—</span>
                      )}
                    </td>
                    <td className="px-4 py-3 text-center">
                      {v.discrimination && <DiscriminationBadge value={v.discrimination} />}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </section>
      )}

      {/* Iteration timeline with sparkline trends */}
      {benchmark.byIteration && benchmark.byIteration.length > 0 && (
        <section>
          <div className="flex items-center gap-2 mb-3">
            <svg className="h-4 w-4 text-teal-500" fill="none" viewBox="0 0 24 24" strokeWidth={2} stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" d="M12 6v6h4.5m4.5 0a9 9 0 1 1-18 0 9 9 0 0 1 18 0Z" />
            </svg>
            <h3 className="text-sm font-bold text-slate-700 uppercase tracking-wide">Iteration History</h3>
            <InfoTip text="Track how your skill improves over time. Each iteration represents a batch of eval runs after a skill modification. Win/loss is determined by comparing pass rate and score to the previous iteration." />
          </div>

          {/* Sparkline trend charts — only show when ≥ 2 iterations */}
          {benchmark.byIteration.length >= 2 && (
            <IterationSparklines iterations={benchmark.byIteration} />
          )}

          <div className="flex flex-wrap gap-3">
            {benchmark.byIteration.map((iter) => (
              <IterationCard key={iter.iteration} iter={iter} />
            ))}
          </div>
        </section>
      )}

      {/* Generated timestamp */}
      <div className="text-xs text-slate-400 text-right">
        Generated at {formatDateWithPrefs(benchmark.generatedAt, prefs)}
      </div>

      {/* Non-discriminating help dialog */}
      {showNonDiscHelp && (
        <NonDiscriminatingHelpDialog onClose={() => setShowNonDiscHelp(false)} />
      )}

      {/* AI assertion replacement dialog — shown during loading and after results arrive */}
      {showAiDialog && (
        <AssertionReplacementDialog
          suggestions={aiSuggestions}
          onApply={handleApplyReplacements}
          onClose={() => { setShowAiDialog(false); setAiSuggestions([]); }}
          isApplying={aiApplying}
          isLoading={aiLoading}
          loadingMessage={aiLoadingMsg}
        />
      )}
    </div>
  );
}

/* ─── Helper components ──────────────────────────────────────────────── */

function StatCard({
  label,
  value,
  color,
  icon,
  tooltip,
}: {
  label: string;
  value: string;
  color?: 'green' | 'yellow' | 'red';
  icon: 'runs' | 'rate' | 'score' | 'time';
  tooltip?: string;
}) {
  const colorClasses: Record<string, string> = {
    green: 'text-emerald-600',
    yellow: 'text-amber-600',
    red: 'text-red-600',
  };

  const iconBg: Record<string, string> = {
    runs: 'bg-indigo-50',
    rate: color === 'green' ? 'bg-emerald-50' : color === 'red' ? 'bg-red-50' : 'bg-amber-50',
    score: 'bg-purple-50',
    time: 'bg-slate-100',
  };

  const iconEl: Record<string, React.ReactNode> = {
    runs: (
      <svg className="h-3.5 w-3.5 text-indigo-500" fill="none" viewBox="0 0 24 24" strokeWidth={2} stroke="currentColor">
        <path strokeLinecap="round" strokeLinejoin="round" d="M5.25 5.653c0-.856.917-1.398 1.667-.986l11.54 6.347a1.125 1.125 0 0 1 0 1.972l-11.54 6.347a1.125 1.125 0 0 1-1.667-.986V5.653Z" />
      </svg>
    ),
    rate: (
      <svg className={`h-3.5 w-3.5 ${color === 'green' ? 'text-emerald-500' : color === 'red' ? 'text-red-500' : 'text-amber-500'}`} fill="none" viewBox="0 0 24 24" strokeWidth={2} stroke="currentColor">
        <path strokeLinecap="round" strokeLinejoin="round" d="M9 12.75 11.25 15 15 9.75M21 12a9 9 0 1 1-18 0 9 9 0 0 1 18 0Z" />
      </svg>
    ),
    score: (
      <svg className="h-3.5 w-3.5 text-purple-500" fill="none" viewBox="0 0 24 24" strokeWidth={2} stroke="currentColor">
        <path strokeLinecap="round" strokeLinejoin="round" d="M11.48 3.499a.562.562 0 0 1 1.04 0l2.125 5.111a.563.563 0 0 0 .475.345l5.518.442c.499.04.701.663.321.988l-4.204 3.602a.563.563 0 0 0-.182.557l1.285 5.385a.562.562 0 0 1-.84.61l-4.725-2.885a.562.562 0 0 0-.586 0L6.982 20.54a.562.562 0 0 1-.84-.61l1.285-5.386a.562.562 0 0 0-.182-.557l-4.204-3.602a.562.562 0 0 1 .321-.988l5.518-.442a.563.563 0 0 0 .475-.345L11.48 3.5Z" />
      </svg>
    ),
    time: (
      <svg className="h-3.5 w-3.5 text-slate-500" fill="none" viewBox="0 0 24 24" strokeWidth={2} stroke="currentColor">
        <path strokeLinecap="round" strokeLinejoin="round" d="M12 6v6h4.5m4.5 0a9 9 0 1 1-18 0 9 9 0 0 1 18 0Z" />
      </svg>
    ),
  };

  return (
    <div className="rounded-xl border border-slate-200 bg-white p-4 transition-all duration-200 hover:shadow-sm">
      <div className="flex items-center gap-2 mb-2">
        <div className={`flex h-6 w-6 items-center justify-center rounded-lg ${iconBg[icon]}`}>
          {iconEl[icon]}
        </div>
        <span className="text-xs text-slate-500 font-medium">{label}</span>
        {tooltip && <InfoTip text={tooltip} />}
      </div>
      <div className={`text-2xl font-bold ${color ? colorClasses[color] : 'text-slate-800'}`}>
        {value}
      </div>
    </div>
  );
}

function PassRateBadge({ rate }: { rate: number }) {
  let colorClass = 'bg-red-50 text-red-700 border-red-200/60';
  if (rate >= 80) colorClass = 'bg-emerald-50 text-emerald-700 border-emerald-200/60';
  else if (rate >= 50) colorClass = 'bg-amber-50 text-amber-700 border-amber-200/60';

  return (
    <span className={`inline-flex items-center px-2 py-0.5 rounded-full border text-xs font-semibold ${colorClass}`}>
      {rate.toFixed(1)}%
    </span>
  );
}

/**
 * Displays ConfigStats (mean ± stddev, min–max) for a single configuration.
 */
function ConfigStatsCard({
  label,
  stats,
  color,
  tooltip,
}: {
  label: string;
  stats: ConfigStats;
  color: 'indigo' | 'slate';
  tooltip?: string;
}) {
  const borderColor = color === 'indigo' ? 'border-indigo-100' : 'border-slate-200';
  const bgColor = color === 'indigo' ? 'bg-indigo-50/50' : 'bg-slate-50/50';
  const titleColor = color === 'indigo' ? 'text-indigo-700' : 'text-slate-600';

  return (
    <div className={`rounded-xl border ${borderColor} ${bgColor} p-4`}>
      <div className="flex items-center gap-2 mb-3">
        <h4 className={`text-xs font-bold ${titleColor} uppercase tracking-wide`}>
          {label}
        </h4>
        {tooltip && <InfoTip text={tooltip} />}
      </div>
      <div className="space-y-2">
        <StatsRow label="Pass Rate" stats={stats.passRate} unit="%" tooltip="Percentage of runs that passed all assertions" />
        <StatsRow label="Score" stats={stats.score} unit="/100" tooltip="Grading score from the AI grader (0–100)" />
        <StatsRow label="Duration" stats={stats.durationMs} unit="" formatter={formatDuration} tooltip="Wall-clock time per eval run" />
        <StatsRow label="Tokens" stats={stats.tokens} unit="" tooltip="Total tokens consumed per eval run" />
      </div>
    </div>
  );
}

function StatsRow({ label, stats, unit, tooltip, formatter }: { label: string; stats: StatsSummary; unit: string; tooltip?: string; formatter?: (v: number) => string }) {
  const fmt = formatter ?? ((v: number) => `${v.toFixed(1)}${unit}`);
  return (
    <div className="flex items-center justify-between text-xs">
      <span className="flex items-center gap-1 text-slate-500 font-medium">
        {label}
        {tooltip && <InfoTip text={tooltip} size="h-3 w-3" />}
      </span>
      <span className="text-slate-700 font-mono">
        {fmt(stats.mean)}{' '}
        <span className="text-slate-400">
          ± {fmt(stats.stddev)} [{fmt(stats.min)}–{fmt(stats.max)}]
        </span>
      </span>
    </div>
  );
}

/**
 * Shows a delta value with color coding: green for improvements, red for regressions.
 */
function DeltaBadge({
  label,
  value,
  unit,
  higherIsBetter,
  tooltip,
  formatter,
}: {
  label: string;
  value: string;
  unit: string;
  higherIsBetter: boolean;
  tooltip?: string;
  formatter?: (n: number) => string;
}) {
  const numValue = parseFloat(value);
  const isPositive = numValue > 0;
  const isGood = higherIsBetter ? isPositive : !isPositive;
  const isNeutral = numValue === 0;

  const colorClass = isNeutral
    ? 'text-slate-500 bg-slate-50 border-slate-200'
    : isGood
      ? 'text-emerald-700 bg-emerald-50 border-emerald-200/60'
      : 'text-red-700 bg-red-50 border-red-200/60';

  const displayValue = formatter
    ? `${numValue > 0 ? '+' : ''}${formatter(numValue)}`
    : `${value}${unit}`;

  return (
    <div className={`rounded-lg border px-3 py-2 ${colorClass}`}>
      <div className="flex items-center gap-1">
        <span className="text-[10px] font-medium uppercase tracking-wide opacity-70">{label}</span>
        {tooltip && <InfoTip text={tooltip} size="h-3 w-3" />}
      </div>
      <div className="text-sm font-bold font-mono">
        {displayValue}
      </div>
    </div>
  );
}

/**
 * Colored badge showing discrimination status for an assertion.
 */
function DiscriminationBadge({ value }: { value: string }) {
  const configs: Record<string, { label: string; className: string }> = {
    'non-discriminating': {
      label: 'Non-discriminating',
      className: 'bg-amber-50 text-amber-700 border-amber-200/60',
    },
    'skill-adds-value': {
      label: 'Skill adds value',
      className: 'bg-emerald-50 text-emerald-700 border-emerald-200/60',
    },
    'skill-hurts': {
      label: 'Skill hurts',
      className: 'bg-red-50 text-red-700 border-red-200/60',
    },
    'broken': {
      label: 'Broken',
      className: 'bg-slate-100 text-slate-600 border-slate-200',
    },
    'inconclusive': {
      label: 'Inconclusive',
      className: 'bg-slate-50 text-slate-400 border-slate-200',
    },
  };

  const config = configs[value] || configs['inconclusive'];

  return (
    <span className={`inline-flex items-center px-2 py-0.5 rounded-full border text-[10px] font-semibold ${config.className}`}>
      {config.label}
    </span>
  );
}

/**
 * Card displaying a single iteration's stats in the iteration timeline.
 */
function IterationCard({ iter }: { iter: IterationStats }) {
  const resultColors: Record<string, string> = {
    won: 'border-emerald-200 bg-emerald-50/50',
    lost: 'border-red-200 bg-red-50/50',
    tie: 'border-slate-200 bg-slate-50/50',
    baseline: 'border-blue-200 bg-blue-50/50',
  };

  const resultIcons: Record<string, string> = {
    won: '🟢',
    lost: '🔴',
    tie: '⚪',
    baseline: '🔵',
  };

  const borderClass = iter.gradingResult
    ? resultColors[iter.gradingResult] || 'border-slate-200'
    : 'border-slate-200';

  return (
    <div className={`rounded-xl border ${borderClass} p-4 min-w-[140px]`}>
      <div className="flex items-center gap-2 mb-2">
        <span className="text-xs font-bold text-slate-700">
          Iteration {iter.iteration}
        </span>
        {iter.gradingResult && (
          <span title={iter.gradingResult}>
            {resultIcons[iter.gradingResult] || ''}
          </span>
        )}
      </div>
      <div className="space-y-1 text-xs">
        <div className="flex justify-between">
          <span className="text-slate-500">Pass Rate</span>
          <span className="font-mono font-medium text-slate-700">
            {iter.passRate.toFixed(1)}%
          </span>
        </div>
        <div className="flex justify-between">
          <span className="text-slate-500">Avg Score</span>
          <span className="font-mono font-medium text-slate-700">
            {iter.averageScore.toFixed(1)}
          </span>
        </div>
        <div className="flex justify-between">
          <span className="text-slate-500">Runs</span>
          <span className="font-mono font-medium text-slate-700">{iter.runCount}</span>
        </div>
        {iter.delta && (
          <div className="flex justify-between pt-1 border-t border-slate-100">
            <span className="text-slate-400">Δ Rate</span>
            <span className={`font-mono font-medium ${parseFloat(iter.delta.passRate) > 0 ? 'text-emerald-600' : parseFloat(iter.delta.passRate) < 0 ? 'text-red-600' : 'text-slate-500'}`}>
              {iter.delta.passRate}%
            </span>
          </div>
        )}
      </div>
      <div className="mt-2 text-[10px] text-slate-400">
        v{iter.skillVersion}
      </div>
    </div>
  );
}

/**
 * Sparkline trend charts for pass rate and score across iterations.
 * Uses memoized data extraction to avoid re-computation.
 */
function IterationSparklines({ iterations }: { iterations: IterationStats[] }) {
  const { passRates, scores, iterLabels } = useMemo(() => {
    const sorted = [...iterations].sort((a, b) => a.iteration - b.iteration);
    return {
      passRates: sorted.map((it) => it.passRate),
      scores: sorted.map((it) => it.averageScore),
      iterLabels: sorted.map((it) => `Iteration ${it.iteration} · v${it.skillVersion}`),
    };
  }, [iterations]);

  const n = iterations.length;

  return (
    <div className="mb-5">
      <div className="flex items-center gap-2 mb-2">
        <InfoTip text="Visual trend of how your skill's pass rate and score change across improvement iterations. Hover over data points for exact values." size="h-3 w-3" />
      </div>
      <div className="grid grid-cols-1 sm:grid-cols-2 gap-4 rounded-xl border border-slate-100 bg-slate-50/50 p-4">
        <SparklineWithLabel
          label="Pass Rate"
          data={passRates}
          labels={iterLabels}
          formatValue={(v) => `${v.toFixed(1)}%`}
          color="#10b981"
          minY={0}
          maxY={100}
        />
        <SparklineWithLabel
          label="Avg Score"
          data={scores}
          labels={iterLabels}
          formatValue={(v) => v.toFixed(1)}
          color="#8b5cf6"
          minY={0}
          maxY={100}
        />
      </div>
      <p className="text-[10px] text-slate-400 mt-1.5 text-center">
        {passRates[passRates.length - 1] > passRates[0] + 0.5
          ? '🟢 Improving over time'
          : passRates[passRates.length - 1] < passRates[0] - 0.5
            ? '🔴 Declining over time'
            : '⚪ Stable'
        }
        {' · '}{n} iteration{n !== 1 ? 's' : ''}
      </p>
    </div>
  );
}
