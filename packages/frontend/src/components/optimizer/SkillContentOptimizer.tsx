/**
 * SkillContentOptimizer — 4-step wizard for automated skill optimization (C2).
 *
 * Steps:
 *   1. Configure — pick max iterations, see cost estimate, feedback toggle
 *   2. Running — live SSE-streamed progress per iteration
 *   3. Review — best iteration diff + what changed
 *   4. Applied — success confirmation
 *
 * Follows the same layout pattern as DescriptionOptimizer.tsx.
 */

import { useState, useEffect, useMemo } from 'react';
import { useNavigate } from 'react-router';
import ConfirmDialog from '../common/ConfirmDialog.js';
import { Button } from '../common/Button.js';
import ReactDiffViewer, { DiffMethod } from 'react-diff-viewer-continued';
import type { Skill, SkillSummary, SkillFileItem, IterationState, OptimizationResult, EvalFeedback, EvalRun, EvalCase, CoverageGapReport, CoverageGap } from '@skillspell/shared';
import { fetchEvalCases, fetchFeedback, fetchEvalRuns } from '../../services/api/evals.js';
import { fetchSkill } from '../../services/api/skills.js';
import {
  useSkillContentOptimizer,
  type OptStep,
} from '../../hooks/useSkillContentOptimizer.js';
import {
  useProgressMessages,
  useTip,
  formatElapsed,
  SKILL_OPT_MESSAGES,
  SKILL_OPT_INTERVAL,
  SKILL_OPT_SUBSTEP_MESSAGES,
} from '../../hooks/useProgressMessages.js';

// ── Step Labels ────────────────────────────────────────────────────────

const STEP_LABELS: Record<OptStep, string> = {
  configure: 'Configure',
  running: 'Optimizing',
  review: 'Review',
  applied: 'Applied',
};

const STEP_ORDER: OptStep[] = ['configure', 'running', 'review', 'applied'];

// ── Props ──────────────────────────────────────────────────────────────

interface Props {
  skill: SkillSummary;
  onComplete: () => void;
  onCancel: () => void;
}

// ── Diff Viewer Styles ─────────────────────────────────────────────────

const DIFF_VIEWER_STYLES = {
  variables: {
    light: {
      diffViewerBackground: '#ffffff',
      diffViewerTitleBackground: '#f8fafc',
      addedBackground: '#dcfce7',
      addedColor: '#166534',
      removedBackground: '#fee2e2',
      removedColor: '#991b1b',
      wordAddedBackground: '#bbf7d0',
      wordRemovedBackground: '#fecaca',
      addedGutterBackground: '#d1fae5',
      removedGutterBackground: '#fecaca',
      gutterBackground: '#f8fafc',
      gutterColor: '#94a3b8',
      codeFoldBackground: '#f1f5f9',
      codeFoldGutterBackground: '#f1f5f9',
      codeFoldContentColor: '#64748b',
      emptyLineBackground: '#f8fafc',
    },
  },
  line: {
    padding: '4px 12px',
    fontSize: '13px',
    lineHeight: '1.6',
    fontFamily: 'ui-monospace, SFMono-Regular, "SF Mono", Menlo, Consolas, monospace',
  },
  contentText: {
    fontFamily: 'ui-monospace, SFMono-Regular, "SF Mono", Menlo, Consolas, monospace',
    fontSize: '13px',
  },
} as const;

// ── Main Component ─────────────────────────────────────────────────────

export default function SkillContentOptimizer({ skill, onComplete, onCancel }: Props) {
  const optimizer = useSkillContentOptimizer();
  const [originalSkill, setOriginalSkill] = useState<Skill | null>(null);

  // Fetch full skill data on mount for diff comparison in the review step
  useEffect(() => {
    fetchSkill(skill.id).then(setOriginalSkill).catch(() => setOriginalSkill(null));
  }, [skill.id]);

  return (
    <div className="flex h-full flex-col">
      {/* Header */}
      <div className="border-b border-slate-200/80 bg-white px-6 py-5">
        <div className="flex items-center justify-between">
          <div>
            <h1 className="text-lg font-bold text-slate-800">Auto Optimize Skill</h1>
            <p className="text-xs text-slate-500 mt-0.5">{skill.name} · v{skill.version}</p>
          </div>
          <Button
            type="button"
            onClick={optimizer.step === 'applied' ? onComplete : onCancel}
            variant="ghost"
            size="md"
          >
            {optimizer.step === 'applied' ? 'Done' : 'Cancel'}
          </Button>
        </div>

        {/* Step indicator */}
        <div className="mt-4 flex items-center gap-2">
          {STEP_ORDER.map((s, i) => {
            const currentIdx = STEP_ORDER.indexOf(optimizer.step);
            const isActive = i === currentIdx;
            const isDone = i < currentIdx;
            return (
              <div key={s} className="flex items-center gap-2">
                {i > 0 && <div className={`h-px w-6 ${isDone ? 'bg-indigo-400' : 'bg-slate-200'}`} />}
                <div className={`flex items-center gap-1.5 rounded-full px-3 py-1 text-xs font-medium transition-all ${
                  isActive
                    ? 'bg-indigo-100 text-indigo-700'
                    : isDone
                      ? 'bg-indigo-50 text-indigo-500'
                      : 'bg-slate-50 text-slate-400'
                }`}>
                  {isDone && (
                    <svg className="h-3 w-3" fill="none" viewBox="0 0 24 24" strokeWidth={2.5} stroke="currentColor">
                      <path strokeLinecap="round" strokeLinejoin="round" d="m4.5 12.75 6 6 9-13.5" />
                    </svg>
                  )}
                  {STEP_LABELS[s]}
                </div>
              </div>
            );
          })}
        </div>
      </div>

      {/* Step content */}
      <div className="flex-1 overflow-y-auto p-6">
        {optimizer.error && (
          <div className="mb-4 rounded-xl border border-red-200 bg-red-50 p-3 text-sm text-red-700">
            {optimizer.error}
          </div>
        )}

        {optimizer.step === 'configure' && (
          <StepConfigure
            skillId={skill.id}
            skillVersion={skill.version}
            onStart={(config) => optimizer.startOptimization(skill.id, config)}
          />
        )}
        {optimizer.step === 'running' && (
          <StepRunning
            iterations={optimizer.iterations}
            currentProgress={optimizer.currentProgress}
            onCancel={optimizer.cancel}
          />
        )}
        {optimizer.step === 'review' && (
          <StepReview
            iterations={optimizer.iterations}
            result={optimizer.result}
            originalSkill={originalSkill}
            coverageGaps={optimizer.coverageGaps}
            regressionDetected={optimizer.regressionDetected}
            onApply={() => optimizer.applyBest(skill.id)}
            onDiscard={onCancel}
            onRetry={optimizer.reset}
            loading={optimizer.loading}
            skillId={skill.id}
            onAnalyzeGaps={optimizer.analyzeGaps}
            onExecuteGapFix={optimizer.executeGapFix}
            onClearGapFix={optimizer.clearGapFix}
            onCancelGapFix={optimizer.cancelGapFix}
            analyzingGaps={optimizer.analyzingGaps}
            suggestedGapCounts={optimizer.suggestedGapCounts}
            fixingGaps={optimizer.fixingGaps}
            fixGapsError={optimizer.fixGapsError}
            gapFixProgress={optimizer.gapFixProgress}
          />
        )}
        {optimizer.step === 'applied' && (
          <StepApplied onDone={onComplete} />
        )}
      </div>
    </div>
  );
}

