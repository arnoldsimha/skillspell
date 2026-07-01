import { useState } from 'react';
import type { EvalAssertionResult, EvalGrading } from '@skillspell/shared';
import { InfoTip } from '../common/InfoTip.js';
import { ClaimsSection } from './ClaimsSection.js';
import { ExplainFailureCard } from './ExplainFailureCard.js';
import { formatDateWithPrefs } from '../../utils/formatDate.js';
import { useUserPreferences } from '../../hooks/useUserPreferences.js';

interface EvalGradesProps {
  grading: EvalGrading;
  /** Skill ID — required for the "Explain Failure" feature (C3). */
  skillId?: string;
  /** Run ID — required for the "Explain Failure" feature (C3). */
  runId?: string;
  onOptimize?: () => void;
}

/**
 * Displays eval grading results: overall score, individual assertion results
 * (collapsible), auto-discovered claims (B4), and grading metadata.
 *
 * C3: When `skillId` and `runId` are provided and the run failed,
 * shows an "Explain Failure" card that synthesizes grading data into
 * a plain-language explanation with actionable fix suggestions.
 */
export function EvalGrades({ grading, skillId, runId, onOptimize }: EvalGradesProps) {
  const { prefs } = useUserPreferences();
  return (
    <div className="space-y-4">
      {/* Overall score header */}
      <div className="flex items-center justify-between rounded-xl border border-slate-200 bg-slate-50/80 p-4">
        <div className="flex items-center gap-3">
          <StatusBadge status={grading.overall} />
          <span className="text-sm font-semibold text-slate-700">Overall Score</span>
          <InfoTip text="Weighted grading score: 100 = all assertions pass perfectly. Score combines pass/fail results with confidence levels." />
        </div>
        <span className="text-2xl font-bold text-slate-800">
          {grading.score}<span className="text-sm font-normal text-slate-400">/100</span>
        </span>
      </div>

      {/* Plain-English summary card — shown whenever a summary exists; the
          optimize CTA below remains conditional on an onOptimize handler. */}
      {grading.plainEnglishSummary && (
        <div className="rounded-xl border border-indigo-100 bg-indigo-50/50 px-4 py-3">
          <p className="text-xs font-semibold uppercase tracking-wide text-indigo-500 mb-1">
            What this means
          </p>
          <p className="text-sm text-slate-700 leading-relaxed">
            {grading.plainEnglishSummary}
          </p>
          {onOptimize && (
            <button
              type="button"
              onClick={onOptimize}
              className="mt-2 flex items-center gap-1 text-sm font-medium text-indigo-600 hover:text-indigo-700 transition-colors"
            >
              Suggested next step: Auto-optimize →
            </button>
          )}
        </div>
      )}

      {/* C3: Explain Failure card — shown for failed/partial runs */}
      {grading.overall !== 'pass' && skillId && runId && (
        <ExplainFailureCard skillId={skillId} runId={runId} grading={grading} />
      )}

      {/* Individual assertions */}
      <div className="space-y-2">
        <div className="flex items-center gap-1.5">
          <h4 className="text-[10px] font-bold text-slate-500 uppercase tracking-wider">
            Assertions ({grading.assertionResults.length})
          </h4>
          <InfoTip text="Each assertion is an individual check that evaluates a specific aspect of the output. Click to expand for details." size="h-3 w-3" />
        </div>
        {grading.assertionResults.map((result, index) => (
          <AssertionResultItem key={index} result={result} />
        ))}
      </div>

      {/* Auto-discovered claims (B4) */}
      {grading.extractedClaims && grading.extractedClaims.length > 0 && (
        <ClaimsSection claims={grading.extractedClaims} />
      )}

      {/* Eval self-critique / test suite feedback */}
      {grading.evalFeedback && (grading.evalFeedback.suggestions?.length > 0 || grading.evalFeedback.overall) && (
        <EvalCritique evalFeedback={grading.evalFeedback} />
      )}

      {/* Grading metadata */}
      <div className="text-xs text-slate-400">
        Graded by <span className="font-medium text-slate-500">{grading.gradedBy}</span>
        {' · '}
        {formatDateWithPrefs(grading.gradedAt, prefs)}
      </div>
    </div>
  );
}

/* ─── Sub-components ─────────────────────────────────────────────────── */

