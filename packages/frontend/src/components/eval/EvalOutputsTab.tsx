import { useState, useMemo, useRef, useEffect } from 'react';
import Markdown from 'react-markdown';
import remarkGfm from 'remark-gfm';
import remarkFrontmatter from 'remark-frontmatter';
import type { EvalRun, EvalCase, EvalGrading, EvalAssertionResult } from '@skillspell/shared';
import { formatDuration } from '../../utils/formatDuration.js';
import { computeWordDiff } from '../../utils/diff.js';
import { sortAssertions, computeDelta } from '../../utils/evalSummary.js';
import { InfoTip } from '../common/InfoTip.js';
import { EvalNavigation } from './EvalNavigation.js';
import { EvalFeedback } from './EvalFeedback.js';
import { EvalOutputFile } from './EvalOutputFile.js';
import { ClaimsSection } from './ClaimsSection.js';
import { ExplainFailureCard } from './ExplainFailureCard.js';
import { EvalCritique } from './EvalGrades.js';

type EvalTab = 'summary' | 'outputs';

interface EvalOutputsTabProps {
  // Navigation
  currentIndex: number;
  totalRuns: number;
  hasPrev: boolean;
  hasNext: boolean;
  onPrev: () => void;
  onNext: () => void;
  onGoToIndex?: (index: number) => void;

  // Current run data
  currentRun: EvalRun | null;
  evalCase?: EvalCase;

  // Feedback
  feedbackText: string;
  feedbackRating: 'good' | 'bad' | 'neutral' | null;
  onFeedbackTextChange: (text: string) => void;
  onFeedbackRatingChange: (rating: 'good' | 'bad' | 'neutral' | null) => void;
  onSaveFeedback: () => void;
  isSavingFeedback: boolean;
  feedbackSaved: boolean;
  feedbackDirty: boolean;

  // Delete
  onDeleteRun: (runId: string) => Promise<void>;
  isDeleting: boolean;

  // Optimize
  onOptimize?: () => void;

  // Run comparison selection
  selectedRunIds?: Set<string>;
  onToggleRunSelection?: (runId: string) => void;
  onClearRunSelection?: () => void;
  onCompare?: () => void;
  allRuns?: EvalRun[];
  allEvalCases?: EvalCase[];
  slotA?: string | null;
  slotB?: string | null;
  selectionError?: string | null;
}