// ── Step 1: Configure ──────────────────────────────────────────────────

function StepConfigure({
  skillId,
  skillVersion,
  onStart,
}: {
  skillId: string;
  skillVersion: number;
  onStart: (config: { maxIterations: number; targetPassRate?: number; includeFeedback?: boolean }) => void;
}) {
  const [maxIterations, setMaxIterations] = useState(3);
  const [evalCases, setEvalCases] = useState<EvalCase[]>([]);
  const [evalCaseCount, setEvalCaseCount] = useState<number | null>(null);
  const [negativeFeedback, setNegativeFeedback] = useState<EvalFeedback[]>([]);
  const [problemRuns, setProblemRuns] = useState<EvalRun[]>([]);
  const [totalRunCount, setTotalRunCount] = useState(0);
  const [includeFeedback, setIncludeFeedback] = useState(true);
  const navigate = useNavigate();

  // Fetch eval cases, feedback, and eval runs on mount
  useEffect(() => {
    fetchEvalCases(skillId)
      .then((cases) => {
        setEvalCases(cases);
        setEvalCaseCount(cases.length);
      })
      .catch(() => setEvalCaseCount(0));

    Promise.all([
      fetchFeedback(skillId).catch(() => [] as EvalFeedback[]),
      fetchEvalRuns(skillId, skillVersion).catch(() => [] as EvalRun[]),
    ]).then(([feedback, runs]) => {
      // Runs are already filtered by version from the backend.
      // Filter feedback to only include items linked to current-version runs.
      const runIds = new Set(runs.map(r => r.id));

      const negative = feedback.filter(fb =>
        (fb.rating === 'bad' || fb.rating === 'neutral') && runIds.has(fb.runId),
      );
      setNegativeFeedback(negative);
      setIncludeFeedback(negative.length > 0);

      setTotalRunCount(runs.length);
      const problems = runs.filter(r =>
        r.status === 'failed' || r.grading?.overall === 'fail' || r.grading?.overall === 'partial',
      );
      setProblemRuns(problems);
    });
  }, [skillId, skillVersion]);

  const hasImprovementData = negativeFeedback.length > 0 || problemRuns.length > 0;

  // Need at least 3 tests for a meaningful train/test split (2 train + 1 test)
  const hasEnoughTests = evalCaseCount !== null && evalCaseCount >= 3;
  const isLoading = evalCaseCount === null;

  if (isLoading) {
    return (
      <div className="mx-auto max-w-lg flex items-center justify-center py-12">
        <div className="h-8 w-8 animate-spin rounded-full border-2 border-indigo-200 border-t-indigo-600" />
      </div>
    );
  }

  if (!hasEnoughTests) {
    return (
      <div className="mx-auto max-w-lg text-center space-y-4 py-8">
        <div className="flex h-14 w-14 mx-auto items-center justify-center rounded-2xl bg-amber-100">
          <svg className="h-7 w-7 text-amber-600" fill="none" viewBox="0 0 24 24" strokeWidth={1.5} stroke="currentColor">
            <path strokeLinecap="round" strokeLinejoin="round" d="M12 9v3.75m-9.303 3.376c-.866 1.5.217 3.374 1.948 3.374h14.71c1.73 0 2.813-1.874 1.948-3.374L13.949 3.378c-.866-1.5-3.032-1.5-3.898 0L2.697 16.126ZM12 15.75h.007v.008H12v-.008Z" />
          </svg>
        </div>
        <h3 className="text-base font-bold text-slate-800">Not enough test cases</h3>
        <p className="text-sm text-slate-500 leading-relaxed max-w-sm mx-auto">
          Auto-optimization needs at least <strong>3 test cases</strong> to create a meaningful
          train/test split.{' '}
          {evalCaseCount === 0
            ? 'You don\'t have any test cases yet.'
            : `You have ${evalCaseCount} test case${evalCaseCount === 1 ? '' : 's'}.`}
        </p>
        <Button
          type="button"
          onClick={() => navigate(`/skills/${skillId}/tests`)}
          variant="primary"
          size="lg"
        >
          Go to Tests → Add Test Cases
        </Button>
      </div>
    );
  }

  return (
    <div className="mx-auto max-w-2xl space-y-6">
      <div className="rounded-2xl border border-slate-200 bg-white p-6 space-y-5">
        <div>
          <h3 className="text-sm font-semibold text-slate-800">How it works</h3>
          <p className="mt-1 text-xs text-slate-500 leading-relaxed">
            Optimizing <strong>v{skillVersion}</strong> (latest). We split your <strong>{evalCaseCount} test cases</strong> into a <strong>training set</strong> (used to improve the skill)
            and a <strong>test set</strong> (used to measure real improvement — never shown to the AI).
            This prevents overfitting. Each iteration runs evals, analyzes failures, and improves the skill.
          </p>
        </div>

        <div>
          <label className="block text-xs font-semibold text-slate-700 mb-1.5">
            Max iterations
          </label>
          <div className="flex items-center gap-3">
            {[1, 2, 3, 4, 5].map((n) => (
              <button
                key={n}
                onClick={() => setMaxIterations(n)}
                className={`h-9 w-9 rounded-lg text-sm font-semibold transition-all ${
                  maxIterations === n
                    ? 'bg-indigo-600 text-white shadow-lg shadow-indigo-500/20'
                    : 'bg-slate-100 text-slate-600 hover:bg-slate-200'
                }`}
              >
                {n}
              </button>
            ))}
          </div>
          {evalCaseCount != null && (
            <p className="mt-1 text-[10px] text-slate-400">
              ~{Math.ceil((evalCaseCount * 0.4) + 1)}-{Math.ceil((evalCaseCount * 0.5) + 2)} min per iteration ({evalCaseCount} test case{evalCaseCount !== 1 ? 's' : ''}).
              Cost varies by skill size.
            </p>
          )}
        </div>

        <div className="rounded-xl bg-amber-50 border border-amber-200 p-3">
          <p className="text-xs text-amber-700">
            {evalCaseCount != null ? (
              <>
                <strong>Estimated total:</strong> ~{Math.ceil((evalCaseCount * 0.4 + 1) * maxIterations)}-{Math.ceil((evalCaseCount * 0.5 + 2) * maxIterations)} min
                {' '}for {maxIterations} iteration{maxIterations !== 1 ? 's' : ''}.
                {' '}The loop stops early if all tests pass or scores plateau.
                {' '}Actual cost is tracked live during the run.
              </>
            ) : (
              <>
                <strong>Estimated:</strong> ~{maxIterations * 2}-{maxIterations * 3} min for {maxIterations} iteration{maxIterations !== 1 ? 's' : ''}.
                The loop stops early if all tests pass or scores plateau.
              </>
            )}
          </p>
        </div>

      </div>

      {/* Feedback & failed runs panel — shown when improvement data exists */}
      {hasImprovementData && (
        <div className="rounded-2xl border border-slate-200 bg-white p-6 space-y-4">
          <label className="flex items-start gap-3 cursor-pointer select-none">
            <input
              type="checkbox"
              checked={includeFeedback}
              onChange={(e) => setIncludeFeedback(e.target.checked)}
              className="mt-0.5 h-4 w-4 rounded border-slate-300 text-indigo-600 focus:ring-indigo-500"
            />
            <div>
              <span className="text-sm font-semibold text-slate-800">
                Include user feedback in first iteration
              </span>
              <p className="text-[11px] text-slate-400 leading-relaxed mt-0.5">
                Auto-improve skill based on test results and your feedback
              </p>
            </div>
          </label>

          {includeFeedback && (
            <div className="space-y-4 pl-7">
              {/* Stats summary */}
              <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
                <div className="rounded-xl border border-slate-200 bg-white p-3 text-center">
                  <div className={`text-2xl font-bold ${problemRuns.length > 0 ? 'text-red-600' : 'text-green-600'}`}>{problemRuns.length}</div>
                  <div className="text-[10px] text-slate-500 font-medium mt-0.5">Failed/Partial Runs</div>
                </div>
                <div className="rounded-xl border border-slate-200 bg-white p-3 text-center">
                  <div className={`text-2xl font-bold ${negativeFeedback.length > 0 ? 'text-amber-600' : 'text-green-600'}`}>{negativeFeedback.length}</div>
                  <div className="text-[10px] text-slate-500 font-medium mt-0.5">Negative Feedback</div>
                </div>
                <div className="rounded-xl border border-slate-200 bg-white p-3 text-center">
                  <div className="text-2xl font-bold text-slate-700">{totalRunCount}</div>
                  <div className="text-[10px] text-slate-500 font-medium mt-0.5">Total Runs</div>
                </div>
                <div className="rounded-xl border border-slate-200 bg-white p-3 text-center">
                  <div className="text-2xl font-bold text-slate-700">{evalCases.length}</div>
                  <div className="text-[10px] text-slate-500 font-medium mt-0.5">Test Cases</div>
                </div>
              </div>

              {/* User feedback items */}
              {negativeFeedback.length > 0 && (
                <div>
                  <h4 className="text-xs font-bold text-slate-700 uppercase tracking-wide mb-1.5 flex items-center gap-1.5">
                    <svg className="h-3.5 w-3.5 text-amber-500" fill="none" viewBox="0 0 24 24" strokeWidth={2} stroke="currentColor">
                      <path strokeLinecap="round" strokeLinejoin="round" d="M7.5 8.25h9m-9 3H12m-9.75 1.51c0 1.6 1.123 2.994 2.707 3.227 1.129.166 2.27.293 3.423.379.35.026.67.21.865.501L12 21l2.755-4.133a1.14 1.14 0 0 1 .865-.501 48.172 48.172 0 0 0 3.423-.379c1.584-.233 2.707-1.626 2.707-3.228V6.741c0-1.602-1.123-2.995-2.707-3.228A48.394 48.394 0 0 0 12 3c-2.392 0-4.744.175-7.043.513C3.373 3.746 2.25 5.14 2.25 6.741v6.018Z" />
                    </svg>
                    Your Feedback ({negativeFeedback.length})
                  </h4>
                  <div className="space-y-1.5 max-h-64 overflow-y-auto">
                    {negativeFeedback.slice(0, 8).map((fb) => (
                      <div key={fb.id} className="rounded-lg border border-amber-100 bg-amber-50/50 px-3 py-2">
                        <div className="flex items-center gap-2 mb-0.5">
                          <span className={`inline-flex items-center px-1.5 py-0.5 rounded-full text-[10px] font-semibold ${
                            fb.rating === 'bad' ? 'bg-red-100 text-red-700' : 'bg-slate-100 text-slate-600'
                          }`}>
                            {fb.rating === 'bad' ? '👎 Bad' : '😐 Neutral'}
                          </span>
                        </div>
                        <p className="text-xs text-slate-700 leading-relaxed">{fb.feedback}</p>
                        {fb.suggestedFix && (
                          <p className="text-xs text-indigo-600 mt-0.5 leading-relaxed">
                            <strong>Suggested fix:</strong> {fb.suggestedFix}
                          </p>
                        )}
                      </div>
                    ))}
                    {negativeFeedback.length > 8 && (
                      <p className="text-[10px] text-slate-400 text-center">
                        +{negativeFeedback.length - 8} more — AI will analyze up to 10
                      </p>
                    )}
                  </div>
                </div>
              )}

              {/* Failed/partial runs */}
              {problemRuns.length > 0 && (
                <div>
                  <h4 className="text-xs font-bold text-slate-700 uppercase tracking-wide mb-1.5 flex items-center gap-1.5">
                    <svg className="h-3.5 w-3.5 text-red-500" fill="none" viewBox="0 0 24 24" strokeWidth={2} stroke="currentColor">
                      <path strokeLinecap="round" strokeLinejoin="round" d="M12 9v3.75m-9.303 3.376c-.866 1.5.217 3.374 1.948 3.374h14.71c1.73 0 2.813-1.874 1.948-3.374L13.949 3.378c-.866-1.5-3.032-1.5-3.898 0L2.697 16.126ZM12 15.75h.007v.008H12v-.008Z" />
                    </svg>
                    Failed / Partial Runs ({problemRuns.length})
                  </h4>
                  <div className="space-y-1.5 max-h-64 overflow-y-auto">
                    {problemRuns.slice(0, 8).map((run) => {
                      const ec = evalCases.find(c => c.id === run.evalId);
                      const failedAssertions = run.grading?.assertionResults?.filter(a => !a.passed) ?? [];
                      return (
                        <div key={run.id} className="rounded-lg border border-red-100 bg-red-50/50 px-3 py-2">
                          <div className="flex items-center gap-2">
                            <span className={`inline-flex items-center px-1.5 py-0.5 rounded-full text-[10px] font-semibold ${
                              run.status === 'failed' || run.grading?.overall === 'fail'
                                ? 'bg-red-100 text-red-700'
                                : 'bg-amber-100 text-amber-700'
                            }`}>
                              {run.status === 'failed' ? '❌ Error' : run.grading?.overall === 'fail' ? '❌ Fail' : '⚠️ Partial'}
                            </span>
                            <span className="text-xs text-slate-700 font-medium truncate max-w-[220px]" title={ec?.name || run.evalId}>
                              {ec?.name || 'Unknown test'}
                            </span>
                            <span className="text-[10px] text-slate-400">
                              Score: {run.grading?.score ?? 0}/100
                            </span>
                          </div>
                          {run.error && (
                            <p className="text-[10px] text-red-600 mt-0.5 truncate" title={run.error}>{run.error}</p>
                          )}
                          {failedAssertions.length > 0 && (
                            <div className="mt-1 flex flex-wrap gap-1">
                              {failedAssertions.slice(0, 3).map((a, i) => (
                                <span key={i} className="inline-flex items-center px-1.5 py-0.5 rounded text-[9px] font-mono bg-red-100/60 text-red-600 truncate max-w-[180px]" title={`${a.assertion?.type}: ${a.assertion?.value}`}>
                                  {a.assertion?.type}: {a.assertion?.description || a.assertion?.value}
                                </span>
                              ))}
                              {failedAssertions.length > 3 && (
                                <span className="text-[9px] text-red-400">+{failedAssertions.length - 3} more</span>
                              )}
                            </div>
                          )}
                        </div>
                      );
                    })}
                    {problemRuns.length > 8 && (
                      <p className="text-[10px] text-slate-400 text-center">
                        +{problemRuns.length - 8} more — AI will analyze up to 10
                      </p>
                    )}
                  </div>
                </div>
              )}

              {/* What happens next — explanation */}
              <div className="rounded-xl bg-slate-50 border border-slate-200/60 p-4">
                <h4 className="text-xs font-bold text-slate-700 uppercase tracking-wide mb-2">What happens next</h4>
                <div className="space-y-1.5 text-xs text-slate-600 leading-relaxed">
                  <p>AI will analyze the feedback and failures above to:</p>
                  <ol className="list-decimal pl-4 space-y-1">
                    <li>Identify common patterns in what went wrong</li>
                    <li>Build a targeted improvement prompt focusing on the most impactful fixes</li>
                    <li>Generate an improved draft of the skill for your review</li>
                  </ol>
                  <p className="text-slate-500 flex items-start gap-1.5 mt-1">
                    <svg className="h-3.5 w-3.5 mt-0.5 shrink-0" fill="none" viewBox="0 0 24 24" strokeWidth={2} stroke="currentColor">
                      <path strokeLinecap="round" strokeLinejoin="round" d="m11.25 11.25.041-.02a.75.75 0 0 1 1.063.852l-.708 2.836a.75.75 0 0 0 1.063.853l.041-.021M21 12a9 9 0 1 1-18 0 9 9 0 0 1 18 0Zm-9-3.75h.008v.008H12V8.25Z" />
                    </svg>
                    You&apos;ll see a side-by-side diff and can approve or discard the changes before saving.
                  </p>
                  <p className="text-amber-600 flex items-start gap-1.5 mt-2">
                    <svg className="h-3.5 w-3.5 mt-0.5 shrink-0" fill="none" viewBox="0 0 24 24" strokeWidth={2} stroke="currentColor">
                      <path strokeLinecap="round" strokeLinejoin="round" d="M12 9v3.75m9-.75a9 9 0 1 1-18 0 9 9 0 0 1 18 0Zm-9 3.75h.008v.008H12v-.008Z" />
                    </svg>
                    Up to 10 failed runs and 10 negative feedback items will be included. Infrastructure errors (network, rate limits) are automatically excluded.
                  </p>
                </div>
              </div>
            </div>
          )}
        </div>
      )}

      <Button
        type="button"
        onClick={() => onStart({ maxIterations, includeFeedback: hasImprovementData ? includeFeedback : undefined })}
        variant="primary-gradient"
        size="xl"
        className="w-full"
      >
        Start Optimization
      </Button>
    </div>
  );
}

