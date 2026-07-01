import { useState, useMemo } from 'react';
import type { EvalGrading, FailureExplanation } from '@skillspell/shared';
import { explainFailure } from '../../services/api/index.js';
import { InfoTip } from '../common/InfoTip.js';

interface ExplainFailureCardProps {
  skillId: string;
  runId: string;
  grading: EvalGrading;
}

/**
 * C3: "Explain Failure" card — shows a plain-language explanation of why
 * an eval run failed, with actionable suggestions for fixing the skill.
 *
 * Two modes:
 * - Mode 1 (client-side synthesis): instant, no API call — for simple failures
 *   with 1-2 failed assertions that have clear evidence.
 * - Mode 2 (AI explanation): calls the backend `/explain` endpoint — for
 *   complex failures with 3+ assertions or unclear evidence.
 *
 * Appears inside EvalGrades when `grading.overall !== 'pass'`.
 */
export function ExplainFailureCard({ skillId, runId, grading }: ExplainFailureCardProps) {
  const [explanation, setExplanation] = useState<FailureExplanation | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // Check if we can synthesize locally (Mode 1)
  const canSynthesize = useMemo(() => {
    const failed = grading.assertionResults.filter((r) => !r.passed);
    return failed.length <= 2 && failed.every((a) => a.evidence && a.evidence.trim().length > 0);
  }, [grading]);

  const handleExplain = async () => {
    setError(null);

    if (canSynthesize) {
      // Mode 1: instant client-side synthesis
      setExplanation(synthesizeLocally(grading));
      return;
    }

    // Mode 2: API call for complex failures
    setLoading(true);
    try {
      const result = await explainFailure(skillId, runId);
      setExplanation(result);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to analyze failure');
    } finally {
      setLoading(false);
    }
  };

  if (grading.overall === 'pass') return null;

  return (
    <div className="rounded-xl border border-red-100 bg-red-50/30 p-4">
      {!explanation ? (
        <div className="flex items-center gap-2">
          <button
            type="button"
            onClick={handleExplain}
            disabled={loading}
            className="inline-flex items-center gap-2 rounded-lg border border-red-200 bg-white px-3 py-1.5 text-sm font-medium text-red-700 shadow-sm transition-all hover:bg-red-50 hover:border-red-300 disabled:opacity-50 disabled:cursor-not-allowed"
          >
            {loading ? (
              <>
                <svg className="h-4 w-4 animate-spin text-red-500" fill="none" viewBox="0 0 24 24">
                  <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
                  <path
                    className="opacity-75"
                    fill="currentColor"
                    d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"
                  />
                </svg>
                Analyzing…
              </>
            ) : (
              <>
                <svg className="h-4 w-4" fill="none" viewBox="0 0 24 24" strokeWidth={2} stroke="currentColor">
                  <path
                    strokeLinecap="round"
                    strokeLinejoin="round"
                    d="m21 21-5.197-5.197m0 0A7.5 7.5 0 1 0 5.196 5.196a7.5 7.5 0 0 0 10.607 10.607Z"
                  />
                </svg>
                Explain Failure
              </>
            )}
          </button>
          <InfoTip text="Analyzes the grading data to explain why this run failed and suggests specific changes to fix your skill." />
          {error && <span className="text-xs text-red-500">{error}</span>}
        </div>
      ) : (
        <div className="space-y-3">
          {/* Mode badge */}
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-2">
              <svg className="h-4 w-4 text-red-500" fill="none" viewBox="0 0 24 24" strokeWidth={2} stroke="currentColor">
                <path
                  strokeLinecap="round"
                  strokeLinejoin="round"
                  d="m21 21-5.197-5.197m0 0A7.5 7.5 0 1 0 5.196 5.196a7.5 7.5 0 0 0 10.607 10.607Z"
                />
              </svg>
              <span className="text-xs font-bold uppercase tracking-wider text-red-600">
                Failure Analysis
              </span>
            </div>
            <span className="text-[10px] rounded-full bg-red-100 px-2 py-0.5 text-red-500 font-medium">
              {explanation.mode === 'synthesized' ? 'From evidence' : 'AI analysis'}
            </span>
          </div>

          {/* Summary — "Why this failed" */}
          <div>
            <h4 className="text-[10px] font-bold uppercase tracking-wider text-red-600 mb-1">
              Why this failed
            </h4>
            <p className="text-sm text-slate-700 leading-relaxed whitespace-pre-line">
              {explanation.summary}
            </p>
          </div>

          {/* Root cause — "Root cause in skill" (AI mode only) */}
          {explanation.rootCause && (
            <div>
              <h4 className="text-[10px] font-bold uppercase tracking-wider text-amber-600 mb-1">
                Root cause in skill
              </h4>
              <p className="text-sm text-slate-700 leading-relaxed">
                {explanation.rootCause}
              </p>
            </div>
          )}

          {/* Suggestions — "What to fix" */}
          {explanation.suggestions.length > 0 && (
            <div>
              <h4 className="text-[10px] font-bold uppercase tracking-wider text-emerald-600 mb-1">
                What to fix
              </h4>
              <ul className="list-disc pl-4 space-y-1">
                {explanation.suggestions.map((s, i) => (
                  <li key={i} className="text-sm text-slate-700 leading-relaxed">
                    {s}
                  </li>
                ))}
              </ul>
            </div>
          )}

          {/* Dismiss button */}
          <button
            type="button"
            onClick={() => setExplanation(null)}
            className="text-xs text-slate-400 hover:text-slate-600 transition-colors"
          >
            Dismiss
          </button>
        </div>
      )}
    </div>
  );
}

/**
 * Mode 1: Client-side synthesis — build explanation from existing grading data.
 * Used for simple failures (1-2 assertions, clear evidence). Zero cost, instant.
 */
function synthesizeLocally(grading: EvalGrading): FailureExplanation {
  const failed = grading.assertionResults.filter((r) => !r.passed);

  const summary = failed
    .map((f) => {
      const desc = f.assertion.description || f.assertion.value;
      return `"${desc}" — ${f.evidence}`;
    })
    .join('\n\n');

  const suggestions: string[] = [];

  // Pull from eval feedback suggestions if available
  if (grading.evalFeedback?.suggestions) {
    for (const s of grading.evalFeedback.suggestions) {
      if (s.reason) suggestions.push(s.reason);
    }
  }

  // If no eval feedback, generate basic suggestions from failures
  if (suggestions.length === 0) {
    for (const f of failed) {
      const desc = f.assertion.description || f.assertion.value;
      if (f.assertion.type === 'contains' || f.assertion.type === 'not_contains') {
        suggestions.push(
          `Review the skill to ensure the output will ${f.assertion.type === 'contains' ? 'include' : 'exclude'}: "${f.assertion.value}"`,
        );
      } else if (f.assertion.type === 'semantic') {
        suggestions.push(
          `Make the skill instruction for "${desc}" more explicit with specific requirements`,
        );
      } else {
        suggestions.push(`Address the failing check: "${desc}"`);
      }
    }
  }

  return {
    mode: 'synthesized',
    summary,
    suggestions,
  };
}