export function EvalOutputsTab({
  currentIndex,
  totalRuns,
  hasPrev,
  hasNext,
  onPrev,
  onNext,
  onGoToIndex,
  currentRun,
  evalCase,
  feedbackText,
  feedbackRating,
  onFeedbackTextChange,
  onFeedbackRatingChange,
  onSaveFeedback,
  isSavingFeedback,
  feedbackSaved,
  feedbackDirty,
  onDeleteRun,
  isDeleting,
  onOptimize,
  selectedRunIds,
  onToggleRunSelection,
  // eslint-disable-next-line @typescript-eslint/no-unused-vars
  onClearRunSelection: _onClearRunSelection,
  // eslint-disable-next-line @typescript-eslint/no-unused-vars
  onCompare: _onCompare,
  allRuns,
  allEvalCases,
  slotA,
  slotB,
  selectionError,
}: EvalOutputsTabProps) {
  const [activeTab, setActiveTab] = useState<EvalTab>('summary');
  const [confirmingDelete, setConfirmingDelete] = useState(false);
  const confirmTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  useEffect(() => {
    setActiveTab('summary');
    setConfirmingDelete(false);
    if (confirmTimerRef.current) {
      clearTimeout(confirmTimerRef.current);
      confirmTimerRef.current = null;
    }
  }, [currentIndex, currentRun?.id]);

  useEffect(() => {
    return () => {
      if (confirmTimerRef.current) clearTimeout(confirmTimerRef.current);
    };
  }, []);

  const handleDeleteClick = () => {
    if (confirmingDelete && currentRun) {
      setConfirmingDelete(false);
      if (confirmTimerRef.current) {
        clearTimeout(confirmTimerRef.current);
        confirmTimerRef.current = null;
      }
      onDeleteRun(currentRun.id);
    } else {
      setConfirmingDelete(true);
      confirmTimerRef.current = setTimeout(() => {
        setConfirmingDelete(false);
        confirmTimerRef.current = null;
      }, 3000);
    }
  };

  if (!currentRun) {
    return (
      <div className="flex flex-col items-center justify-center h-64 gap-3">
        <div className="flex h-12 w-12 items-center justify-center rounded-xl bg-slate-100">
          <svg className="h-6 w-6 text-slate-400" fill="none" viewBox="0 0 24 24" strokeWidth={1.5} stroke="currentColor">
            <path strokeLinecap="round" strokeLinejoin="round" d="M3 13.125C3 12.504 3.504 12 4.125 12h2.25c.621 0 1.125.504 1.125 1.125v6.75C7.5 20.496 6.996 21 6.375 21h-2.25A1.125 1.125 0 0 1 3 19.875v-6.75ZM9.75 8.625c0-.621.504-1.125 1.125-1.125h2.25c.621 0 1.125.504 1.125 1.125v11.25c0 .621-.504 1.125-1.125 1.125h-2.25a1.125 1.125 0 0 1-1.125-1.125V8.625ZM16.5 4.125c0-.621.504-1.125 1.125-1.125h2.25C20.496 3 21 3.504 21 4.125v15.75c0 .621-.504 1.125-1.125 1.125h-2.25a1.125 1.125 0 0 1-1.125-1.125V4.125Z" />
          </svg>
        </div>
        <p className="text-sm text-slate-500 font-medium">No eval runs to display</p>
        <p className="text-xs text-slate-400">Run some evals first to see results here</p>
      </div>
    );
  }

  const TABS: { key: EvalTab; label: string }[] = [
    { key: 'summary', label: 'Summary' },
    { key: 'outputs', label: 'Outputs' },
  ];

  return (
    <div className="flex flex-col h-full">
      <EvalNavigation
        currentIndex={currentIndex}
        totalRuns={totalRuns}
        hasPrev={hasPrev}
        hasNext={hasNext}
        onPrev={onPrev}
        onNext={onNext}
        evalName={evalCase?.name}
        skillVersion={currentRun?.skillVersion}
        grading={currentRun?.grading}
        timing={currentRun?.timing ? { durationMs: currentRun.timing.durationMs, totalTokens: currentRun.timing.totalTokens } : undefined}
        createdAt={currentRun?.createdAt}
        runs={allRuns}
        evalCases={allEvalCases}
        onGoToIndex={onGoToIndex}
      />

      {/* A/B comparison selection bar */}
      {currentRun && selectedRunIds && onToggleRunSelection && (
        <div className={`flex items-center justify-between px-6 py-2 border-b transition-colors duration-200 ${
          selectedRunIds.size > 0
            ? 'bg-purple-50/60 border-purple-200/60'
            : 'bg-slate-50/80 border-slate-200/60'
        }`}>
          <div className="flex items-center gap-3 flex-wrap">
            <label className="flex items-center gap-2 cursor-pointer select-none group" title="Select this run for comparison">
              <input
                type="checkbox"
                checked={selectedRunIds.has(currentRun.id)}
                onChange={() => onToggleRunSelection(currentRun.id)}
                className="h-3.5 w-3.5 rounded border-slate-300 text-purple-600 focus:ring-purple-500 cursor-pointer"
              />
              <span className={`text-xs font-medium transition-colors ${
                selectedRunIds.has(currentRun.id)
                  ? 'text-purple-700'
                  : 'text-slate-500 group-hover:text-slate-700'
              }`}>
                {selectedRunIds.has(currentRun.id)
                  ? `✓ Slot ${slotA === currentRun.id ? 'A' : 'B'}`
                  : 'Select for comparison'}
              </span>
              <InfoTip text="Select this run for comparison. Pick exactly 2 runs to compare side by side." size="h-3 w-3" />
            </label>

            {selectedRunIds.size > 0 && (
              <div className="flex items-center gap-1.5">
                <span className="text-[10px] text-purple-400 font-medium">|</span>
                {([['A', slotA], ['B', slotB]] as const).map(([label, id]) => {
                  if (!id) {
                    return (
                      <span key={label} className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[10px] font-medium border border-dashed border-slate-300 text-slate-400">
                        <span className="font-bold">{label}</span>
                        <span className="italic">pick…</span>
                      </span>
                    );
                  }
                  const run = allRuns?.find((r) => r.id === id);
                  const caseName = run && allEvalCases?.find((ec) => ec.id === run.evalId)?.name;
                  const slotLabel = caseName
                    ? `${caseName}${run?.skillVersion ? ` (v${run.skillVersion})` : ''}`
                    : `Run ${id.slice(0, 6)}…`;
                  const isCurrent = id === currentRun.id;
                  return (
                    <span
                      key={label}
                      onClick={() => {
                        if (onGoToIndex && allRuns) {
                          const idx = allRuns.findIndex((r) => r.id === id);
                          if (idx >= 0) onGoToIndex(idx);
                        }
                      }}
                      className={`inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[10px] font-semibold border transition-all cursor-pointer hover:shadow-sm ${
                        isCurrent
                          ? 'bg-purple-100 text-purple-700 border-purple-300'
                          : 'bg-white text-purple-600 border-purple-200 hover:bg-purple-50'
                      }`}
                    >
                      <span className="font-bold text-purple-500">{label}</span>
                      {slotLabel}
                      <button
                        onClick={(e) => { e.preventDefault(); e.stopPropagation(); onToggleRunSelection(id); }}
                        className="ml-0.5 text-purple-400 hover:text-purple-700 transition-colors"
                        title={`Remove from slot ${label}`}
                      >
                        ×
                      </button>
                    </span>
                  );
                })}
              </div>
            )}
          </div>
        </div>
      )}

      {/* Selection error banner */}
      {selectionError && (
        <div className="flex items-center gap-2 px-6 py-2 bg-red-50 border-b border-red-200/60 animate-pulse">
          <svg className="h-3.5 w-3.5 text-red-500 shrink-0" fill="none" viewBox="0 0 24 24" strokeWidth={2} stroke="currentColor">
            <path strokeLinecap="round" strokeLinejoin="round" d="M12 9v3.75m-9.303 3.376c-.866 1.5.217 3.374 1.948 3.374h14.71c1.73 0 2.813-1.874 1.948-3.374L13.949 3.378c-.866-1.5-3.032-1.5-3.898 0L2.697 16.126ZM12 15.75h.007v.008H12v-.008Z" />
          </svg>
          <p className="text-xs text-red-600 font-medium">{selectionError}</p>
        </div>
      )}

      {/* Tab bar */}
      <div className="flex items-center border-b border-slate-200/80 bg-white px-4 shrink-0">
        {TABS.map((tab) => (
          <button
            key={tab.key}
            onClick={() => setActiveTab(tab.key)}
            className={`whitespace-nowrap border-b-2 px-3.5 py-3 text-sm font-medium transition-all duration-200 ${
              activeTab === tab.key
                ? 'border-indigo-500 text-indigo-600'
                : 'border-transparent text-slate-500 hover:text-slate-700 hover:border-slate-300'
            }`}
          >
            {tab.label}
          </button>
        ))}
      </div>

      {/* Tab panels */}
      <div className="flex-1 overflow-y-auto">
        {activeTab === 'summary' && (
          <SummaryTab
            grading={currentRun.grading}
            baselineGrading={currentRun.baselineGrading}
            skillId={currentRun.skillId}
            runId={currentRun.id}
            status={currentRun.status}
            timing={currentRun.timing}
            onOptimize={onOptimize}
            onDeleteClick={handleDeleteClick}
            isDeleting={isDeleting}
            confirmingDelete={confirmingDelete}
            feedbackText={feedbackText}
            feedbackRating={feedbackRating}
            onFeedbackTextChange={onFeedbackTextChange}
            onFeedbackRatingChange={onFeedbackRatingChange}
            onSaveFeedback={onSaveFeedback}
            isSavingFeedback={isSavingFeedback}
            feedbackSaved={feedbackSaved}
            feedbackDirty={feedbackDirty}
          />
        )}

        {activeTab === 'outputs' && (
          <div className="p-6 space-y-6">
            {/* Prompt — shown above the outputs */}
            <OutputSection title="Prompt" icon="prompt" tooltip="The input prompt that was sent to the model for this eval run">
              <div className="rounded-xl border border-slate-200 bg-slate-50/80 p-4">
                <pre className="whitespace-pre-wrap text-sm text-slate-700 font-mono leading-relaxed">{currentRun.prompt}</pre>
              </div>
            </OutputSection>

            {currentRun.error && (
              <div className="flex items-center gap-3 rounded-xl border border-red-200/60 bg-red-50 p-4">
                <div className="flex h-8 w-8 shrink-0 items-center justify-center rounded-lg bg-red-100">
                  <svg className="h-4 w-4 text-red-500" fill="none" viewBox="0 0 24 24" strokeWidth={2} stroke="currentColor">
                    <path strokeLinecap="round" strokeLinejoin="round" d="M12 9v3.75m9-.75a9 9 0 1 1-18 0 9 9 0 0 1 18 0Zm-9 3.75h.008v.008H12v-.008Z" />
                  </svg>
                </div>
                <div className="text-sm text-red-700">
                  <span className="font-semibold">Error:</span> {currentRun.error}
                </div>
              </div>
            )}

            {currentRun.outputWithoutSkill ? (
              <OutputComparisonView
                withSkillOutput={currentRun.outputWithSkill}
                baselineOutput={currentRun.outputWithoutSkill}
                withSkillScore={currentRun.grading.score}
                withSkillOverall={currentRun.grading.overall}
                baselineScore={currentRun.baselineGrading?.score}
                baselineOverall={currentRun.baselineGrading?.overall}
              />
            ) : (
              <>
                <OutputSection title="Output (with skill)" icon="output" tooltip="The model's response when the skill instructions are active">
                  <div className="mb-2">
                    <ScorePill label="With skill" score={currentRun.grading.score} overall={currentRun.grading.overall} />
                  </div>
                  <OutputContentViewer content={currentRun.outputWithSkill} />
                </OutputSection>
                <div className="flex items-center gap-2.5 rounded-xl border border-blue-100 bg-blue-50/50 px-4 py-3">
                  <svg className="h-4 w-4 text-blue-400 shrink-0" fill="none" viewBox="0 0 24 24" strokeWidth={2} stroke="currentColor">
                    <path strokeLinecap="round" strokeLinejoin="round" d="m11.25 11.25.041-.02a.75.75 0 0 1 1.063.852l-.708 2.836a.75.75 0 0 0 1.063.853l.041-.021M21 12a9 9 0 1 1-18 0 9 9 0 0 1 18 0Zm-9-3.75h.008v.008H12V8.25Z" />
                  </svg>
                  <p className="text-xs text-blue-600">
                    Run evals with the <strong>Baseline</strong> checkbox enabled to compare with-skill vs. without-skill outputs side by side.
                  </p>
                </div>
              </>
            )}

            {currentRun.outputFiles.length > 0 && (
              <OutputSection title="Output Files" icon="files" tooltip="Additional files generated by the model during this eval run">
                <div className="space-y-3">
                  {currentRun.outputFiles.map((file, index) => (
                    <EvalOutputFile key={file.filename ?? index} file={file} />
                  ))}
                </div>
              </OutputSection>
            )}
          </div>
        )}

      </div>
    </div>
  );
}

