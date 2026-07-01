/**
 * Description Optimizer — 4-step guided wizard for optimizing a skill's
 * description for better trigger accuracy.
 *
 * Steps:
 * 1. Generate Trigger Evals (automatic)
 * 2. Review & Edit Evals (user interaction)
 * 3. Run Optimization Loop (automatic with progress)
 * 4. Review Results & Apply (user decision)
 */

import { useState, useEffect } from 'react';
import type { SkillSummary } from '@skillspell/shared';
import { useDescriptionOptimizer } from '../../hooks/useDescriptionOptimizer.js';
import { Button } from '../common/Button.js';
import { computeWordDiff } from '../../utils/diff.js';
import {
  useProgressMessages,
  useTip,
  formatElapsed,
  DESC_OPT_GENERATE_EVALS_MESSAGES,
  DESC_OPT_RUNNING_MESSAGES,
} from '../../hooks/useProgressMessages.js';

interface DescriptionOptimizerProps {
  skill: SkillSummary;
  onComplete: () => void;
  onCancel: () => void;
}

export default function DescriptionOptimizer({
  skill,
  onComplete,
  onCancel,
}: DescriptionOptimizerProps) {
  const {
    step,
    loading,
    error,
    queries,
    result,
    startGenerateEvals,
    toggleQueryTrigger,
    addQuery,
    removeQuery,
    startOptimization,
    cancelOptimization,
    applyDescription,
    reset,
  } = useDescriptionOptimizer();

  // Auto-start step 1 on mount
  useEffect(() => {
    startGenerateEvals(skill.id);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [skill.id]);

  const [newQueryText, setNewQueryText] = useState('');
  const [newQueryShouldTrigger, setNewQueryShouldTrigger] = useState(true);
  const [applied, setApplied] = useState(false);

  const handleAddQuery = () => {
    if (!newQueryText.trim()) return;
    addQuery(newQueryText.trim(), newQueryShouldTrigger);
    setNewQueryText('');
    setNewQueryShouldTrigger(true);
  };

  const handleApply = async () => {
    if (!result) return;
    await applyDescription(skill.id, result.bestDescription);
    setApplied(true);
  };

  const stepLabels = [
    'Generate Evals',
    'Review Evals',
    'Optimize',
    'Results',
  ];

  const stepIndex =
    step === 'generate-evals' ? 0 :
      step === 'review-evals' ? 1 :
        step === 'running' ? 2 : 3;

  return (
    <div className="flex h-full flex-col">
      {/* Header */}
      <div className="flex items-center justify-between border-b border-slate-200/80 px-6 py-4">
        <div>
          <h1 className="text-lg font-semibold text-slate-900">
            Optimize Description
          </h1>
          <p className="text-sm text-slate-500 mt-0.5">
            {skill.name}
          </p>
        </div>
        <Button
          type="button"
          onClick={() => {
            cancelOptimization();
            onCancel();
          }}
          variant="ghost"
          size="md"
        >
          Cancel
        </Button>
      </div>

      {/* Step Indicator */}
      <div className="flex items-center gap-2 px-6 py-3 border-b border-slate-100 bg-slate-50/50">
        {stepLabels.map((label, i) => (
          <div key={label} className="flex items-center gap-2">
            {i > 0 && (
              <div className={`h-px w-6 ${i <= stepIndex ? 'bg-indigo-300' : 'bg-slate-200'}`} />
            )}
            <div className="flex items-center gap-1.5">
              <div
                className={`flex h-6 w-6 items-center justify-center rounded-full text-xs font-semibold ${
                  i < stepIndex
                    ? 'bg-indigo-500 text-white'
                    : i === stepIndex
                      ? 'bg-indigo-100 text-indigo-700 ring-2 ring-indigo-500'
                      : 'bg-slate-100 text-slate-400'
                }`}
              >
                {i < stepIndex ? '✓' : i + 1}
              </div>
              <span
                className={`text-xs font-medium ${
                  i <= stepIndex ? 'text-slate-700' : 'text-slate-400'
                }`}
              >
                {label}
              </span>
            </div>
          </div>
        ))}
      </div>

      {/* Error banner */}
      {error && (
        <div className="mx-6 mt-4 rounded-xl bg-red-50 border border-red-200 px-4 py-3 text-sm text-red-700">
          {error}
        </div>
      )}

      {/* Step content */}
      <div className="flex-1 overflow-y-auto px-6 py-5">
        {/* Step 1: Generate Evals */}
        {step === 'generate-evals' && (
          <StepGenerateEvals loading={loading} />
        )}

        {/* Step 2: Review & Edit Evals */}
        {step === 'review-evals' && (
          <StepReviewEvals
            queries={queries}
            loading={loading}
            onToggle={toggleQueryTrigger}
            onRemove={removeQuery}
            newQueryText={newQueryText}
            newQueryShouldTrigger={newQueryShouldTrigger}
            onNewQueryTextChange={setNewQueryText}
            onNewQueryShouldTriggerChange={setNewQueryShouldTrigger}
            onAddQuery={handleAddQuery}
            onStartOptimization={() => startOptimization(skill.id)}
          />
        )}

        {/* Step 3: Running */}
        {step === 'running' && (
          <StepRunning />
        )}

        {/* Step 4: Results */}
        {step === 'results' && result && (
          <StepResults
            result={result}
            currentDescription={skill.description}
            applied={applied}
            loading={loading}
            onApply={handleApply}
            onKeepCurrent={onComplete}
            onComplete={onComplete}
            onReset={() => {
              reset();
              startGenerateEvals(skill.id);
            }}
          />
        )}
      </div>
    </div>
  );
}

// ── Step 1: Generate Evals ──────────────────────────────────────────

function StepGenerateEvals({ loading }: { loading: boolean }) {
  const { currentMessage, progress, elapsed } = useProgressMessages({
    messages: DESC_OPT_GENERATE_EVALS_MESSAGES,
    interval: 4000,
    active: loading,
  });

  const showElapsed = elapsed >= 6;

  return (
    <div className="flex flex-col items-center justify-center py-16 gap-6">
      <div className="flex h-16 w-16 items-center justify-center rounded-2xl bg-indigo-50">
        <svg className="h-8 w-8 text-indigo-500 animate-spin" fill="none" viewBox="0 0 24 24">
          <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
          <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z" />
        </svg>
      </div>

      {/* Animated message */}
      <div className="relative h-16 flex flex-col items-center justify-start overflow-hidden">
        <div key={currentMessage.text} className="flex flex-col items-center animate-fade-in-up">
          <h2 className="text-base font-semibold text-slate-900 flex items-center gap-2">
            {currentMessage.emoji && <span>{currentMessage.emoji}</span>}
            {currentMessage.text}
          </h2>
          {currentMessage.detail && (
            <p className="mt-1 text-sm text-slate-500 text-center max-w-md leading-relaxed">
              {currentMessage.detail}
            </p>
          )}
        </div>
      </div>

      {/* Progress bar */}
      <div className="w-48">
        <div className="h-1.5 w-full rounded-full bg-slate-100 overflow-hidden">
          <div
            className="h-full rounded-full bg-indigo-500 transition-all duration-1000 ease-out"
            style={{ width: `${Math.max(5, progress * 90 + 5)}%` }}
          />
        </div>
      </div>

      {/* Elapsed timer */}
      {showElapsed && (
        <span className="text-xs text-slate-400 font-medium tabular-nums animate-fade-in-up">
          {formatElapsed(elapsed)}
        </span>
      )}
    </div>
  );
}

// ── Step 2: Review & Edit Evals ─────────────────────────────────────

function StepReviewEvals({
  queries,
  loading,
  onToggle,
  onRemove,
  newQueryText,
  newQueryShouldTrigger,
  onNewQueryTextChange,
  onNewQueryShouldTriggerChange,
  onAddQuery,
  onStartOptimization,
}: {
  queries: Array<{ query: string; shouldTrigger: boolean }>;
  loading: boolean;
  onToggle: (i: number) => void;
  onRemove: (i: number) => void;
  newQueryText: string;
  newQueryShouldTrigger: boolean;
  onNewQueryTextChange: (v: string) => void;
  onNewQueryShouldTriggerChange: (v: boolean) => void;
  onAddQuery: () => void;
  onStartOptimization: () => void;
}) {
  const shouldTriggerCount = queries.filter((q) => q.shouldTrigger).length;
  const shouldNotCount = queries.length - shouldTriggerCount;

  return (
    <div className="space-y-5">
      {/* Guide text */}
      <div className="rounded-xl bg-blue-50 border border-blue-200 px-4 py-3">
        <p className="text-sm text-blue-800 leading-relaxed">
          <strong>Review these trigger test queries.</strong> Toggle whether each should or
          should not trigger your skill. Add your own edge cases — the trickier the better.
        </p>
      </div>

      {/* Stats */}
      <div className="flex gap-4 text-sm">
        <span className="inline-flex items-center gap-1.5 rounded-lg bg-emerald-50 px-3 py-1 text-emerald-700 font-medium">
          <span className="h-2 w-2 rounded-full bg-emerald-400" />
          {shouldTriggerCount} should trigger
        </span>
        <span className="inline-flex items-center gap-1.5 rounded-lg bg-amber-50 px-3 py-1 text-amber-700 font-medium">
          <span className="h-2 w-2 rounded-full bg-amber-400" />
          {shouldNotCount} should NOT trigger
        </span>
      </div>

      {/* Query table */}
      <div className="rounded-xl border border-slate-200 overflow-hidden">
        <table className="w-full text-sm">
          <thead>
            <tr className="bg-slate-50 border-b border-slate-200">
              <th className="px-4 py-2.5 text-left font-medium text-slate-600">Query</th>
              <th className="px-4 py-2.5 text-center font-medium text-slate-600 w-40">Should Trigger</th>
              <th className="px-4 py-2.5 w-12" />
            </tr>
          </thead>
          <tbody>
            {queries.map((q, i) => (
              <tr key={i} className="border-b border-slate-100 last:border-0 hover:bg-slate-50/50">
                <td className="px-4 py-2.5 text-slate-700">{q.query}</td>
                <td className="px-4 py-2.5 text-center">
                  <button
                    onClick={() => onToggle(i)}
                    className={`inline-flex items-center gap-1.5 rounded-lg px-3 py-1 text-xs font-semibold transition-all duration-200 ${
                      q.shouldTrigger
                        ? 'bg-emerald-100 text-emerald-700 hover:bg-emerald-200'
                        : 'bg-amber-100 text-amber-700 hover:bg-amber-200'
                    }`}
                  >
                    {q.shouldTrigger ? '✓ Yes' : '✗ No'}
                  </button>
                </td>
                <td className="px-4 py-2.5 text-center">
                  <button
                    onClick={() => onRemove(i)}
                    className="text-slate-400 hover:text-red-500 transition-colors"
                    title="Remove query"
                  >
                    <svg className="h-4 w-4" fill="none" viewBox="0 0 24 24" strokeWidth={2} stroke="currentColor">
                      <path strokeLinecap="round" strokeLinejoin="round" d="M6 18 18 6M6 6l12 12" />
                    </svg>
                  </button>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      {/* Add query row */}
      <div className="flex items-center gap-3">
        <input
          type="text"
          value={newQueryText}
          onChange={(e) => onNewQueryTextChange(e.target.value)}
          placeholder="Add a custom test query…"
          className="flex-1 rounded-xl border border-slate-200 px-4 py-2 text-sm text-slate-700 placeholder:text-slate-400 focus:border-indigo-300 focus:ring-2 focus:ring-indigo-100 outline-none transition-all"
          onKeyDown={(e) => e.key === 'Enter' && onAddQuery()}
        />
        <button
          onClick={() => onNewQueryShouldTriggerChange(!newQueryShouldTrigger)}
          className={`shrink-0 rounded-lg px-3 py-2 text-xs font-semibold transition-all ${
            newQueryShouldTrigger
              ? 'bg-emerald-100 text-emerald-700'
              : 'bg-amber-100 text-amber-700'
          }`}
        >
          {newQueryShouldTrigger ? 'Should ✓' : 'Should Not ✗'}
        </button>
        <Button
          type="button"
          onClick={onAddQuery}
          disabled={!newQueryText.trim()}
          variant="secondary"
          size="md"
          className="shrink-0"
        >
          Add
        </Button>
      </div>

      {/* Start button */}
      <div className="flex justify-end pt-2">
        <Button
          type="button"
          onClick={onStartOptimization}
          disabled={loading || queries.length < 4}
          variant="primary"
          size="lg"
          loading={loading}
          loadingText="Starting…"
        >
          Start Optimization
        </Button>
      </div>
    </div>
  );
}

// ── Step 3: Running ─────────────────────────────────────────────────

function StepRunning() {
  const { currentMessage, progress, elapsed } = useProgressMessages({
    messages: DESC_OPT_RUNNING_MESSAGES,
    interval: 6000,
    cycle: true,
    active: true,
  });

  const tip = useTip(elapsed, 20, 10);
  const showElapsed = elapsed >= 10;

  return (
    <div className="flex flex-col items-center justify-center py-16 gap-6">
      <div className="relative">
        <div className="absolute -inset-4 rounded-full bg-indigo-500/10 blur-xl animate-pulse" />
        <div className="relative flex h-16 w-16 items-center justify-center rounded-2xl bg-gradient-to-br from-indigo-500 to-purple-600 shadow-xl shadow-indigo-500/25 animate-pulse-glow">
          <div className="absolute inset-0 rounded-2xl border-2 border-white/20" />
          <svg
            className="h-7 w-7 text-white animate-spin-ease"
            fill="none"
            viewBox="0 0 24 24"
            strokeWidth={1.5}
            stroke="currentColor"
          >
            <path
              strokeLinecap="round"
              strokeLinejoin="round"
              d="M9.813 15.904 9 18.75l-.813-2.846a4.5 4.5 0 0 0-3.09-3.09L2.25 12l2.846-.813a4.5 4.5 0 0 0 3.09-3.09L9 5.25l.813 2.846a4.5 4.5 0 0 0 3.09 3.09L15.75 12l-2.846.813a4.5 4.5 0 0 0-3.09 3.09Z"
            />
          </svg>
        </div>
      </div>

      {/* Animated message */}
      <div className="relative h-16 flex flex-col items-center justify-start overflow-hidden">
        <div key={currentMessage.text} className="flex flex-col items-center animate-fade-in-up">
          <h2 className="text-base font-semibold text-slate-900 flex items-center gap-2">
            {currentMessage.emoji && <span>{currentMessage.emoji}</span>}
            {currentMessage.text}
          </h2>
          {currentMessage.detail && (
            <p className="mt-1 text-sm text-slate-500 text-center max-w-md leading-relaxed">
              {currentMessage.detail}
            </p>
          )}
        </div>
      </div>

      {/* Progress bar */}
      <div className="w-56">
        <div className="h-1.5 w-full rounded-full bg-slate-100 overflow-hidden">
          <div
            className="h-full rounded-full bg-gradient-to-r from-indigo-500 to-purple-500 transition-all duration-1000 ease-out"
            style={{ width: `${Math.max(5, progress * 85 + 10)}%` }}
          />
        </div>
      </div>

      {/* Bouncing dots + elapsed */}
      <div className="flex items-center gap-4">
        <div className="flex gap-1.5">
          <div className="h-2 w-2 animate-bounce rounded-full bg-indigo-500 [animation-delay:0ms]" />
          <div className="h-2 w-2 animate-bounce rounded-full bg-indigo-500 [animation-delay:150ms]" />
          <div className="h-2 w-2 animate-bounce rounded-full bg-indigo-500 [animation-delay:300ms]" />
        </div>
        {showElapsed && (
          <span className="text-xs text-slate-400 font-medium tabular-nums animate-fade-in-up">
            {formatElapsed(elapsed)}
          </span>
        )}
      </div>

      {/* Rotating tip for long waits */}
      {tip && (
        <div key={tip} className="max-w-sm rounded-xl bg-slate-50 border border-slate-200/60 px-4 py-2.5 animate-fade-in-up">
          <p className="text-xs text-slate-500 text-center leading-relaxed">{tip}</p>
        </div>
      )}
    </div>
  );
}

// ── Step 4: Results ─────────────────────────────────────────────────

function StepResults({
  result,
  currentDescription,
  applied,
  loading,
  onApply,
  onKeepCurrent,
  onComplete,
  onReset,
}: {
  result: {
    originalDescription: string;
    bestDescription: string;
    iterations: Array<{
      iteration: number;
      trainScore: number;
      testScore: number;
    }>;
    bestIteration: number;
    improvement: { trainDelta: number; testDelta: number };
  };
  currentDescription: string;
  applied: boolean;
  loading: boolean;
  onApply: () => void;
  onKeepCurrent: () => void;
  onComplete: () => void;
  onReset: () => void;
}) {
  if (applied) {
    return (
      <div className="flex flex-col items-center justify-center py-16 gap-6">
        <div className="flex h-16 w-16 items-center justify-center rounded-2xl bg-emerald-50">
          <svg className="h-8 w-8 text-emerald-500" fill="none" viewBox="0 0 24 24" strokeWidth={2} stroke="currentColor">
            <path strokeLinecap="round" strokeLinejoin="round" d="m4.5 12.75 6 6 9-13.5" />
          </svg>
        </div>
        <div className="text-center">
          <h2 className="text-base font-semibold text-slate-900 mb-1">
            Description Updated!
          </h2>
          <p className="text-sm text-slate-500">
            The optimized description has been applied to your skill.
          </p>
        </div>
        <Button
          type="button"
          onClick={onComplete}
          variant="primary"
          size="lg"
        >
          Done
        </Button>
      </div>
    );
  }

  const improved = result.improvement.testDelta > 0;
  const noChanges = result.bestDescription.trim() === currentDescription.trim();

  // When the optimizer found no improvements, show a simple success message
  if (noChanges) {
    return (
      <div className="space-y-5">
        {/* Score summary */}
        <div className="grid grid-cols-3 gap-4">
          <div className="rounded-xl border border-slate-200 p-4 text-center">
            <p className="text-xs font-medium text-slate-500 uppercase tracking-wide">Best Iteration</p>
            <p className="text-2xl font-bold text-indigo-600 mt-1">{result.bestIteration}</p>
            <p className="text-xs text-slate-400">of {result.iterations.length}</p>
          </div>
          <div className="rounded-xl border border-slate-200 p-4 text-center">
            <p className="text-xs font-medium text-slate-500 uppercase tracking-wide">Train Delta</p>
            <p className={`text-2xl font-bold mt-1 ${result.improvement.trainDelta >= 0 ? 'text-emerald-600' : 'text-red-600'}`}>
              {result.improvement.trainDelta >= 0 ? '+' : ''}{(result.improvement.trainDelta * 100).toFixed(1)}%
            </p>
          </div>
          <div className="rounded-xl border border-slate-200 p-4 text-center">
            <p className="text-xs font-medium text-slate-500 uppercase tracking-wide">Test Delta</p>
            <p className={`text-2xl font-bold mt-1 ${result.improvement.testDelta >= 0 ? 'text-emerald-600' : 'text-red-600'}`}>
              {result.improvement.testDelta >= 0 ? '+' : ''}{(result.improvement.testDelta * 100).toFixed(1)}%
            </p>
          </div>
        </div>

        {/* No changes message */}
        <div className="flex flex-col items-center justify-center py-10 gap-5">
          <div className="flex h-16 w-16 items-center justify-center rounded-2xl bg-emerald-50">
            <svg className="h-8 w-8 text-emerald-500" fill="none" viewBox="0 0 24 24" strokeWidth={2} stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" d="m4.5 12.75 6 6 9-13.5" />
            </svg>
          </div>
          <div className="text-center">
            <h2 className="text-base font-semibold text-slate-900 mb-1">
              Your description is already well-optimized!
            </h2>
            <p className="text-sm text-slate-500 max-w-md leading-relaxed">
              The optimizer analyzed your description and found no changes that would improve trigger accuracy. No modifications were made.
            </p>
          </div>
        </div>

        {/* Current description display */}
        <div className="rounded-xl border border-slate-200 overflow-hidden">
          <div className="bg-slate-50 px-4 py-2.5 border-b border-slate-200">
            <h3 className="text-sm font-semibold text-slate-700">Current Description</h3>
          </div>
          <div className="p-4">
            <p className="text-sm text-slate-700 leading-relaxed whitespace-pre-wrap">{currentDescription}</p>
          </div>
        </div>

        {/* Action buttons */}
        <div className="flex justify-between pt-2">
          <Button
            type="button"
            onClick={onReset}
            variant="ghost"
            size="md"
          >
            Run Again
          </Button>
          <Button
            type="button"
            onClick={onComplete}
            variant="primary"
            size="lg"
          >
            Done
          </Button>
        </div>
      </div>
    );
  }

  return (
    <div className="space-y-5">
      {/* Guide text */}
      <div className="rounded-xl bg-blue-50 border border-blue-200 px-4 py-3">
        <p className="text-sm text-blue-800 leading-relaxed">
          <strong>Here is the best description found.</strong> Compare it with your current
          one — the optimizer selected the version with the highest test accuracy to avoid overfitting.
        </p>
      </div>

      {/* Score summary */}
      <div className="grid grid-cols-3 gap-4">
        <div className="rounded-xl border border-slate-200 p-4 text-center">
          <p className="text-xs font-medium text-slate-500 uppercase tracking-wide">Best Iteration</p>
          <p className="text-2xl font-bold text-indigo-600 mt-1">{result.bestIteration}</p>
          <p className="text-xs text-slate-400">of {result.iterations.length}</p>
        </div>
        <div className="rounded-xl border border-slate-200 p-4 text-center">
          <p className="text-xs font-medium text-slate-500 uppercase tracking-wide">Train Delta</p>
          <p className={`text-2xl font-bold mt-1 ${result.improvement.trainDelta >= 0 ? 'text-emerald-600' : 'text-red-600'}`}>
            {result.improvement.trainDelta >= 0 ? '+' : ''}{(result.improvement.trainDelta * 100).toFixed(1)}%
          </p>
        </div>
        <div className="rounded-xl border border-slate-200 p-4 text-center">
          <p className="text-xs font-medium text-slate-500 uppercase tracking-wide">Test Delta</p>
          <p className={`text-2xl font-bold mt-1 ${result.improvement.testDelta >= 0 ? 'text-emerald-600' : 'text-red-600'}`}>
            {result.improvement.testDelta >= 0 ? '+' : ''}{(result.improvement.testDelta * 100).toFixed(1)}%
          </p>
        </div>
      </div>

      {/* Iteration timeline */}
      <div className="rounded-xl border border-slate-200 overflow-hidden">
        <div className="bg-slate-50 px-4 py-2.5 border-b border-slate-200">
          <h3 className="text-sm font-semibold text-slate-700">Iteration History</h3>
        </div>
        <div className="divide-y divide-slate-100">
          {result.iterations.map((iter) => (
            <div
              key={iter.iteration}
              className={`flex items-center gap-4 px-4 py-2.5 ${
                iter.iteration === result.bestIteration ? 'bg-indigo-50/50' : ''
              }`}
            >
              <span className={`text-xs font-semibold ${iter.iteration === result.bestIteration ? 'text-indigo-700' : 'text-slate-500'}`}>
                #{iter.iteration}
                {iter.iteration === result.bestIteration && ' ★'}
              </span>
              <div className="flex-1 flex gap-4 text-xs text-slate-600">
                <span>Train: {(iter.trainScore * 100).toFixed(0)}%</span>
                <span>Test: {(iter.testScore * 100).toFixed(0)}%</span>
              </div>
              <div className="flex gap-1">
                {/* Simple bar for train score */}
                <div className="w-20 h-2 rounded-full bg-slate-100 overflow-hidden">
                  <div
                    className="h-full rounded-full bg-emerald-400"
                    style={{ width: `${iter.trainScore * 100}%` }}
                  />
                </div>
                {/* Simple bar for test score */}
                <div className="w-20 h-2 rounded-full bg-slate-100 overflow-hidden">
                  <div
                    className="h-full rounded-full bg-indigo-400"
                    style={{ width: `${iter.testScore * 100}%` }}
                  />
                </div>
              </div>
            </div>
          ))}
        </div>
      </div>

      {/* Inline diff comparison */}
      <div className="rounded-xl border border-slate-200 overflow-hidden">
        <div className="bg-slate-50 px-4 py-2.5 border-b border-slate-200 flex items-center justify-between">
          <h3 className="text-sm font-semibold text-slate-700">Description Changes</h3>
          {improved && (
            <span className="text-xs font-semibold text-emerald-600 flex items-center gap-1">
              <svg className="h-3.5 w-3.5" fill="none" viewBox="0 0 24 24" strokeWidth={2} stroke="currentColor">
                <path strokeLinecap="round" strokeLinejoin="round" d="m4.5 12.75 6 6 9-13.5" />
              </svg>
              Improved
            </span>
          )}
        </div>
        <div className="p-4">
          <DescriptionDiff original={currentDescription} updated={result.bestDescription} />
        </div>
      </div>

      {/* Action buttons */}
      <div className="flex justify-between pt-2">
        <Button
          type="button"
          onClick={onReset}
          variant="ghost"
          size="md"
        >
          Run Again
        </Button>
        <div className="flex gap-3">
          <Button
            type="button"
            onClick={onKeepCurrent}
            variant="secondary"
            size="lg"
          >
            Keep Current
          </Button>
          <Button
            type="button"
            onClick={onApply}
            disabled={loading}
            variant="primary"
            size="lg"
            loading={loading}
            loadingText="Applying…"
          >
            Apply Best Description
          </Button>
        </div>
      </div>
    </div>
  );
}

// ── Word-level diff component ────────────────────────────────────────

/**
 * Simple word-level diff: highlights removed words (red strikethrough)
 * and added words (green background) inline.
 * Uses shared computeWordDiff from utils/diff.ts.
 */
function DescriptionDiff({ original, updated }: { original: string; updated: string }) {
  if (original === updated) {
    return (
      <div>
        <p className="text-xs text-slate-400 italic mb-2">No changes — descriptions are identical.</p>
        <p className="text-sm text-slate-700 leading-relaxed whitespace-pre-wrap">{original}</p>
      </div>
    );
  }

  const diff = computeWordDiff(original, updated);

  // Null means text is too large for LCS — show plain text fallback
  if (!diff) {
    return (
      <div className="space-y-3">
        <p className="text-xs text-amber-600 italic">Descriptions too long for inline diff. Showing full text.</p>
        <div className="rounded-lg border border-red-100 bg-red-50/50 p-3">
          <p className="text-xs font-semibold text-red-600 mb-1">Original</p>
          <p className="text-sm text-slate-700 leading-relaxed whitespace-pre-wrap">{original}</p>
        </div>
        <div className="rounded-lg border border-emerald-100 bg-emerald-50/50 p-3">
          <p className="text-xs font-semibold text-emerald-600 mb-1">Updated</p>
          <p className="text-sm text-slate-700 leading-relaxed whitespace-pre-wrap">{updated}</p>
        </div>
      </div>
    );
  }

  return (
    <p className="text-sm leading-relaxed whitespace-pre-wrap">
      {diff.map((segment, i) => {
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
        // added
        return (
          <span key={i} className="bg-emerald-100 text-emerald-800 rounded px-0.5">
            {segment.text}
          </span>
        );
      })}
    </p>
  );
}