// ── Step 2: Running ────────────────────────────────────────────────────

/** Ordered pipeline of sub-steps within each iteration. */
const SUB_STEP_PIPELINE: { key: string; label: string; emoji: string }[] = [
  { key: 'running-train', label: 'Training evals', emoji: '🧪' },
  { key: 'analyzing',     label: 'Analyzing',      emoji: '🔍' },
  { key: 'improving',     label: 'Improving',      emoji: '✨' },
  { key: 'running-test',  label: 'Test evals',     emoji: '📊' },
];

function StepRunning({
  iterations,
  currentProgress,
  onCancel,
}: {
  iterations: IterationState[];
  currentProgress: IterationState | null;
  onCancel: () => void;
}) {
  // Warn before page refresh/close during optimization
  useEffect(() => {
    const handler = (e: BeforeUnloadEvent) => {
      e.preventDefault();
    };
    window.addEventListener('beforeunload', handler);
    return () => window.removeEventListener('beforeunload', handler);
  }, []);

  // Pick messages matching the current sub-step (or fallback to generic)
  const subStepKey = currentProgress?.subStep ?? '';
  const contextualMessages = SKILL_OPT_SUBSTEP_MESSAGES[subStepKey] ?? SKILL_OPT_MESSAGES;

  const { currentMessage, elapsed } = useProgressMessages({
    messages: contextualMessages,
    interval: SKILL_OPT_INTERVAL,
    cycle: true,
    active: true,
  });
  const tip = useTip(elapsed, 20);

  // Determine active sub-step index in the pipeline
  const activeSubIdx = currentProgress
    ? SUB_STEP_PIPELINE.findIndex(s => s.key === currentProgress.subStep)
    : -1;

  const [showCancelConfirm, setShowCancelConfirm] = useState(false);

  return (
    <div className="mx-auto max-w-lg space-y-4">
      {/* Main progress card — unified white box */}
      <div className="rounded-2xl border border-slate-200 bg-white p-5 space-y-4">
        {/* Header: iteration badge + timer + scores */}
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-2">
            <div className="relative h-8 w-8 rounded-xl bg-gradient-to-br from-indigo-500 to-purple-600 flex items-center justify-center shadow-md shadow-indigo-500/20">
              <span className="text-sm font-bold text-white">
                {currentProgress?.iteration ?? iterations.length + 1}
              </span>
              <span className="absolute -top-0.5 -right-0.5 h-2.5 w-2.5 rounded-full bg-emerald-400 border-2 border-white animate-ping" />
              <span className="absolute -top-0.5 -right-0.5 h-2.5 w-2.5 rounded-full bg-emerald-400 border-2 border-white" />
            </div>
            <div>
              <span className="text-sm font-semibold text-slate-800">
                Iteration {currentProgress?.iteration ?? iterations.length + 1}
              </span>
              <span className="text-xs text-slate-400 ml-2">⏱ {formatElapsed(elapsed)}</span>
            </div>
          </div>
          {currentProgress && (currentProgress.trainPassed != null || currentProgress.trainScore > 0) && (
            <div className="flex items-center gap-3 text-xs text-slate-500">
              {currentProgress.trainPassed != null && currentProgress.trainTotal ? (
                <span>Train: <strong className="text-indigo-600">{currentProgress.trainPassed}/{currentProgress.trainTotal}</strong></span>
              ) : currentProgress.trainScore > 0 ? (
                <span>Train: <strong className="text-indigo-600">{(currentProgress.trainScore * 100).toFixed(0)}%</strong></span>
              ) : null}
              {currentProgress.testPassed != null && currentProgress.testTotal ? (
                <span>Test: <strong className="text-emerald-600">{currentProgress.testPassed}/{currentProgress.testTotal}</strong></span>
              ) : currentProgress.testScore > 0 ? (
                <span>Test: <strong className="text-emerald-600">{(currentProgress.testScore * 100).toFixed(0)}%</strong></span>
              ) : null}
            </div>
          )}
        </div>

        {/* Sub-step pipeline */}
        <div className="flex items-center gap-1">
          {SUB_STEP_PIPELINE.map((step, i) => {
            const isDone = activeSubIdx > i;
            const isActive = activeSubIdx === i;
            return (
              <div key={step.key} className="flex items-center gap-1 flex-1">
                {i > 0 && (
                  <div className={`h-px flex-shrink-0 w-2 transition-colors duration-500 ${
                    isDone ? 'bg-indigo-400' : 'bg-slate-200'
                  }`} />
                )}
                <div className={`flex items-center gap-1.5 rounded-full px-2.5 py-1 text-[11px] font-medium transition-all duration-500 ${
                  isActive
                    ? 'bg-indigo-100 text-indigo-700 ring-2 ring-indigo-500/20 shadow-sm'
                    : isDone
                      ? 'bg-indigo-50 text-indigo-500'
                      : 'bg-slate-50 text-slate-400'
                }`}>
                  {isDone ? (
                    <svg className="h-3 w-3 text-indigo-500" fill="none" viewBox="0 0 24 24" strokeWidth={2.5} stroke="currentColor">
                      <path strokeLinecap="round" strokeLinejoin="round" d="m4.5 12.75 6 6 9-13.5" />
                    </svg>
                  ) : isActive ? (
                    <div className="h-2.5 w-2.5 rounded-full border-2 border-indigo-500 border-t-transparent animate-spin" />
                  ) : (
                    <span className="text-xs">{step.emoji}</span>
                  )}
                  <span className="hidden sm:inline">{step.label}</span>
                </div>
              </div>
            );
          })}
        </div>

        {/* Divider */}
        <div className="border-t border-slate-100" />

        {/* Rotating contextual activity message */}
        <div className="flex items-center gap-3">
          <div className="h-4 w-4 animate-spin rounded-full border-2 border-indigo-200 border-t-indigo-600 flex-shrink-0" />
          <div className="flex-1 min-w-0">
            <p className="text-sm text-slate-600 truncate">
              {currentMessage.emoji} {currentMessage.text}
            </p>
            {currentMessage.detail && (
              <p className="text-xs text-slate-400 mt-0.5 truncate">{currentMessage.detail}</p>
            )}
          </div>
        </div>

        {/* Per-eval progress bar — visible during running-train and running-test */}
        {currentProgress?.evalProgress &&
          (currentProgress.subStep === 'running-train' || currentProgress.subStep === 'running-test') && (
          <div className="space-y-1.5">
            <div className="flex items-center justify-between text-xs text-slate-500">
              <span>{currentProgress.subStep === 'running-train' ? 'Training' : 'Test'} evals</span>
              <span className="font-medium tabular-nums">
                {currentProgress.evalProgress.completed} / {currentProgress.evalProgress.total}
              </span>
            </div>
            <div className="h-1.5 w-full rounded-full bg-slate-100">
              <div
                className="h-1.5 rounded-full bg-indigo-500 transition-all duration-300"
                style={{
                  width: `${currentProgress.evalProgress.total > 0
                    ? Math.round((currentProgress.evalProgress.completed / currentProgress.evalProgress.total) * 100)
                    : 0}%`,
                }}
              />
            </div>
          </div>
        )}
      </div>

      {/* Completed iterations */}
      {iterations.length > 0 && (
        <div className="space-y-2">
          <h4 className="text-xs font-semibold text-slate-500 uppercase tracking-wide">
            Completed Iterations
          </h4>
          {iterations.map((iter) => {
            const isBest = iterations.every(i => i.testScore <= iter.testScore);
            return (
              <div
                key={iter.iteration}
                className={`flex items-center justify-between rounded-xl border p-3 transition-all duration-300 ${
                  isBest ? 'border-emerald-200 bg-emerald-50/50' : 'border-slate-200 bg-white'
                }`}
              >
                <span className="text-xs font-medium text-slate-700">
                  #{iter.iteration}
                </span>
                <div className="flex items-center gap-4 text-xs">
                  <span className="text-slate-500">
                    Train: <strong>
                      {iter.trainPassed != null && iter.trainTotal
                        ? `${iter.trainPassed}/${iter.trainTotal}`
                        : `${(iter.trainScore * 100).toFixed(0)}%`
                      }
                    </strong>
                  </span>
                  <span className="text-slate-500">
                    Test: <strong>
                      {iter.testPassed != null && iter.testTotal
                        ? `${iter.testPassed}/${iter.testTotal}`
                        : `${(iter.testScore * 100).toFixed(0)}%`
                      }
                    </strong>
                  </span>
                  {iter.durationMs != null && (
                    <span className="text-slate-400">
                      {iter.durationMs >= 60000
                        ? `${(iter.durationMs / 60000).toFixed(1)}m`
                        : `${(iter.durationMs / 1000).toFixed(0)}s`}
                    </span>
                  )}
                  {iter.totalCost != null && iter.totalCost > 0 && (
                    <span className="text-amber-600">
                      ${iter.totalCost.toFixed(2)}
                    </span>
                  )}
                  {isBest && (
                    <span className="rounded-full bg-emerald-100 px-2 py-0.5 text-[10px] font-bold text-emerald-700">
                      ★ best
                    </span>
                  )}
                </div>
              </div>
            );
          })}
        </div>
      )}

      {/* Tip */}
      {tip && (
        <p className="text-center text-xs text-slate-400 animate-fade-in">{tip}</p>
      )}

      {/* Cancel button — small, red, right-aligned */}
      <div className="flex justify-end">
        <Button
          type="button"
          onClick={() => setShowCancelConfirm(true)}
          variant="destructive-outline"
          size="xs"
        >
          Cancel
        </Button>
      </div>

      {/* Cancel confirmation dialog */}
      <ConfirmDialog
        open={showCancelConfirm}
        title="Stop Optimization?"
        variant="danger"
        confirmLabel="Yes, stop"
        cancelLabel="Keep running"
        onConfirm={onCancel}
        onCancel={() => setShowCancelConfirm(false)}
      >
        <p>This will stop the optimization loop. Any completed iterations will be available for review.</p>
      </ConfirmDialog>
    </div>
  );
}