/* ─── Summary Tab ─────────────────────────────────────────────────────── */

function SummaryTab({
  grading,
  baselineGrading,
  skillId,
  runId,
  status,
  timing,
  onOptimize,
  onDeleteClick,
  isDeleting,
  confirmingDelete,
  feedbackText,
  feedbackRating,
  onFeedbackTextChange,
  onFeedbackRatingChange,
  onSaveFeedback,
  isSavingFeedback,
  feedbackSaved,
  feedbackDirty,
}: {
  grading: EvalGrading;
  baselineGrading?: EvalGrading;
  skillId?: string;
  runId?: string;
  status: EvalRun['status'];
  timing: EvalRun['timing'];
  onOptimize?: () => void;
  onDeleteClick: () => void;
  isDeleting: boolean;
  confirmingDelete: boolean;
  feedbackText: string;
  feedbackRating: 'good' | 'bad' | 'neutral' | null;
  onFeedbackTextChange: (text: string) => void;
  onFeedbackRatingChange: (rating: 'good' | 'bad' | 'neutral' | null) => void;
  onSaveFeedback: () => void;
  isSavingFeedback: boolean;
  feedbackSaved: boolean;
  feedbackDirty: boolean;
}) {
  const delta = computeDelta(grading.score, baselineGrading?.score);
  const sortedResults = sortAssertions(grading.assertionResults);
  const passCount = grading.assertionResults.filter((r) => r.passed).length;
  const hasFailures = passCount < grading.assertionResults.length;

  return (
    <div className="p-6 space-y-6">
      {/* Stats row */}
      <div className="flex items-center justify-between">
        <StatusIndicator status={status} />
        <TimingInfo timing={timing} />
      </div>

      {/* Score row: score card + delta card */}
      <div className="flex gap-4">
        <ScoreCard overall={grading.overall} score={grading.score} />
        <DeltaCard
          delta={delta}
          withSkillScore={grading.score}
          withSkillOverall={grading.overall}
          baselineScore={baselineGrading?.score}
          baselineOverall={baselineGrading?.overall}
        />
      </div>

      {/* Plain-English summary — shown for every result (pass, partial, fail) */}
      {grading.plainEnglishSummary && (
        <FailureInsightBox
          summary={grading.plainEnglishSummary}
          overall={grading.overall}
        />
      )}

      {/* Assertion list */}
      {grading.assertionResults.length > 0 && (
        <SummaryAssertionList
          results={sortedResults}
          passCount={passCount}
          total={grading.assertionResults.length}
        />
      )}

      {/* Auto-discovered claims (B4) */}
      {grading.extractedClaims && grading.extractedClaims.length > 0 && (
        <ClaimsSection claims={grading.extractedClaims} />
      )}

      {/* C3: AI failure explanation — for failed/partial runs */}
      {grading.overall !== 'pass' && skillId && runId && (
        <ExplainFailureCard skillId={skillId} runId={runId} grading={grading} />
      )}

      {/* Test suite quality feedback */}
      {grading.evalFeedback && (grading.evalFeedback.suggestions?.length > 0 || grading.evalFeedback.overall) && (
        <EvalCritique evalFeedback={grading.evalFeedback} />
      )}

      {/* Feedback — collapsible */}
      <CollapsibleFeedback
        feedbackText={feedbackText}
        feedbackRating={feedbackRating}
        onFeedbackTextChange={onFeedbackTextChange}
        onFeedbackRatingChange={onFeedbackRatingChange}
        onSaveFeedback={onSaveFeedback}
        isSavingFeedback={isSavingFeedback}
        feedbackSaved={feedbackSaved}
        feedbackDirty={feedbackDirty}
      />

      {/* Actions row: optimize + delete */}
      <div className="flex items-center justify-between pt-2 border-t border-slate-100">
        <div>
          {hasFailures && onOptimize && (
            <button
              type="button"
              onClick={onOptimize}
              className="inline-flex items-center gap-2 rounded-lg bg-indigo-600 px-4 py-2 text-sm font-semibold text-white hover:bg-indigo-700 transition-colors"
            >
              <svg className="h-4 w-4" fill="none" viewBox="0 0 24 24" strokeWidth={2} stroke="currentColor">
                <path strokeLinecap="round" strokeLinejoin="round" d="m3.75 13.5 10.5-11.25L12 10.5h8.25L9.75 21.75 12 13.5H3.75Z" />
              </svg>
              Optimize skill for failed assertions
            </button>
          )}
        </div>
        <button
          type="button"
          onClick={onDeleteClick}
          disabled={isDeleting}
          className={`flex items-center gap-1.5 rounded-lg px-2.5 py-1.5 text-xs font-medium transition-all duration-200 ${
            isDeleting
              ? 'bg-slate-100 text-slate-400 cursor-not-allowed'
              : confirmingDelete
                ? 'bg-red-100 text-red-700 border border-red-300 hover:bg-red-200'
                : 'text-slate-400 hover:bg-red-50 hover:text-red-600'
          }`}
          aria-label={confirmingDelete ? 'Confirm delete' : 'Delete this run'}
          title={confirmingDelete ? 'Click again to confirm' : 'Delete this run'}
        >
          {isDeleting ? (
            <div className="h-3.5 w-3.5 animate-spin rounded-full border-[2px] border-slate-300 border-t-slate-500" />
          ) : (
            <svg className="h-3.5 w-3.5" fill="none" viewBox="0 0 24 24" strokeWidth={2} stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" d="m14.74 9-.346 9m-4.788 0L9.26 9m9.968-3.21c.342.052.682.107 1.022.166m-1.022-.165L18.16 19.673a2.25 2.25 0 0 1-2.244 2.077H8.084a2.25 2.25 0 0 1-2.244-2.077L4.772 5.79m14.456 0a48.108 48.108 0 0 0-3.478-.397m-12 .562c.34-.059.68-.114 1.022-.165m0 0a48.11 48.11 0 0 1 3.478-.397m7.5 0v-.916c0-1.18-.91-2.164-2.09-2.201a51.964 51.964 0 0 0-3.32 0c-1.18.037-2.09 1.022-2.09 2.201v.916m7.5 0a48.667 48.667 0 0 0-7.5 0" />
            </svg>
          )}
          {confirmingDelete ? 'Confirm?' : isDeleting ? 'Deleting…' : 'Delete'}
        </button>
      </div>
    </div>
  );
}