function StatusBadge({ status }: { status: 'pass' | 'fail' | 'partial' }) {
  const styles = {
    pass: 'bg-emerald-50 text-emerald-700 border-emerald-200/60',
    fail: 'bg-red-50 text-red-700 border-red-200/60',
    partial: 'bg-amber-50 text-amber-700 border-amber-200/60',
  };

  const icons = {
    pass: (
      <svg className="h-3.5 w-3.5" fill="none" viewBox="0 0 24 24" strokeWidth={2.5} stroke="currentColor">
        <path strokeLinecap="round" strokeLinejoin="round" d="m4.5 12.75 6 6 9-13.5" />
      </svg>
    ),
    fail: (
      <svg className="h-3.5 w-3.5" fill="none" viewBox="0 0 24 24" strokeWidth={2.5} stroke="currentColor">
        <path strokeLinecap="round" strokeLinejoin="round" d="M6 18 18 6M6 6l12 12" />
      </svg>
    ),
    partial: (
      <svg className="h-3.5 w-3.5" fill="none" viewBox="0 0 24 24" strokeWidth={2.5} stroke="currentColor">
        <path strokeLinecap="round" strokeLinejoin="round" d="M12 9v3.75m9-.75a9 9 0 1 1-18 0 9 9 0 0 1 18 0Zm-9 3.75h.008v.008H12v-.008Z" />
      </svg>
    ),
  };

  const labels = {
    pass: 'Pass',
    fail: 'Fail',
    partial: 'Partial',
  };

  const tooltips = {
    pass: 'All assertions passed — the output meets all defined criteria',
    fail: 'One or more assertions failed — the output does not meet all criteria',
    partial: 'Some assertions passed but others failed or had low confidence',
  };

  return (
    <span
      className={`inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full border text-xs font-semibold ${styles[status]}`}
      role="status"
      aria-label={`Overall result: ${status}`}
      title={tooltips[status]}
    >
      {icons[status]}
      {labels[status]}
    </span>
  );
}

function AssertionResultItem({ result }: { result: EvalAssertionResult }) {
  const [isExpanded, setIsExpanded] = useState(false);

  const assertionTypeTooltips: Record<string, string> = {
    contains: 'Checks if the output contains this text',
    not_contains: 'Checks that the output does NOT contain this text',
    regex: 'Checks the output against a regular expression pattern',
    semantic: 'AI-powered semantic quality assessment of the output',
    custom: 'Custom evaluation criterion',
  };

  return (
    <div className="rounded-xl border border-slate-200 overflow-hidden transition-all duration-200">
      <button
        onClick={() => setIsExpanded(!isExpanded)}
        className="w-full flex items-center justify-between p-3 hover:bg-slate-50/80 text-left transition-all duration-200"
        aria-expanded={isExpanded}
        aria-label={`Assertion: ${result.assertion.description || result.assertion.value} — ${result.passed ? 'passed' : 'failed'}`}
      >
        <div className="flex items-center gap-3 min-w-0">
          <span
            className={`flex h-5 w-5 shrink-0 items-center justify-center rounded-full ${
              result.passed
                ? 'bg-emerald-50 text-emerald-600'
                : 'bg-red-50 text-red-600'
            }`}
            aria-hidden="true"
          >
            {result.passed ? (
              <svg className="h-3 w-3" fill="none" viewBox="0 0 24 24" strokeWidth={3} stroke="currentColor">
                <path strokeLinecap="round" strokeLinejoin="round" d="m4.5 12.75 6 6 9-13.5" />
              </svg>
            ) : (
              <svg className="h-3 w-3" fill="none" viewBox="0 0 24 24" strokeWidth={3} stroke="currentColor">
                <path strokeLinecap="round" strokeLinejoin="round" d="M6 18 18 6M6 6l12 12" />
              </svg>
            )}
          </span>
          <span className="text-sm text-slate-700 truncate">
            <span className="inline-flex items-center gap-1 mr-1.5">
              <span className="font-mono text-[10px] rounded-md bg-slate-100 px-1.5 py-0.5 text-slate-500">
                {result.assertion.type}
              </span>
              <InfoTip
                text={assertionTypeTooltips[result.assertion.type] || 'Evaluates the output against this criterion'}
                size="h-3 w-3"
              />
            </span>
            {result.assertion.description || result.assertion.value}
          </span>
        </div>
        <svg
          className={`h-4 w-4 shrink-0 text-slate-400 transition-transform duration-200 ${isExpanded ? 'rotate-180' : ''}`}
          fill="none"
          viewBox="0 0 24 24"
          strokeWidth={2}
          stroke="currentColor"
          aria-hidden="true"
        >
          <path strokeLinecap="round" strokeLinejoin="round" d="m19.5 8.25-7.5 7.5-7.5-7.5" />
        </svg>
      </button>

      {isExpanded && (
        <div className="p-3 bg-slate-50/50 border-t border-slate-200/60 text-sm space-y-2">
          {(result.assertion.description || result.assertion.value) && (
            <div>
              <span className="text-[10px] font-bold text-slate-500 uppercase tracking-wider">Assertion</span>
              <p className="mt-0.5 text-sm text-slate-700 leading-relaxed">
                {result.assertion.description || result.assertion.value}
              </p>
            </div>
          )}
          <div>
            <span className="text-[10px] font-bold text-slate-500 uppercase tracking-wider">Value</span>
            <div className="mt-0.5">
              <code className="bg-slate-100 px-2 py-1 rounded-lg text-xs font-mono text-slate-700">
                {result.assertion.value}
              </code>
            </div>
          </div>
          {result.evidence && (
            <div>
              <div className="flex items-center gap-1">
                <span className="text-[10px] font-bold text-slate-500 uppercase tracking-wider">Evidence</span>
                <InfoTip text="Reasoning from the AI grader explaining why this assertion passed or failed" size="h-3 w-3" />
              </div>
              <p className="mt-0.5 text-xs text-slate-600 leading-relaxed">{result.evidence}</p>
            </div>
          )}
          {result.confidence !== undefined && (
            <div>
              <div className="flex items-center gap-1">
                <span className="text-[10px] font-bold text-slate-500 uppercase tracking-wider">Confidence</span>
                <InfoTip text="How confident the AI grader is in this assessment — higher means more certain" size="h-3 w-3" />
              </div>
              <div className="mt-1 flex items-center gap-2">
                <div className="h-1.5 flex-1 rounded-full bg-slate-200 overflow-hidden">
                  <div
                    className="h-full rounded-full bg-indigo-500 transition-all duration-300"
                    style={{ width: `${result.confidence * 100}%` }}
                  />
                </div>
                <span className="text-xs font-medium text-slate-600">{(result.confidence * 100).toFixed(0)}%</span>
              </div>
            </div>
          )}
        </div>
      )}
    </div>
  );
}