// ── Step 3: Review ─────────────────────────────────────────────────────

function StepReview({
  iterations,
  result,
  originalSkill,
  coverageGaps,
  regressionDetected,
  onApply,
  onDiscard,
  onRetry,
  loading,
  skillId,
  onAnalyzeGaps,
  onExecuteGapFix,
  onClearGapFix,
  onCancelGapFix,
  analyzingGaps,
  suggestedGapCounts,
  fixingGaps,
  fixGapsError,
  gapFixProgress,
}: {
  iterations: IterationState[];
  result: OptimizationResult | null;
  originalSkill: Skill | null;
  coverageGaps: CoverageGapReport | null;
  regressionDetected: { iteration: number; prevScore: number; currentScore: number; revertedTo: number } | null;
  onApply: () => void;
  onDiscard: () => void;
  onRetry: () => void;
  loading: boolean;
  skillId: string;
  onAnalyzeGaps: (skillId: string, gaps: CoverageGap[]) => Promise<void>;
  onExecuteGapFix: (skillId: string, gaps: CoverageGap[], counts: Record<string, number>) => Promise<void>;
  onClearGapFix: () => void;
  onCancelGapFix: () => void;
  analyzingGaps: boolean;
  suggestedGapCounts: Record<string, number> | null;
  fixingGaps: boolean;
  fixGapsError: string | null;
  gapFixProgress: { current: number; total: number; dimension: string } | null;
}) {
  const best = result?.bestIteration;
  const noImprovement = !best;
  const [selectedFileKey, setSelectedFileKey] = useState<string>('skill.md');
  const [splitView, setSplitView] = useState(true);
  const [showFixDialog, setShowFixDialog] = useState(false);

  useEffect(() => {
    if (suggestedGapCounts !== null) {
      setShowFixDialog(true);
    } else {
      setShowFixDialog(false);
    }
  }, [suggestedGapCounts]);

  // Build file entries from the original skill
  const originalFiles = useMemo(() => {
    if (!originalSkill) return [];
    return buildDiffFileList(originalSkill.skillContent, originalSkill.scripts, originalSkill.references, originalSkill.assets);
  }, [originalSkill]);

  // Build file entries from the best draft
  const draftFiles = useMemo(() => {
    if (!best) return [];
    return buildDiffFileList(best.draft.skillContent, best.draft.scripts, best.draft.references, best.draft.assets);
  }, [best]);

  // Merge file keys from both sides
  const mergedFileKeys = useMemo(() => {
    const seen = new Set<string>();
    const keys: string[] = [];
    for (const f of originalFiles) {
      if (!seen.has(f.key)) { seen.add(f.key); keys.push(f.key); }
    }
    for (const f of draftFiles) {
      if (!seen.has(f.key)) { seen.add(f.key); keys.push(f.key); }
    }
    return keys;
  }, [originalFiles, draftFiles]);

  // Determine which files have changes
  const changedFiles = useMemo(() => {
    const origMap = new Map(originalFiles.map((f) => [f.key, f.content]));
    const newMap = new Map(draftFiles.map((f) => [f.key, f.content]));
    const changed = new Set<string>();
    for (const key of mergedFileKeys) {
      if ((origMap.get(key) ?? '') !== (newMap.get(key) ?? '')) changed.add(key);
    }
    return changed;
  }, [originalFiles, draftFiles, mergedFileKeys]);

  // Build display entries from merged keys
  const displayFiles = useMemo(() => {
    const origMap = new Map(originalFiles.map((f) => [f.key, f]));
    const newMap = new Map(draftFiles.map((f) => [f.key, f]));
    return mergedFileKeys.map((key) => newMap.get(key) ?? origMap.get(key)!);
  }, [originalFiles, draftFiles, mergedFileKeys]);

  // Get content for the selected file
  const origMap = useMemo(() => new Map(originalFiles.map((f) => [f.key, f.content])), [originalFiles]);
  const newMap = useMemo(() => new Map(draftFiles.map((f) => [f.key, f.content])), [draftFiles]);
  const leftContent = origMap.get(selectedFileKey) ?? '';
  const rightContent = newMap.get(selectedFileKey) ?? '';

  // Reset selected file if it becomes invalid
  useEffect(() => {
    if (mergedFileKeys.length > 0 && !mergedFileKeys.includes(selectedFileKey)) {
      setSelectedFileKey(mergedFileKeys[0]);
    }
  }, [mergedFileKeys, selectedFileKey]);

  return (
    <div className="space-y-5">
      {/* Score summary cards */}
      <div className="grid grid-cols-5 gap-2 max-w-2xl mx-auto">
        <div className="rounded-xl border border-slate-200 bg-white p-2.5 text-center">
          <div className="text-xl font-bold text-indigo-600">
            {best ? `#${best.iteration}` : '—'}
          </div>
          <div className="text-[10px] text-slate-500 font-medium mt-0.5">Best Iter</div>
        </div>
        <div className="rounded-xl border border-slate-200 bg-white p-2.5 text-center">
          <div className={`text-xl font-bold ${
            (result?.improvement.trainDelta ?? 0) > 0 ? 'text-emerald-600' : 'text-slate-600'
          }`}>
            {result?.improvement.trainDelta != null
              ? `${result.improvement.trainDelta > 0 ? '+' : ''}${(result.improvement.trainDelta * 100).toFixed(0)}%`
              : '—'
            }
          </div>
          <div className="text-[10px] text-slate-500 font-medium mt-0.5">Train Δ</div>
        </div>
        <div className="rounded-xl border border-slate-200 bg-white p-2.5 text-center">
          <div className={`text-xl font-bold ${
            (result?.improvement.testDelta ?? 0) > 0 ? 'text-emerald-600' : 'text-slate-600'
          }`}>
            {result?.improvement.testDelta != null
              ? `${result.improvement.testDelta > 0 ? '+' : ''}${(result.improvement.testDelta * 100).toFixed(0)}%`
              : '—'
            }
          </div>
          <div className="text-[10px] text-slate-500 font-medium mt-0.5">Test Δ</div>
        </div>
        <div className="rounded-xl border border-slate-200 bg-white p-2.5 text-center">
          <div className="text-xl font-bold text-amber-600">
            {result?.totalCost != null ? `$${result.totalCost.toFixed(2)}` : '—'}
          </div>
          <div className="text-[10px] text-slate-500 font-medium mt-0.5">Cost</div>
        </div>
        <div className="rounded-xl border border-slate-200 bg-white p-2.5 text-center">
          <div className="text-xl font-bold text-slate-600">
            {result?.durationMs != null
              ? result.durationMs >= 60000
                ? `${Math.round(result.durationMs / 60000)}m`
                : `${Math.round(result.durationMs / 1000)}s`
              : '—'
            }
          </div>
          <div className="text-[10px] text-slate-500 font-medium mt-0.5">Duration</div>
        </div>
      </div>

      {/* Iteration timeline — collapsible */}
      {iterations.length > 1 && (
        <details className="rounded-2xl border border-slate-200 bg-white max-w-2xl mx-auto">
          <summary className="px-4 py-3 text-xs font-semibold text-slate-500 uppercase tracking-wide cursor-pointer hover:bg-slate-50 transition-colors">
            Iteration Timeline ({iterations.length} iterations)
          </summary>
          <div className="px-4 pb-4 space-y-2">
            {iterations.map((iter) => {
              const isBest = best?.iteration === iter.iteration;
              return (
                <div key={iter.iteration} className="flex items-center gap-3">
                  <span className="w-6 text-xs font-medium text-slate-500 text-right">
                    #{iter.iteration}
                  </span>
                  <div className="flex-1">
                    <div className="flex gap-1">
                      <div
                        className="h-3 rounded-l bg-indigo-400"
                        style={{ width: `${iter.trainScore * 100}%` }}
                        title={`Train: ${(iter.trainScore * 100).toFixed(0)}%`}
                      />
                      <div
                        className="h-3 rounded-r bg-emerald-400"
                        style={{ width: `${iter.testScore * 100}%` }}
                        title={`Test: ${(iter.testScore * 100).toFixed(0)}%`}
                      />
                    </div>
                  </div>
                  <span className="text-[10px] text-slate-400 w-20 text-right">
                    {(iter.trainScore * 100).toFixed(0)}% / {(iter.testScore * 100).toFixed(0)}%
                  </span>
                  {iter.durationMs != null && (
                    <span className="text-[10px] text-slate-400 w-12 text-right">
                      {iter.durationMs >= 60000
                        ? `${(iter.durationMs / 60000).toFixed(1)}m`
                        : `${(iter.durationMs / 1000).toFixed(0)}s`}
                    </span>
                  )}
                  {isBest && (
                    <span className="text-[10px] text-emerald-600 font-bold">★</span>
                  )}
                </div>
              );
            })}
            <div className="mt-2 flex gap-4 text-[10px] text-slate-400">
              <span className="flex items-center gap-1">
                <span className="inline-block h-2 w-2 rounded bg-indigo-400" /> Train
              </span>
              <span className="flex items-center gap-1">
                <span className="inline-block h-2 w-2 rounded bg-emerald-400" /> Test
              </span>
            </div>
          </div>
        </details>
      )}

      {/* Explanation banner */}
      {best?.draft.explanation && (
        <div className="rounded-xl border border-indigo-100 bg-indigo-50/50 px-4 py-3 max-w-2xl mx-auto">
          <p className="text-sm text-indigo-700 leading-relaxed">
            <span className="font-semibold">What changed:</span>{' '}
            {best.draft.explanation}
          </p>
        </div>
      )}

      {/* No improvement message */}
      {noImprovement && (
        <div className="rounded-2xl border border-emerald-200 bg-emerald-50 p-4 text-center max-w-2xl mx-auto">
          <p className="text-sm font-medium text-emerald-700">
            ✨ Your skill is already well-optimized!
          </p>
          <p className="text-xs text-emerald-600 mt-1">
            No iteration produced a better version than the current skill.
          </p>
        </div>
      )}

      {/* Regression notice */}
      {regressionDetected && (
        <div className="mb-4 rounded-lg border border-orange-200 bg-orange-50 px-4 py-3">
          <p className="text-sm text-orange-800">
            <span className="font-medium">Regression detected</span> at iteration {regressionDetected.iteration} (test score dropped from {Math.round(regressionDetected.prevScore * 100)}% to {Math.round(regressionDetected.currentScore * 100)}%). Reverted to iteration {regressionDetected.revertedTo}.
          </p>
        </div>
      )}

      {/* File diff viewer — full width */}
      {best && originalSkill && displayFiles.length > 0 && (
        <div className="rounded-2xl border border-slate-200 bg-white overflow-hidden flex" style={{ height: 'calc(100vh - 480px)', minHeight: '360px' }}>
          {/* File sidebar */}
          <div className="w-52 shrink-0 border-r border-slate-200 bg-slate-50/50 overflow-y-auto">
            <div className="px-3 py-2.5 border-b border-slate-200">
              <h4 className="text-[10px] font-semibold text-slate-400 uppercase tracking-wider">Files</h4>
            </div>
            <nav className="py-1">
              {displayFiles.map((file) => {
                const isSelected = file.key === selectedFileKey;
                const hasChanges = changedFiles.has(file.key);
                return (
                  <button
                    key={file.key}
                    onClick={() => setSelectedFileKey(file.key)}
                    className={`flex w-full items-center gap-2 py-2 px-3 text-left text-xs transition-all duration-150 truncate
                      ${isSelected
                        ? 'bg-indigo-50 text-indigo-700 font-medium border-l-2 border-indigo-500'
                        : 'text-slate-600 hover:bg-slate-100/80 border-l-2 border-transparent'
                      }`}
                  >
                    {hasChanges ? (
                      <span className="inline-block h-2 w-2 rounded-full bg-amber-400 shrink-0" />
                    ) : (
                      <span className="inline-block h-2 w-2 rounded-full bg-emerald-300 shrink-0" />
                    )}
                    {file.name}
                  </button>
                );
              })}
            </nav>
          </div>

          {/* Diff viewer */}
          <div className="flex-1 flex flex-col overflow-hidden">
            {/* Diff header toolbar */}
            <div className="flex items-center justify-between px-4 py-2 border-b border-slate-200 bg-slate-50/30">
              <span className="text-xs font-medium text-slate-500">
                {changedFiles.size} file{changedFiles.size !== 1 ? 's' : ''} changed
              </span>
              <button
                onClick={() => setSplitView((v) => !v)}
                className="rounded-lg px-2.5 py-1 text-[10px] font-medium text-slate-500 hover:bg-slate-100 transition-colors"
              >
                {splitView ? 'Unified' : 'Split'}
              </button>
            </div>

            {/* Diff content */}
            <div className="flex-1 overflow-auto">
              {leftContent === rightContent ? (
                <div className="flex h-full items-center justify-center text-sm text-slate-400">
                  <div className="text-center">
                    <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-emerald-50 mx-auto mb-2">
                      <svg className="h-5 w-5 text-emerald-500" fill="none" viewBox="0 0 24 24" strokeWidth={1.5} stroke="currentColor">
                        <path strokeLinecap="round" strokeLinejoin="round" d="m4.5 12.75 6 6 9-13.5" />
                      </svg>
                    </div>
                    No changes in this file
                  </div>
                </div>
              ) : (
                <ReactDiffViewer
                  oldValue={leftContent}
                  newValue={rightContent}
                  splitView={splitView}
                  leftTitle="Current"
                  rightTitle="Optimized"
                  useDarkTheme={false}
                  compareMethod={DiffMethod.WORDS}
                  styles={DIFF_VIEWER_STYLES}
                />
              )}
            </div>
          </div>
        </div>
      )}

      {/* Coverage gaps panel */}
      {coverageGaps && coverageGaps.gaps.length > 0 && (
        <div className="mt-6 rounded-lg border border-amber-200 bg-amber-50 p-4 max-w-2xl mx-auto">
          <div className="mb-3 flex items-center justify-between">
            <h3 className="text-sm font-semibold text-amber-900">
              Coverage gaps detected
            </h3>
            <span className="rounded-full bg-amber-100 px-2 py-0.5 text-xs font-medium text-amber-700">
              Score: {coverageGaps.coverageScore}/100
            </span>
          </div>
          <ul className="space-y-3">
            {coverageGaps.gaps.map((gap) => (
              <li key={gap.dimension} className="flex items-start justify-between gap-3">
                <div>
                  <span className={`mr-2 inline-block rounded px-1.5 py-0.5 text-xs font-medium ${gap.severity === 'high' ? 'bg-red-100 text-red-700' : 'bg-amber-100 text-amber-700'}`}>
                    {gap.severity}
                  </span>
                  <span className="text-sm text-amber-800">{gap.description}</span>
                </div>
                <button
                  type="button"
                  onClick={() => {
                    navigator.clipboard.writeText(gap.suggestionPrompt).catch(() => {});
                  }}
                  className="shrink-0 rounded border border-amber-300 bg-white px-2 py-1 text-xs font-medium text-amber-700 hover:bg-amber-50"
                >
                  Copy prompt
                </button>
              </li>
            ))}
          </ul>
          {/* Fix all gaps & re-run — button only in panel */}
          <div className="mt-4 border-t border-amber-200 pt-4">
            <Button
              type="button"
              disabled={analyzingGaps || fixingGaps}
              onClick={() => coverageGaps && onAnalyzeGaps(skillId, coverageGaps.gaps)}
              variant="primary"
              size="sm"
              className="w-full"
            >
              {analyzingGaps ? (
                <>
                  <svg className="h-4 w-4 animate-spin" viewBox="0 0 24 24" fill="none">
                    <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
                    <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8v8H4z" />
                  </svg>
                  Analyzing gaps...
                </>
              ) : (
                'Fix all gaps & re-run'
              )}
            </Button>
            {fixGapsError && (
              <p className="mt-2 text-xs text-red-600">{fixGapsError}</p>
            )}
          </div>
        </div>
      )}

      {/* Actions */}
      <div className="flex gap-3 max-w-2xl mx-auto">
        <Button
          type="button"
          onClick={onDiscard}
          variant="secondary"
          size="lg"
          className="flex-1"
        >
          Keep Current
        </Button>
        <Button
          type="button"
          onClick={onRetry}
          variant="secondary"
          size="lg"
          className="flex-1"
        >
          Run Again
        </Button>
        {!noImprovement && (
          <Button
            type="button"
            onClick={onApply}
            disabled={loading}
            variant="primary-gradient"
            size="lg"
            className="flex-1"
            loading={loading}
            loadingText="Applying…"
          >
            Apply Best Version
          </Button>
        )}
      </div>

      {/* Step 1 — Confirmation dialog: shown after AI count analysis, before generation starts */}
      {showFixDialog && coverageGaps && suggestedGapCounts && (
        <ConfirmDialog
          open={showFixDialog}
          title="Fix coverage gaps & re-run optimization"
          confirmLabel="Generate & Re-run"
          cancelLabel="Cancel"
          onConfirm={() => {
            setShowFixDialog(false);
            onExecuteGapFix(skillId, coverageGaps.gaps, suggestedGapCounts);
          }}
          onCancel={() => {
            setShowFixDialog(false);
            onClearGapFix();
          }}
        >
          <div className="space-y-3">
            <p className="text-sm text-gray-600">
              The following test cases will be generated and added to your eval suite:
            </p>
            <ul className="space-y-1">
              {coverageGaps.gaps.map(gap => (
                <li key={gap.dimension} className="flex items-center justify-between text-sm">
                  <span className="text-gray-700 capitalize">
                    {gap.dimension.replace(/-/g, ' ')}
                  </span>
                  <span className="font-medium text-gray-900">
                    {suggestedGapCounts[gap.dimension] ?? 3} cases
                  </span>
                </li>
              ))}
            </ul>
            <p className="text-sm text-gray-500 border-t pt-2">
              {coverageGaps.gaps.reduce((s, g) => s + (suggestedGapCounts[g.dimension] ?? 3), 0)} new test cases will be added, then optimization will re-run with your previous settings.
            </p>
          </div>
        </ConfirmDialog>
      )}

      {/* Step 2 — Generation modal: non-dismissible, shows progress, only Cancel aborts */}
      {fixingGaps && coverageGaps && (
        <div className="fixed inset-0 z-50 flex items-center justify-center">
          {/* Non-clickable backdrop — user cannot dismiss by clicking outside */}
          <div className="absolute inset-0 bg-black/50" />
          <div className="relative z-10 w-full max-w-md rounded-xl bg-white p-6 shadow-xl mx-4">
            <h3 className="mb-1 text-lg font-bold text-slate-800">Generating test cases</h3>
            <p className="mb-4 text-sm text-slate-500">
              {coverageGaps.gaps.length} gap{coverageGaps.gaps.length !== 1 ? 's' : ''} to fill — do not close this window
            </p>

            {/* Per-gap progress */}
            <div className="space-y-3">
              {coverageGaps.gaps.map((gap, idx) => {
                const isActive = gapFixProgress?.dimension === gap.dimension;
                const isDone = gapFixProgress
                  ? coverageGaps.gaps.findIndex(g => g.dimension === gapFixProgress.dimension) > idx
                  : false;
                const pct = isActive && gapFixProgress
                  ? gapFixProgress.total > 0
                    ? Math.round((gapFixProgress.current / gapFixProgress.total) * 100)
                    : 5 // show a sliver while preparing
                  : isDone ? 100 : 0;

                return (
                  <div key={gap.dimension}>
                    <div className="mb-1 flex items-center justify-between text-xs">
                      <div className="flex items-center gap-1.5">
                        {isDone ? (
                          <span className="font-bold text-emerald-500">✓</span>
                        ) : isActive ? (
                          <span className="inline-block h-2 w-2 rounded-full bg-amber-500" />
                        ) : (
                          <span className="inline-block h-2 w-2 rounded-full border border-slate-300" />
                        )}
                        <span className={`capitalize font-medium ${isActive ? 'text-amber-700' : isDone ? 'text-slate-400' : 'text-slate-300'}`}>
                          {gap.dimension.replace(/-/g, ' ')}
                        </span>
                        {isActive && (
                          <span className="ml-1 flex items-center gap-0.5">
                            <span className="h-1.5 w-1.5 animate-bounce rounded-full bg-amber-500 [animation-delay:0ms]" />
                            <span className="h-1.5 w-1.5 animate-bounce rounded-full bg-amber-500 [animation-delay:150ms]" />
                            <span className="h-1.5 w-1.5 animate-bounce rounded-full bg-amber-500 [animation-delay:300ms]" />
                          </span>
                        )}
                      </div>
                      <span className={`${isActive ? 'text-amber-600' : isDone ? 'text-slate-400' : 'text-slate-300'}`}>
                        {isDone ? '' : isActive && gapFixProgress ? `${gapFixProgress.current} / ${gapFixProgress.total}` : '—'}
                      </span>
                    </div>
                    {isActive && (
                      <p className="mb-1 text-xs text-amber-600/80">
                        {gapFixProgress && gapFixProgress.current > 0
                          ? `Generating case ${gapFixProgress.current} of ${gapFixProgress.total}…`
                          : 'Preparing…'}
                      </p>
                    )}
                    <div className="h-1.5 w-full overflow-hidden rounded-full bg-slate-100">
                      <div
                        className={`relative h-1.5 rounded-full transition-all duration-300 ${isDone ? 'bg-slate-300' : 'bg-amber-500'}`}
                        style={{ width: `${pct}%` }}
                      >
                        {isActive && (
                          <div className="animate-shimmer-bar absolute inset-0 w-1/2 bg-gradient-to-r from-transparent via-white/40 to-transparent" />
                        )}
                      </div>
                    </div>
                  </div>
                );
              })}
            </div>

            {fixGapsError && (
              <p className="mt-4 text-sm text-red-600">{fixGapsError}</p>
            )}

            <Button
              type="button"
              onClick={onCancelGapFix}
              variant="secondary"
              size="md"
              className="mt-5 w-full"
            >
              Cancel generation
            </Button>
          </div>
        </div>
      )}
    </div>
  );
}