function CollapsibleFeedback({
  feedbackText,
  feedbackRating,
  onFeedbackTextChange,
  onFeedbackRatingChange,
  onSaveFeedback,
  isSavingFeedback,
  feedbackSaved,
  feedbackDirty,
}: {
  feedbackText: string;
  feedbackRating: 'good' | 'bad' | 'neutral' | null;
  onFeedbackTextChange: (text: string) => void;
  onFeedbackRatingChange: (rating: 'good' | 'bad' | 'neutral' | null) => void;
  onSaveFeedback: () => void;
  isSavingFeedback: boolean;
  feedbackSaved: boolean;
  feedbackDirty: boolean;
}) {
  const hasFeedback = feedbackText.trim().length > 0 || feedbackRating !== null;
  const [isExpanded, setIsExpanded] = useState(true);

  return (
    <div className="rounded-xl border border-slate-200 overflow-hidden">
      <button
        type="button"
        onClick={() => setIsExpanded(!isExpanded)}
        className="w-full flex items-center justify-between p-3 hover:bg-slate-50 text-left transition-colors duration-200"
        aria-expanded={isExpanded ? 'true' : 'false'}
      >
        <div className="flex items-center gap-2">
          <svg className="h-4 w-4 text-slate-400" fill="none" viewBox="0 0 24 24" strokeWidth={2} stroke="currentColor">
            <path strokeLinecap="round" strokeLinejoin="round" d="M8.625 9.75a.375.375 0 1 1-.75 0 .375.375 0 0 1 .75 0Zm0 0H8.25m4.125 0a.375.375 0 1 1-.75 0 .375.375 0 0 1 .75 0Zm0 0H12m4.125 0a.375.375 0 1 1-.75 0 .375.375 0 0 1 .75 0Zm0 0h-.375m-13.5 3.01c0 1.6 1.123 2.994 2.707 3.227 1.087.16 2.185.283 3.293.369V21l4.184-4.183a1.14 1.14 0 0 1 .778-.332 48.294 48.294 0 0 0 5.83-.498c1.585-.233 2.708-1.626 2.708-3.228V6.741c0-1.602-1.123-2.995-2.707-3.228A48.394 48.394 0 0 0 12 3c-2.392 0-4.744.175-7.043.513C3.373 3.746 2.25 5.14 2.25 6.741v6.018Z" />
          </svg>
          <span className="text-xs font-bold text-slate-600 uppercase tracking-wide">Feedback</span>
          {hasFeedback && (
            <span className="h-1.5 w-1.5 rounded-full bg-indigo-500" />
          )}
        </div>
        <svg
          className={`h-4 w-4 text-slate-400 transition-transform duration-200 ${isExpanded ? 'rotate-180' : ''}`}
          fill="none" viewBox="0 0 24 24" strokeWidth={2} stroke="currentColor"
        >
          <path strokeLinecap="round" strokeLinejoin="round" d="m19.5 8.25-7.5 7.5-7.5-7.5" />
        </svg>
      </button>
      {isExpanded && (
        <div className="p-4 border-t border-slate-200/60">
          <EvalFeedback
            value={feedbackText}
            onChange={onFeedbackTextChange}
            rating={feedbackRating}
            onRatingChange={onFeedbackRatingChange}
            onSave={onSaveFeedback}
            isSaving={isSavingFeedback}
            isSaved={feedbackSaved}
            isDirty={feedbackDirty}
            hideHeader
          />
        </div>
      )}
    </div>
  );
}

