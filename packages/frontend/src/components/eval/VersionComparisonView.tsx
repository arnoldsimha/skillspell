import React, { useMemo } from 'react';
import type { EvalBenchmark } from '@skillspell/shared';
import { formatDuration } from '../../utils/formatDuration.js';
import { InfoTip } from '../common/InfoTip.js';

interface VersionComparisonViewProps {
  versionA: number;
  versionB: number;
  benchmarkA: EvalBenchmark;
  benchmarkB: EvalBenchmark;
  onClose: () => void;
}

/**
 * Side-by-side aggregate comparison of two skill versions.
 * Shows summary stat cards with deltas, and per-test-case comparison table.
 *
 * Performance: wrapped in React.memo; all derivations are memoized.
 */
export const VersionComparisonView = React.memo(function VersionComparisonView({
  versionA,
  versionB,
  benchmarkA,
  benchmarkB,
  onClose,
}: VersionComparisonViewProps) {
  // Compute per-test-case comparison
  const caseComparison = useMemo(() => {
    const mapA = new Map(benchmarkA.byEvalCase.map((c) => [c.evalId, c]));
    const mapB = new Map(benchmarkB.byEvalCase.map((c) => [c.evalId, c]));

    // Union of all case IDs
    const allIds = new Set([...mapA.keys(), ...mapB.keys()]);

    const rows: Array<{
      evalId: string;
      name: string;
      passRateA: number | null;
      passRateB: number | null;
      scoreA: number | null;
      scoreB: number | null;
      deltaPassRate: number | null;
      deltaScore: number | null;
      verdict: 'improved' | 'regressed' | 'unchanged' | 'new' | 'removed';
    }> = [];

    for (const id of allIds) {
      const a = mapA.get(id);
      const b = mapB.get(id);
      const name = b?.evalName || a?.evalName || id;

      const passRateA = a?.passRate ?? null;
      const passRateB = b?.passRate ?? null;
      const scoreA = a?.averageScore ?? null;
      const scoreB = b?.averageScore ?? null;

      const deltaPassRate = passRateA != null && passRateB != null ? passRateB - passRateA : null;
      const deltaScore = scoreA != null && scoreB != null ? scoreB - scoreA : null;

      let verdict: typeof rows[number]['verdict'];
      if (!a) {
        verdict = 'new';
      } else if (!b) {
        verdict = 'removed';
      } else if (deltaPassRate != null && deltaPassRate > 1) {
        verdict = 'improved';
      } else if (deltaPassRate != null && deltaPassRate < -1) {
        verdict = 'regressed';
      } else {
        verdict = 'unchanged';
      }

      rows.push({ evalId: id, name, passRateA, passRateB, scoreA, scoreB, deltaPassRate, deltaScore, verdict });
    }

    // Sort: improved first, then regressed, unchanged, new, removed
    const order = { improved: 0, regressed: 1, unchanged: 2, new: 3, removed: 4 };
    rows.sort((a, b) => order[a.verdict] - order[b.verdict]);

    return rows;
  }, [benchmarkA.byEvalCase, benchmarkB.byEvalCase]);

  // Summary counts
  const summary = useMemo(() => {
    let improved = 0, regressed = 0, unchanged = 0, newCases = 0;
    for (const row of caseComparison) {
      if (row.verdict === 'improved') improved++;
      else if (row.verdict === 'regressed') regressed++;
      else if (row.verdict === 'new') newCases++;
      else if (row.verdict === 'unchanged') unchanged++;
    }
    const netDelta = benchmarkB.passRate - benchmarkA.passRate;
    return { improved, regressed, unchanged, newCases, netDelta };
  }, [caseComparison, benchmarkA.passRate, benchmarkB.passRate]);

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-3">
          <div className="flex h-8 w-8 items-center justify-center rounded-lg bg-blue-50">
            <svg className="h-4 w-4 text-blue-600" fill="none" viewBox="0 0 24 24" strokeWidth={2} stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" d="M7.5 21 3 16.5m0 0L7.5 12M3 16.5h13.5m0-13.5L21 7.5m0 0L16.5 12M21 7.5H7.5" />
            </svg>
          </div>
          <div>
            <h3 className="text-sm font-bold text-slate-800">
              Version Comparison: v{versionA} → v{versionB}
            </h3>
            <p className="text-[10px] text-slate-500">
              Comparing aggregate metrics between two versions
            </p>
          </div>
          <InfoTip text="Compare benchmark metrics between two skill versions to see which performs better across all test cases" />
        </div>
        <button
          onClick={onClose}
          className="rounded-lg px-3 py-1.5 text-xs font-medium text-slate-500 hover:bg-slate-100 transition-all duration-200"
        >
          ✕ Clear comparison
        </button>
      </div>

      {/* Summary stat cards */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
        <ComparisonStatCard
          label="Pass Rate"
          valueA={`${benchmarkA.passRate.toFixed(1)}%`}
          valueB={`${benchmarkB.passRate.toFixed(1)}%`}
          delta={benchmarkB.passRate - benchmarkA.passRate}
          unit="%"
          higherIsBetter
        />
        <ComparisonStatCard
          label="Avg Score"
          valueA={`${benchmarkA.averageScore.toFixed(1)}`}
          valueB={`${benchmarkB.averageScore.toFixed(1)}`}
          delta={benchmarkB.averageScore - benchmarkA.averageScore}
          unit=""
          higherIsBetter
        />
        <ComparisonStatCard
          label="Avg Duration"
          valueA={formatDuration(benchmarkA.averageDurationMs)}
          valueB={formatDuration(benchmarkB.averageDurationMs)}
          delta={benchmarkB.averageDurationMs - benchmarkA.averageDurationMs}
          unit="ms"
          higherIsBetter={false}
        />
        <ComparisonStatCard
          label="Total Runs"
          valueA={benchmarkA.totalRuns.toString()}
          valueB={benchmarkB.totalRuns.toString()}
          delta={benchmarkB.totalRuns - benchmarkA.totalRuns}
          unit=""
          higherIsBetter
        />
      </div>

      {/* Summary verdict */}
      <div className={`rounded-xl border px-4 py-3 flex items-center gap-3 flex-wrap ${
        summary.netDelta > 1
          ? 'border-emerald-200 bg-emerald-50/50'
          : summary.netDelta < -1
            ? 'border-red-200 bg-red-50/50'
            : 'border-slate-200 bg-slate-50/50'
      }`}>
        <span className="text-lg">
          {summary.netDelta > 1 ? '🟢' : summary.netDelta < -1 ? '🔴' : '⚪'}
        </span>
        <div className="text-sm">
          <span className="font-semibold text-slate-800">
            v{versionB} {summary.netDelta > 1 ? 'improves' : summary.netDelta < -1 ? 'regresses' : 'is comparable to'} vs v{versionA}
          </span>
          <span className="text-slate-500 ml-2">
            {summary.improved > 0 && <span className="text-emerald-600 font-medium">{summary.improved} improved</span>}
            {summary.improved > 0 && (summary.regressed > 0 || summary.unchanged > 0) && ', '}
            {summary.regressed > 0 && <span className="text-red-600 font-medium">{summary.regressed} regressed</span>}
            {summary.regressed > 0 && summary.unchanged > 0 && ', '}
            {summary.unchanged > 0 && <span>{summary.unchanged} unchanged</span>}
            {summary.newCases > 0 && <span className="text-blue-600 ml-1">+ {summary.newCases} new</span>}
          </span>
        </div>
        <div className="ml-auto">
          <span className={`font-mono font-bold text-sm ${
            summary.netDelta > 0 ? 'text-emerald-600' : summary.netDelta < 0 ? 'text-red-600' : 'text-slate-500'
          }`}>
            {summary.netDelta > 0 ? '+' : ''}{summary.netDelta.toFixed(1)}% pass rate
          </span>
          <InfoTip text="Net improvement is calculated from the difference in overall pass rates between the two versions" size="h-3 w-3" />
        </div>
      </div>

      {/* Per-test-case comparison table */}
      {caseComparison.length > 0 && (
        <div className="overflow-x-auto rounded-xl border border-slate-200">
          <table className="min-w-full divide-y divide-slate-200">
            <thead className="bg-slate-50/80">
              <tr>
                <th className="px-4 py-3 text-left text-[10px] font-bold text-slate-500 uppercase tracking-wider">Test Case</th>
                <th className="px-4 py-3 text-right text-[10px] font-bold text-indigo-500 uppercase tracking-wider">v{versionA} Pass</th>
                <th className="px-4 py-3 text-right text-[10px] font-bold text-purple-500 uppercase tracking-wider">v{versionB} Pass</th>
                <th className="px-4 py-3 text-right text-[10px] font-bold text-slate-500 uppercase tracking-wider">
                  Δ Rate
                  <InfoTip text="Pass rate change for this specific test case between the two versions" size="h-3 w-3" />
                </th>
                <th className="px-4 py-3 text-center text-[10px] font-bold text-slate-500 uppercase tracking-wider">Verdict</th>
              </tr>
            </thead>
            <tbody className="bg-white divide-y divide-slate-100">
              {caseComparison.map((row) => (
                <tr key={row.evalId} className="hover:bg-slate-50/50 transition-colors">
                  <td className="px-4 py-3 text-sm font-medium text-slate-700">{row.name}</td>
                  <td className="px-4 py-3 text-right text-sm text-slate-600">
                    {row.passRateA != null ? `${row.passRateA.toFixed(1)}%` : '—'}
                  </td>
                  <td className="px-4 py-3 text-right text-sm text-slate-600">
                    {row.passRateB != null ? `${row.passRateB.toFixed(1)}%` : '—'}
                  </td>
                  <td className="px-4 py-3 text-right">
                    {row.deltaPassRate != null ? (
                      <span className={`font-mono text-sm font-medium ${
                        row.deltaPassRate > 1 ? 'text-emerald-600' : row.deltaPassRate < -1 ? 'text-red-600' : 'text-slate-500'
                      }`}>
                        {row.deltaPassRate > 0 ? '+' : ''}{row.deltaPassRate.toFixed(1)}%
                      </span>
                    ) : (
                      <span className="text-xs text-slate-400">—</span>
                    )}
                  </td>
                  <td className="px-4 py-3 text-center">
                    <VerdictBadge verdict={row.verdict} />
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
});

/* ─── Helper Components ──────────────────────────────────────────────── */

function ComparisonStatCard({
  label,
  valueA,
  valueB,
  delta,
  unit,
  higherIsBetter,
}: {
  label: string;
  valueA: string;
  valueB: string;
  delta: number;
  unit: string;
  higherIsBetter: boolean;
}) {
  const isGood = higherIsBetter ? delta > 0.5 : delta < -0.5;
  const isBad = higherIsBetter ? delta < -0.5 : delta > 0.5;

  return (
    <div className="rounded-xl border border-slate-200 bg-white p-3">
      <span className="text-[10px] font-bold text-slate-500 uppercase tracking-wider">{label}</span>
      <div className="flex items-baseline gap-2 mt-1">
        <span className="text-sm text-slate-500 font-mono">{valueA}</span>
        <svg className="h-3 w-3 text-slate-300" fill="none" viewBox="0 0 24 24" strokeWidth={2} stroke="currentColor">
          <path strokeLinecap="round" strokeLinejoin="round" d="M13.5 4.5 21 12m0 0-7.5 7.5M21 12H3" />
        </svg>
        <span className="text-sm text-slate-800 font-mono font-bold">{valueB}</span>
      </div>
      <div className={`text-[10px] font-mono font-semibold mt-0.5 ${
        isGood ? 'text-emerald-600' : isBad ? 'text-red-600' : 'text-slate-400'
      }`}>
        {delta > 0 ? '+' : ''}{unit === 'ms' ? delta.toFixed(0) : delta.toFixed(1)}{unit}
      </div>
    </div>
  );
}

function VerdictBadge({ verdict }: { verdict: string }) {
  const configs: Record<string, { label: string; className: string; icon: string }> = {
    improved: { label: 'Improved', className: 'bg-emerald-50 text-emerald-700 border-emerald-200/60', icon: '🟢' },
    regressed: { label: 'Regressed', className: 'bg-red-50 text-red-700 border-red-200/60', icon: '🔴' },
    unchanged: { label: 'Unchanged', className: 'bg-slate-50 text-slate-500 border-slate-200', icon: '⚪' },
    new: { label: 'New', className: 'bg-blue-50 text-blue-700 border-blue-200/60', icon: '🟡' },
    removed: { label: 'Removed', className: 'bg-slate-100 text-slate-400 border-slate-200', icon: '⬜' },
  };

  const config = configs[verdict] || configs.unchanged;

  return (
    <span className={`inline-flex items-center gap-1 px-2 py-0.5 rounded-full border text-[10px] font-semibold ${config.className}`}>
      {config.icon} {config.label}
    </span>
  );
}