// ── Step 4: Applied ────────────────────────────────────────────────────

function StepApplied({ onDone }: { onDone: () => void }) {
  return (
    <div className="mx-auto max-w-lg text-center space-y-4 py-12">
      <div className="flex h-16 w-16 mx-auto items-center justify-center rounded-2xl bg-emerald-100">
        <svg className="h-8 w-8 text-emerald-600" fill="none" viewBox="0 0 24 24" strokeWidth={2} stroke="currentColor">
          <path strokeLinecap="round" strokeLinejoin="round" d="m4.5 12.75 6 6 9-13.5" />
        </svg>
      </div>
      <h3 className="text-lg font-bold text-slate-800">Optimization Applied!</h3>
      <p className="text-sm text-slate-500">
        The improved skill has been saved as a new version.
      </p>
      <Button
        type="button"
        onClick={onDone}
        variant="primary"
        size="lg"
      >
        Done
      </Button>
    </div>
  );
}

// ── Helpers ─────────────────────────────────────────────────────────────

/** Represents a diffable file entry for the review step. */
interface DiffFileEntry {
  key: string;
  name: string;
  content: string;
}

/** Build a flat list of diffable file entries from skill content fields. */
function buildDiffFileList(
  skillContent: string,
  scripts: SkillFileItem[],
  references: SkillFileItem[],
  assets: SkillFileItem[],
): DiffFileEntry[] {
  const entries: DiffFileEntry[] = [];

  entries.push({ key: 'skill.md', name: 'SKILL.md', content: skillContent });

  const addItems = (items: SkillFileItem[], prefix: string) => {
    items.forEach((item) => {
      entries.push({ key: `${prefix}/${item.name}`, name: item.name, content: item.content });
    });
  };

  if (references.length > 0) addItems(references, 'References');
  if (scripts.length > 0) addItems(scripts, 'Scripts');
  if (assets.length > 0) addItems(assets, 'Assets');

  return entries;
}