function ScoreCard({ overall, score }: { overall: EvalGrading['overall']; score: number }) {
  const containerStyles: Record<EvalGrading['overall'], string> = {
    pass: 'bg-gradient-to-br from-green-50 to-green-100 border-green-200',
    fail: 'bg-gradient-to-br from-red-50 to-red-100 border-red-200',
    partial: 'bg-gradient-to-br from-amber-50 to-amber-100 border-amber-200',
  };
  const badgeStyles: Record<EvalGrading['overall'], string> = {
    pass: 'bg-green-100 text-green-700',
    fail: 'bg-red-100 text-red-700',
    partial: 'bg-amber-100 text-amber-700',
  };
  const labels: Record<EvalGrading['overall'], string> = {
    pass: '✓ PASS',
    fail: '✗ FAIL',
    partial: '~ PARTIAL',
  };

  return (
    <div className={`flex-none rounded-xl border p-4 text-center min-w-[120px] ${containerStyles[overall]}`}>
      <div className="flex items-baseline justify-center gap-1">
        <span className="text-3xl font-extrabold text-slate-900 leading-none">{score}</span>
        <span className="text-sm text-slate-400">/100</span>
      </div>
      <span className={`inline-flex items-center mt-2.5 px-2 py-0.5 rounded-full text-[10px] font-bold ${badgeStyles[overall]}`}>
        {labels[overall]}
      </span>
    </div>
  );
}

function DeltaCard({
  delta,
  withSkillScore,
  withSkillOverall,
  baselineScore,
  baselineOverall,
}: {
  delta: { value: number } | null;
  withSkillScore: number;
  withSkillOverall: EvalGrading['overall'];
  baselineScore?: number;
  baselineOverall?: EvalGrading['overall'];
}) {
  const verdictColors: Record<EvalGrading['overall'], string> = {
    pass: 'text-green-700 bg-green-50 border-green-200',
    fail: 'text-red-700 bg-red-50 border-red-200',
    partial: 'text-amber-700 bg-amber-50 border-amber-200',
  };
  const verdictLabels: Record<EvalGrading['overall'], string> = {
    pass: 'Pass', fail: 'Fail', partial: 'Partial',
  };

  if (!delta || baselineScore === undefined || !baselineOverall) {
    return (
      <div className="flex-1 rounded-xl border border-slate-200 bg-slate-50 p-4 flex flex-col justify-center gap-3">
        <div className="text-[10px] font-bold text-slate-400 uppercase tracking-wider">Scores</div>
        <div className="flex items-center gap-2">
          <span className="text-[10px] font-semibold text-slate-400 uppercase w-14">With skill</span>
          <span className="text-lg font-extrabold text-slate-900">{withSkillScore}</span>
          <span className="text-xs text-slate-400">/100</span>
          <span className={`inline-flex items-center px-1.5 py-0.5 rounded-full border text-[10px] font-bold ${verdictColors[withSkillOverall]}`}>
            {verdictLabels[withSkillOverall]}
          </span>
        </div>
        <div className="text-xs text-slate-400 italic">No baseline comparison</div>
      </div>
    );
  }

  const sign = delta.value > 0 ? '+' : '';
  const deltaColor = delta.value > 0 ? 'text-green-600' : delta.value < 0 ? 'text-red-600' : 'text-slate-500';
  const subLabel =
    delta.value > 0 ? 'Skill improved the output'
    : delta.value < 0 ? 'Skill made the output worse'
    : 'No change vs baseline';

  return (
    <div className="flex-1 rounded-xl border border-slate-200 bg-slate-50 p-4 flex flex-col justify-center gap-2">
      <div className="text-[10px] font-bold text-slate-400 uppercase tracking-wider">Scores</div>
      {/* With skill row */}
      <div className="flex items-center gap-2">
        <span className="text-[10px] font-semibold text-slate-400 uppercase whitespace-nowrap shrink-0">With skill</span>
        <span className="text-lg font-extrabold text-slate-900">{withSkillScore}</span>
        <span className="text-xs text-slate-400">/100</span>
        <span className={`inline-flex items-center px-1.5 py-0.5 rounded-full border text-[10px] font-bold ${verdictColors[withSkillOverall]}`}>
          {verdictLabels[withSkillOverall]}
        </span>
      </div>
      {/* Baseline row */}
      <div className="flex items-center gap-2">
        <span className="text-[10px] font-semibold text-slate-400 uppercase whitespace-nowrap shrink-0">Baseline</span>
        <span className="text-lg font-extrabold text-slate-500">{baselineScore}</span>
        <span className="text-xs text-slate-400">/100</span>
        <span className={`inline-flex items-center px-1.5 py-0.5 rounded-full border text-[10px] font-bold ${verdictColors[baselineOverall]}`}>
          {verdictLabels[baselineOverall]}
        </span>
      </div>
      {/* Delta */}
      <div className="flex items-center gap-1.5 pt-1 border-t border-slate-200">
        <span className={`text-sm font-extrabold ${deltaColor}`}>{sign}{delta.value} pts</span>
        <span className="text-xs text-slate-400">— {subLabel}</span>
      </div>
    </div>
  );
}

function FailureInsightBox({
  summary,
  overall,
}: {
  summary: string;
  overall?: 'pass' | 'fail' | 'partial';
}) {
  // Style by result: a passing run gets a neutral/positive treatment, a
  // failing/partial run keeps the amber "needs attention" styling.
  const isPass = overall === 'pass';
  const styles = isPass
    ? {
        box: 'border-emerald-200 bg-emerald-50',
        label: 'text-emerald-700',
        body: 'text-emerald-900',
        title: '✓ Summary',
      }
    : {
        box: 'border-amber-200 bg-amber-50',
        label: 'text-amber-700',
        body: 'text-amber-900',
        title: '⚠ Failure insight',
      };
  return (
    <div className={`rounded-xl border p-4 ${styles.box}`}>
      <p className={`text-[10px] font-bold uppercase tracking-wider mb-1.5 ${styles.label}`}>
        {styles.title}
      </p>
      <p className={`text-sm leading-relaxed ${styles.body}`}>{summary}</p>
    </div>
  );
}