/**
 * Collapsible section displaying the grader's self-critique of the test case.
 */
export function EvalCritique({
  evalFeedback,
}: {
  evalFeedback: NonNullable<EvalGrading['evalFeedback']>;
}) {
  const [isExpanded, setIsExpanded] = useState(false);

  return (
    <div className="rounded-xl border border-amber-200/60 bg-amber-50/50 overflow-hidden">
      <button
        onClick={() => setIsExpanded(!isExpanded)}
        className="w-full flex items-center justify-between p-3 hover:bg-amber-50 text-left transition-all duration-200"
        aria-expanded={isExpanded}
      >
        <div className="flex items-center gap-2">
          <svg
            className="h-4 w-4 text-amber-500"
            fill="none"
            viewBox="0 0 24 24"
            strokeWidth={2}
            stroke="currentColor"
          >
            <path
              strokeLinecap="round"
              strokeLinejoin="round"
              d="M12 18v-5.25m0 0a6.01 6.01 0 0 0 1.5-.189m-1.5.189a6.01 6.01 0 0 1-1.5-.189m3.75 7.478a12.06 12.06 0 0 1-4.5 0m3.75 2.383a14.406 14.406 0 0 1-3 0M14.25 18v-.192c0-.983.658-1.823 1.508-2.316a7.5 7.5 0 1 0-7.517 0c.85.493 1.509 1.333 1.509 2.316V18"
            />
          </svg>
          <span className="text-xs font-bold text-amber-700 uppercase tracking-wide">
            Test Suite Feedback
          </span>
          <InfoTip text="The AI grader's meta-analysis of the test case quality — identifies weak or redundant assertions and suggests improvements to make your tests more effective." size="h-3 w-3" />
          {evalFeedback.suggestions && (
            <span className="text-[10px] bg-amber-100 text-amber-600 px-1.5 py-0.5 rounded-full font-medium">
              {evalFeedback.suggestions.length} suggestion{evalFeedback.suggestions.length !== 1 ? 's' : ''}
            </span>
          )}
        </div>
        <svg
          className={`h-4 w-4 text-amber-400 transition-transform duration-200 ${isExpanded ? 'rotate-180' : ''}`}
          fill="none"
          viewBox="0 0 24 24"
          strokeWidth={2}
          stroke="currentColor"
        >
          <path strokeLinecap="round" strokeLinejoin="round" d="m19.5 8.25-7.5 7.5-7.5-7.5" />
        </svg>
      </button>

      {isExpanded && (
        <div className="p-3 border-t border-amber-200/60 space-y-3">
          {/* Overall assessment */}
          {evalFeedback.overall && (
            <div>
              <p className="text-[10px] font-bold text-amber-600 uppercase tracking-wider mb-1">Overall Assessment</p>
              <p className="text-sm text-amber-800 leading-relaxed">
                {evalFeedback.overall}
              </p>
            </div>
          )}

          {/* Individual suggestions */}
          {evalFeedback.suggestions && evalFeedback.suggestions.length > 0 && (
            <div className="space-y-2">
              <p className="text-[10px] font-bold text-amber-600 uppercase tracking-wider">Suggestions for Improvement</p>
              {evalFeedback.suggestions.map((suggestion, i) => (
                <div
                  key={i}
                  className="rounded-lg bg-white/60 border border-amber-200/40 px-3 py-2"
                >
                  {suggestion.assertion && (
                    <div className="text-[10px] font-mono text-amber-500 mb-1">
                      {suggestion.assertion}
                    </div>
                  )}
                  <p className="text-xs text-amber-800 leading-relaxed">
                    {suggestion.reason}
                  </p>
                </div>
              ))}
            </div>
          )}
        </div>
      )}
    </div>
  );
}