function SummaryAssertionList({
  results,
  passCount,
  total,
}: {
  results: EvalAssertionResult[];
  passCount: number;
  total: number;
}) {
  return (
    <div>
      <div className="flex items-center justify-between mb-3">
        <h3 className="text-[10px] font-bold text-slate-500 uppercase tracking-wider">Assertions</h3>
        <span className={`text-[10px] font-bold ${passCount === total ? 'text-green-600' : 'text-red-500'}`}>
          {passCount}/{total} passed
        </span>
      </div>
      <div className="space-y-2">
        {results.map((result, i) => (
          <div
            key={result.assertion.value + '-' + i}
            className={`flex items-start gap-3 rounded-lg border px-3 py-2.5 ${
              result.passed ? 'bg-green-50 border-green-100' : 'bg-red-50 border-red-100'
            }`}
          >
            <span
              className={`mt-0.5 flex h-4 w-4 shrink-0 items-center justify-center rounded-full ${
                result.passed ? 'bg-green-500' : 'bg-red-500'
              }`}
            >
              {result.passed ? (
                <svg className="h-2.5 w-2.5 text-white" fill="none" viewBox="0 0 24 24" strokeWidth={3} stroke="currentColor">
                  <path strokeLinecap="round" strokeLinejoin="round" d="m4.5 12.75 6 6 9-13.5" />
                </svg>
              ) : (
                <svg className="h-2.5 w-2.5 text-white" fill="none" viewBox="0 0 24 24" strokeWidth={3} stroke="currentColor">
                  <path strokeLinecap="round" strokeLinejoin="round" d="M6 18 18 6M6 6l12 12" />
                </svg>
              )}
            </span>
            <div className="min-w-0">
              <p className="text-sm font-medium text-slate-800">
                {result.assertion.description || result.assertion.value}
              </p>
              {!result.passed && result.evidence && (
                <p className="mt-0.5 text-xs text-red-700 leading-relaxed">{result.evidence}</p>
              )}
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}

/* ─── Output Comparison View (outputs only, no grading) ──────────────── */

function OutputComparisonView({
  withSkillOutput,
  baselineOutput,
  withSkillScore,
  withSkillOverall,
  baselineScore,
  baselineOverall,
}: {
  withSkillOutput: string;
  baselineOutput: string;
  withSkillScore?: number;
  withSkillOverall?: EvalGrading['overall'];
  baselineScore?: number;
  baselineOverall?: EvalGrading['overall'];
}) {
  const [viewMode, setViewMode] = useState<'side-by-side' | 'unified'>('side-by-side');

  const diffSegments = useMemo(() => {
    if (viewMode !== 'unified') return null;
    if (withSkillOutput === baselineOutput) return 'identical' as const;
    return computeWordDiff(baselineOutput, withSkillOutput);
  }, [viewMode, withSkillOutput, baselineOutput]);

  return (
    <div className="space-y-5">
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-2">
          {SECTION_ICONS.output}
          <h3 className="text-sm font-bold text-slate-700 uppercase tracking-wide">Output Comparison</h3>
          <InfoTip text="Switch between side-by-side columns and unified diff view" />
        </div>
        <div className="inline-flex rounded-lg border border-slate-200 bg-slate-50 p-0.5">
          <button
            type="button"
            onClick={() => setViewMode('side-by-side')}
            className={`flex items-center gap-1.5 rounded-md px-3 py-1.5 text-xs font-medium transition-all duration-200 ${
              viewMode === 'side-by-side' ? 'bg-white text-slate-800 shadow-sm' : 'text-slate-500 hover:text-slate-700'
            }`}
          >
            <svg className="h-3.5 w-3.5" fill="none" viewBox="0 0 24 24" strokeWidth={2} stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" d="M9 4.5v15m6-15v15m-10.875 0h15.75c.621 0 1.125-.504 1.125-1.125V5.625c0-.621-.504-1.125-1.125-1.125H4.125C3.504 4.5 3 5.004 3 5.625v12.75c0 .621.504 1.125 1.125 1.125Z" />
            </svg>
            Side by Side
          </button>
          <button
            type="button"
            onClick={() => setViewMode('unified')}
            className={`flex items-center gap-1.5 rounded-md px-3 py-1.5 text-xs font-medium transition-all duration-200 ${
              viewMode === 'unified' ? 'bg-white text-slate-800 shadow-sm' : 'text-slate-500 hover:text-slate-700'
            }`}
          >
            <svg className="h-3.5 w-3.5" fill="none" viewBox="0 0 24 24" strokeWidth={2} stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" d="M3.75 6.75h16.5M3.75 12h16.5m-16.5 5.25h16.5" />
            </svg>
            Unified Diff
          </button>
        </div>
      </div>

      {viewMode === 'side-by-side' && (
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          <div>
            <div className="flex items-center gap-2 mb-2 flex-wrap">
              <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full bg-indigo-50 text-indigo-700 text-[10px] font-semibold uppercase tracking-wide">
                With Skill
              </span>
              {withSkillScore !== undefined && withSkillOverall && (
                <ScorePill label="" score={withSkillScore} overall={withSkillOverall} />
              )}
            </div>
            <OutputContentViewer content={withSkillOutput} />
          </div>
          <div>
            <div className="flex items-center gap-2 mb-2 flex-wrap">
              <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full bg-slate-100 text-slate-600 text-[10px] font-semibold uppercase tracking-wide">
                Baseline
              </span>
              {baselineScore !== undefined && baselineOverall && (
                <ScorePill label="" score={baselineScore} overall={baselineOverall} muted />
              )}
            </div>
            <OutputContentViewer content={baselineOutput} variant="baseline" />
          </div>
        </div>
      )}

      {viewMode === 'unified' && (
        <div>
          <div className="flex items-center gap-2 mb-3">
            <InfoTip text="Green highlights show text added by the skill. Red strikethrough shows text removed." size="h-3 w-3" />
          </div>
          {diffSegments === 'identical' ? (
            <div className="flex items-center gap-2 rounded-xl border border-slate-200 bg-slate-50/50 px-4 py-3">
              <svg className="h-4 w-4 text-slate-400" fill="none" viewBox="0 0 24 24" strokeWidth={2} stroke="currentColor">
                <path strokeLinecap="round" strokeLinejoin="round" d="m11.25 11.25.041-.02a.75.75 0 0 1 1.063.852l-.708 2.836a.75.75 0 0 0 1.063.853l.041-.021M21 12a9 9 0 1 1-18 0 9 9 0 0 1 18 0Zm-9-3.75h.008v.008H12V8.25Z" />
              </svg>
              <p className="text-sm text-slate-500">No differences — both outputs are identical.</p>
            </div>
          ) : diffSegments === null ? (
            <div className="flex items-center gap-2 rounded-xl border border-amber-100 bg-amber-50/50 px-4 py-3">
              <svg className="h-4 w-4 text-amber-500" fill="none" viewBox="0 0 24 24" strokeWidth={2} stroke="currentColor">
                <path strokeLinecap="round" strokeLinejoin="round" d="M12 9v3.75m-9.303 3.376c-.866 1.5.217 3.374 1.948 3.374h14.71c1.73 0 2.813-1.874 1.948-3.374L13.949 3.378c-.866-1.5-3.032-1.5-3.898 0L2.697 16.126ZM12 15.75h.007v.008H12v-.008Z" />
              </svg>
              <p className="text-sm text-amber-700">Output too large for inline diff. Use side-by-side view instead.</p>
            </div>
          ) : (
            <div className="rounded-xl border border-slate-200 bg-white p-5">
              <p className="text-sm leading-relaxed whitespace-pre-wrap">
                {diffSegments.map((segment, i) => {
                  if (segment.type === 'equal') return <span key={i}>{segment.text}</span>;
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
        </div>
      )}
    </div>
  );
}

/* ─── Helpers (unchanged from original) ──────────────────────────────── */

function parseFrontmatter(raw: string): { meta: Record<string, string>; body: string } | null {
  const match = raw.match(/^---\r?\n([\s\S]*?)\r?\n---\r?\n?([\s\S]*)$/);
  if (!match) return null;
  const yamlBlock = match[1];
  const body = match[2];
  const meta: Record<string, string> = {};
  for (const line of yamlBlock.split('\n')) {
    const colonIdx = line.indexOf(':');
    if (colonIdx === -1) continue;
    const key = line.slice(0, colonIdx).trim();
    let value = line.slice(colonIdx + 1).trim();
    if ((value.startsWith('"') && value.endsWith('"')) || (value.startsWith("'") && value.endsWith("'"))) {
      value = value.slice(1, -1);
    }
    if (key) meta[key] = value;
  }
  return { meta, body };
}

function OutputContentViewer({ content, variant = 'default' }: { content: string; variant?: 'default' | 'baseline' }) {
  const [viewMode, setViewMode] = useState<'rendered' | 'source'>('rendered');
  const parsed = useMemo(() => parseFrontmatter(content), [content]);
  const hasMarkdownContent = /[#*`\-[\]|>]/.test(content);

  if (!hasMarkdownContent) {
    return (
      <div className={`rounded-xl border p-4 ${variant === 'baseline' ? 'border-dashed border-slate-300 bg-slate-50/50' : 'border-slate-200 bg-white'}`}>
        <pre className={`whitespace-pre-wrap text-sm leading-relaxed ${variant === 'baseline' ? 'text-slate-500' : 'text-slate-700'}`}>
          {content}
        </pre>
      </div>
    );
  }

  return (
    <div className="flex flex-col">
      <div className="flex items-center justify-end gap-1 pb-3">
        <div className="inline-flex rounded-lg border border-slate-200 bg-slate-50 p-0.5">
          <button
            type="button"
            onClick={() => setViewMode('source')}
            className={`flex items-center gap-1.5 rounded-md px-3 py-1.5 text-xs font-medium transition-all duration-200 ${viewMode === 'source' ? 'bg-white text-slate-800 shadow-sm' : 'text-slate-500 hover:text-slate-700'}`}
          >
            <svg className="h-3.5 w-3.5" fill="none" viewBox="0 0 24 24" strokeWidth={2} stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" d="M17.25 6.75 22.5 12l-5.25 5.25m-10.5 0L1.5 12l5.25-5.25m7.5-3-4.5 16.5" />
            </svg>
            Source
          </button>
          <button
            type="button"
            onClick={() => setViewMode('rendered')}
            className={`flex items-center gap-1.5 rounded-md px-3 py-1.5 text-xs font-medium transition-all duration-200 ${viewMode === 'rendered' ? 'bg-white text-slate-800 shadow-sm' : 'text-slate-500 hover:text-slate-700'}`}
          >
            <svg className="h-3.5 w-3.5" fill="none" viewBox="0 0 24 24" strokeWidth={2} stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" d="M2.036 12.322a1.012 1.012 0 0 1 0-.639C3.423 7.51 7.36 4.5 12 4.5c4.638 0 8.573 3.007 9.963 7.178.07.207.07.431 0 .639C20.577 16.49 16.64 19.5 12 19.5c-4.638 0-8.573-3.007-9.963-7.178Z" />
              <path strokeLinecap="round" strokeLinejoin="round" d="M15 12a3 3 0 1 1-6 0 3 3 0 0 1 6 0Z" />
            </svg>
            Preview
          </button>
        </div>
      </div>
      {viewMode === 'rendered' ? (
        <div className={`markdown-body overflow-auto rounded-xl border p-5 ${variant === 'baseline' ? 'border-dashed border-slate-300 bg-slate-50/50' : 'border-slate-200 bg-white'}`}>
          {parsed && Object.keys(parsed.meta).length > 0 && (
            <table className="frontmatter-table">
              <tbody>
                {Object.entries(parsed.meta).map(([key, value]) => (
                  <tr key={key}>
                    <td className="font-semibold text-slate-600">{key}</td>
                    <td>{value}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
          <Markdown remarkPlugins={[remarkGfm, remarkFrontmatter]}>
            {parsed ? parsed.body : content}
          </Markdown>
        </div>
      ) : (
        <pre className={`overflow-auto whitespace-pre-wrap rounded-xl border p-5 font-mono text-sm leading-relaxed ${variant === 'baseline' ? 'border-dashed border-slate-300 bg-slate-50/50 text-slate-500' : 'border-slate-200 bg-slate-50/80 text-slate-700'}`}>
          {content}
        </pre>
      )}
    </div>
  );
}

const SECTION_ICONS = {
  prompt: (
    <svg className="h-4 w-4 text-slate-500" fill="none" viewBox="0 0 24 24" strokeWidth={2} stroke="currentColor">
      <path strokeLinecap="round" strokeLinejoin="round" d="M7.5 8.25h9m-9 3H12m-9.75 1.51c0 1.6 1.123 2.994 2.707 3.227 1.087.16 2.185.283 3.293.369V21l4.076-4.076a1.526 1.526 0 0 1 1.037-.443 48.282 48.282 0 0 0 5.68-.494c1.584-.233 2.707-1.626 2.707-3.228V6.741c0-1.602-1.123-2.995-2.707-3.228A48.394 48.394 0 0 0 12 3c-2.392 0-4.744.175-7.043.513C3.373 3.746 2.25 5.14 2.25 6.741v6.018Z" />
    </svg>
  ),
  output: (
    <svg className="h-4 w-4 text-indigo-500" fill="none" viewBox="0 0 24 24" strokeWidth={2} stroke="currentColor">
      <path strokeLinecap="round" strokeLinejoin="round" d="M19.5 14.25v-2.625a3.375 3.375 0 0 0-3.375-3.375h-1.5A1.125 1.125 0 0 1 13.5 7.125v-1.5a3.375 3.375 0 0 0-3.375-3.375H8.25m0 12.75h7.5m-7.5 3H12M10.5 2.25H5.625c-.621 0-1.125.504-1.125 1.125v17.25c0 .621.504 1.125 1.125 1.125h12.75c.621 0 1.125-.504 1.125-1.125V11.25a9 9 0 0 0-9-9Z" />
    </svg>
  ),
  files: (
    <svg className="h-4 w-4 text-purple-500" fill="none" viewBox="0 0 24 24" strokeWidth={2} stroke="currentColor">
      <path strokeLinecap="round" strokeLinejoin="round" d="M2.25 12.75V12A2.25 2.25 0 0 1 4.5 9.75h15A2.25 2.25 0 0 1 21.75 12v.75m-8.69-6.44-2.12-2.12a1.5 1.5 0 0 0-1.061-.44H4.5A2.25 2.25 0 0 0 2.25 6v12a2.25 2.25 0 0 0 2.25 2.25h15A2.25 2.25 0 0 0 21.75 18V9a2.25 2.25 0 0 0-2.25-2.25h-5.379a1.5 1.5 0 0 1-1.06-.44Z" />
    </svg>
  ),
};

function OutputSection({ title, icon, children, tooltip }: { title: string; icon: keyof typeof SECTION_ICONS; children: React.ReactNode; tooltip?: string }) {
  return (
    <section>
      <div className="flex items-center gap-2 mb-3">
        {SECTION_ICONS[icon]}
        <h3 className="text-sm font-bold text-slate-700 uppercase tracking-wide">{title}</h3>
        {tooltip && <InfoTip text={tooltip} />}
      </div>
      {children}
    </section>
  );
}

function ScorePill({ label, score, overall, muted = false }: {
  label: string;
  score: number;
  overall: EvalGrading['overall'];
  muted?: boolean;
}) {
  const colors: Record<EvalGrading['overall'], string> = {
    pass: 'bg-green-50 border-green-200 text-green-700',
    fail: 'bg-red-50 border-red-200 text-red-700',
    partial: 'bg-amber-50 border-amber-200 text-amber-700',
  };
  const verdictLabels: Record<EvalGrading['overall'], string> = {
    pass: 'Pass', fail: 'Fail', partial: 'Partial',
  };
  return (
    <div className={`inline-flex items-center gap-2 rounded-lg border px-3 py-1.5 ${muted ? 'opacity-70' : ''} ${colors[overall]}`}>
      {label && <span className="text-[10px] font-semibold uppercase tracking-wide opacity-70">{label}</span>}
      <span className="text-sm font-bold">{score}/100</span>
      <span className="text-[10px] font-semibold">{verdictLabels[overall]}</span>
    </div>
  );
}

function StatusIndicator({ status }: { status: EvalRun['status'] }) {
  const config: Record<EvalRun['status'], { bg: string; text: string; dot: string; label: string }> = {
    pending: { bg: 'bg-slate-50', text: 'text-slate-700', dot: 'bg-slate-400', label: 'Pending' },
    running: { bg: 'bg-indigo-50', text: 'text-indigo-700', dot: 'bg-indigo-400', label: 'Running' },
    completed: { bg: 'bg-emerald-50', text: 'text-emerald-700', dot: 'bg-emerald-400', label: 'Completed' },
    failed: { bg: 'bg-red-50', text: 'text-red-700', dot: 'bg-red-400', label: 'Failed' },
  };
  const { bg, text, dot, label } = config[status];
  return (
    <span className={`inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full text-xs font-semibold ${bg} ${text}`} role="status" aria-label={`Run status: ${label}`}>
      <span className={`h-1.5 w-1.5 rounded-full ${dot}`} />
      {label}
    </span>
  );
}

function TimingInfo({ timing }: { timing: EvalRun['timing'] }) {
  return (
    <div className="flex items-center gap-2 text-xs text-slate-500 flex-wrap">
      <div className="flex items-center gap-1">
        <svg className="h-3.5 w-3.5 text-slate-400" fill="none" viewBox="0 0 24 24" strokeWidth={2} stroke="currentColor">
          <path strokeLinecap="round" strokeLinejoin="round" d="M12 6v6h4.5m4.5 0a9 9 0 1 1-18 0 9 9 0 0 1 18 0Z" />
        </svg>
        <span className="font-medium">{formatDuration(timing.durationMs)}</span>
      </div>
      <span className="text-slate-300">·</span>
      <span>{timing.totalTokens.toLocaleString()} tokens</span>
      {timing.outputChars != null && (
        <>
          <span className="text-slate-300">·</span>
          <span>{timing.outputChars.toLocaleString()} chars</span>
        </>
      )}
      <InfoTip text="Duration includes model inference time. Tokens = total input + output tokens consumed. Chars = total characters in the output." size="h-3 w-3" />
    </div>
  );
}
