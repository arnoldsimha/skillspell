import React, { useState, useEffect, useMemo, useCallback, memo } from 'react';
import type { EvalBenchmark, SkillVersionSummary } from '@skillspell/shared';
import { fetchVersionHistory, fetchBenchmark as apiFetchBenchmark } from '../../services/api/index.js';
import { useEvals } from '../../hooks/useEvals.js';
import { useEvalRunner } from '../../hooks/useEvalRunner.js';
import { useEvalViewer } from '../../hooks/useEvalViewer.js';
import { InfoTip } from '../common/InfoTip.js';
import EvalRunProgress from './EvalRunProgress.js';
import { EvalOutputsTab } from './EvalOutputsTab.js';
import { EvalBenchmarkTab } from './EvalBenchmarkTab.js';
import { EvalRunComparison } from './EvalRunComparison.js';
import { EvalRunListPanel } from './EvalRunListPanel.js';

interface EvalViewerProps {
  skillId: string;
  onClose?: () => void;
  /** Version selected by the parent (page-level dropdown). undefined = all/current. */
  selectedVersion?: number;
}

function EvalViewerComponent({ skillId, onClose, selectedVersion }: EvalViewerProps) {
  const {
    evalCases,
    evalRuns,
    benchmark,
    feedbackMap,
    loading,
    running,
    deleting,
    error,
    loadEvalCases,
    loadEvalRuns,
    loadBenchmark,
    loadFeedback,
    deleteRun,
    submitFeedback,
    clearError,
  } = useEvals();
  const { progress: evalProgress, startRun: startEvalRun, cancel: cancelEvalRun } = useEvalRunner();

  // Version history for cross-version comparison
  const [versions, setVersions] = useState<SkillVersionSummary[]>([]);

  // Load data on mount and when selectedVersion changes
  useEffect(() => {
    loadEvalCases(skillId);
    loadEvalRuns(skillId);
    loadBenchmark(skillId, selectedVersion);
    loadFeedback(skillId);
    fetchVersionHistory(skillId).then(setVersions).catch(() => { /* non-critical */ });
  }, [skillId, loadEvalCases, loadEvalRuns, loadBenchmark, loadFeedback, selectedVersion]);

  // Callback for cross-version comparison — loads a benchmark for a specific version
  const loadBenchmarkForVersion = useCallback(async (version: number): Promise<EvalBenchmark | null> => {
    try {
      return await apiFetchBenchmark(skillId, version);
    } catch {
      return null;
    }
  }, [skillId]);

  // Filter runs by selected version
  const filteredRuns = useMemo(() => {
    if (selectedVersion == null) return evalRuns;
    return evalRuns.filter((r) => r.skillVersion === selectedVersion);
  }, [evalRuns, selectedVersion]);

  // Filter eval cases by selected version (only cases that existed at that version)
  const filteredEvalCases = useMemo(() => {
    if (selectedVersion == null) return evalCases;
    return evalCases.filter((ec) => (ec.createdAtVersion ?? 1) <= selectedVersion);
  }, [evalCases, selectedVersion]);

  const viewer = useEvalViewer({
    runs: filteredRuns,
    skillId,
    feedbackMap,
    onSaveFeedback: submitFeedback,
  });

  // Find the eval case for the current run
  const currentEvalCase = useMemo(() => {
    if (!viewer.currentRun) return undefined;
    return evalCases.find((ec) => ec.id === viewer.currentRun?.evalId);
  }, [evalCases, viewer.currentRun]);

  const [showRerunConfirm, setShowRerunConfirm] = useState(false);
  const [compareBaseline, setCompareBaseline] = useState(true);
  const [showRunList, setShowRunList] = useState(true);

  // Handle running all evals — with confirmation if results already exist
  const handleRunAllClick = () => {
    if (evalRuns.length > 0) {
      setShowRerunConfirm(true);
    } else {
      handleRunAll();
    }
  };

  const handleRunAll = () => {
    setShowRerunConfirm(false);
    startEvalRun(skillId, {
      config: {
        compareBaseline,
      },
      ...(selectedVersion != null ? { targetVersion: selectedVersion } : {}),
    });
  };

  // Handle deleting a single eval run
  const handleDeleteRun = async (runId: string) => {
    try {
      await deleteRun(skillId, runId);
      // Refresh benchmark after deletion (filtered by selected version)
      await loadBenchmark(skillId, selectedVersion);
    } catch {
      // Error is already handled in the hook
    }
  };

  // Handle compare button click
  const handleCompare = useCallback(() => {
    if (viewer.comparisonPair) {
      viewer.setIsComparing(true);
    }
  }, [viewer]);

  // Handle closing the comparison view
  const handleCloseComparison = useCallback(() => {
    viewer.setIsComparing(false);
  }, [viewer]);

  return (
    <div className="relative flex flex-col h-full bg-white rounded-2xl shadow-lg overflow-hidden">
      {/* Re-run confirmation dialog */}
      {showRerunConfirm && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-900/40 backdrop-blur-sm animate-backdrop">
          <div className="rounded-2xl bg-white shadow-2xl border border-slate-200 p-6 max-w-sm mx-4 animate-scale-in">
            <div className="flex items-center gap-3 mb-4">
              <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-amber-50">
                <svg className="h-5 w-5 text-amber-500" fill="none" viewBox="0 0 24 24" strokeWidth={2} stroke="currentColor">
                  <path strokeLinecap="round" strokeLinejoin="round" d="M12 9v3.75m9-.75a9 9 0 1 1-18 0 9 9 0 0 1 18 0Zm-9 3.75h.008v.008H12v-.008Z" />
                </svg>
              </div>
              <div>
                <h3 className="text-sm font-bold text-slate-800">Re-run Evaluations?</h3>
                <p className="text-xs text-slate-500 mt-0.5">You already have {evalRuns.length} eval run{evalRuns.length !== 1 ? 's' : ''}</p>
              </div>
            </div>
            <p className="text-sm text-slate-600 mb-5 leading-relaxed">
              Running evals again will create new results alongside the existing ones. This is useful for variance analysis across multiple runs.
            </p>
            <div className="flex items-center gap-2 justify-end">
              <button
                onClick={() => setShowRerunConfirm(false)}
                className="rounded-xl px-4 py-2 text-sm font-medium text-slate-600 hover:bg-slate-100 transition-all duration-200"
              >
                Cancel
              </button>
              <button
                onClick={handleRunAll}
                className="rounded-xl px-4 py-2 text-sm font-semibold bg-gradient-to-r from-indigo-600 to-purple-600 text-white shadow-lg shadow-indigo-500/20 hover:shadow-xl hover:brightness-110 transition-all duration-200"
              >
                Run Again
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Fullscreen running overlay with real-time progress */}
      {evalProgress.running && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-900/40 backdrop-blur-sm animate-backdrop">
          <div className="mx-4 w-full max-w-lg animate-scale-in">
            <EvalRunProgress progress={evalProgress} onCancel={cancelEvalRun} />
          </div>
        </div>
      )}

      {/* Header */}
      <div className="flex items-center justify-between px-6 py-4 border-b border-slate-200/80 bg-white relative z-10 overflow-visible">
        <div className="flex items-center gap-3">
          <div className="flex h-8 w-8 items-center justify-center rounded-lg bg-indigo-50">
            <svg className="h-4 w-4 text-indigo-600" fill="none" viewBox="0 0 24 24" strokeWidth={2} stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" d="M3 13.125C3 12.504 3.504 12 4.125 12h2.25c.621 0 1.125.504 1.125 1.125v6.75C7.5 20.496 6.996 21 6.375 21h-2.25A1.125 1.125 0 0 1 3 19.875v-6.75ZM9.75 8.625c0-.621.504-1.125 1.125-1.125h2.25c.621 0 1.125.504 1.125 1.125v11.25c0 .621-.504 1.125-1.125 1.125h-2.25a1.125 1.125 0 0 1-1.125-1.125V8.625ZM16.5 4.125c0-.621.504-1.125 1.125-1.125h2.25C20.496 3 21 3.504 21 4.125v15.75c0 .621-.504 1.125-1.125 1.125h-2.25a1.125 1.125 0 0 1-1.125-1.125V4.125Z" />
            </svg>
          </div>
          <div>
            <h2 className="text-lg font-bold text-slate-800">Eval Results</h2>
            <p className="text-xs text-slate-500">
              {filteredEvalCases.length} test case{filteredEvalCases.length !== 1 ? 's' : ''}{selectedVersion != null && filteredEvalCases.length !== evalCases.length ? ` of ${evalCases.length}` : ''} · {filteredRuns.length} run{filteredRuns.length !== 1 ? 's' : ''}
              {selectedVersion != null && (filteredRuns.length !== evalRuns.length || filteredEvalCases.length !== evalCases.length) && (
                <span className="ml-1 text-indigo-500">(v{selectedVersion})</span>
              )}
            </p>
          </div>
        </div>
        <div className="flex items-center gap-3">
          <label className="flex items-center gap-1.5 cursor-pointer select-none group">
            <input
              type="checkbox"
              checked={compareBaseline}
              onChange={(e) => setCompareBaseline(e.target.checked)}
              disabled={running}
              className="h-3.5 w-3.5 rounded border-slate-300 text-indigo-600 focus:ring-indigo-500 disabled:opacity-50 cursor-pointer"
            />
            <span className="text-xs font-medium text-slate-500 group-hover:text-slate-700 transition-colors">
              Baseline
            </span>
            <InfoTip text="Also run each eval without the skill to compare baseline vs with-skill performance. Required for discrimination analysis." size="h-3 w-3" />
          </label>
          <button
            onClick={handleRunAllClick}
            disabled={running || filteredEvalCases.length === 0}
            className={`flex items-center gap-1.5 rounded-xl px-3.5 py-2 text-sm font-semibold transition-all duration-200 ${
              running || filteredEvalCases.length === 0
                ? 'bg-slate-100 text-slate-400 cursor-not-allowed'
                : 'bg-gradient-to-r from-indigo-600 to-purple-600 text-white shadow-lg shadow-indigo-500/20 hover:shadow-xl hover:brightness-110'
            }`}
          >
            <svg className="h-4 w-4" fill="none" viewBox="0 0 24 24" strokeWidth={2} stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" d="M5.25 5.653c0-.856.917-1.398 1.667-.986l11.54 6.347a1.125 1.125 0 0 1 0 1.972l-11.54 6.347a1.125 1.125 0 0 1-1.667-.986V5.653Z" />
            </svg>
            {running ? 'Running…' : selectedVersion != null ? `Run v${selectedVersion}` : 'Run All Evals'}
          </button>
          <InfoTip text="Execute all test cases against the selected skill version and grade the results automatically using AI" />
          {onClose && (
            <button
              onClick={onClose}
              className="rounded-xl p-2 text-slate-400 hover:bg-slate-100 hover:text-slate-700 transition-all duration-200"
              aria-label="Close eval viewer"
            >
              <svg
                className="w-5 h-5"
                fill="none"
                stroke="currentColor"
                viewBox="0 0 24 24"
              >
                <path
                  strokeLinecap="round"
                  strokeLinejoin="round"
                  strokeWidth={2}
                  d="M6 18L18 6M6 6l12 12"
                />
              </svg>
            </button>
          )}
        </div>
      </div>

      {/* Error banner */}
      {error && (
        <div className="bg-red-50 border-b border-red-200/60 px-6 py-3 flex items-center justify-between">
          <div className="flex items-center gap-2">
            <div className="flex h-6 w-6 items-center justify-center rounded-lg bg-red-100">
              <svg className="h-3.5 w-3.5 text-red-500" fill="none" viewBox="0 0 24 24" strokeWidth={2} stroke="currentColor">
                <path strokeLinecap="round" strokeLinejoin="round" d="M12 9v3.75m9-.75a9 9 0 1 1-18 0 9 9 0 0 1 18 0Zm-9 3.75h.008v.008H12v-.008Z" />
              </svg>
            </div>
            <span className="text-sm text-red-700">{error}</span>
          </div>
          <button
            onClick={clearError}
            className="rounded-xl px-3 py-1 text-xs font-medium text-red-600 hover:bg-red-100 transition-all duration-200"
          >
            Dismiss
          </button>
        </div>
      )}

      {/* Tabs */}
      <div className="flex items-center border-b border-slate-200/80 bg-white px-6">
        {/* Run list toggle — on LEFT side, only show on Outputs tab when runs exist */}
        {viewer.activeTab === 'outputs' && filteredRuns.length > 0 && (
          <button
            onClick={() => setShowRunList((v) => !v)}
            className={`flex items-center gap-1.5 rounded-lg px-2.5 py-1.5 mr-3 text-xs font-medium transition-all duration-200 ${
              showRunList
                ? 'bg-indigo-50 text-indigo-600'
                : 'text-slate-400 hover:bg-slate-100 hover:text-slate-600'
            }`}
            title={showRunList ? 'Hide run list panel' : 'Show run list panel'}
          >
            <svg className="h-3.5 w-3.5" fill="none" viewBox="0 0 24 24" strokeWidth={2} stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" d="M3.75 12h16.5m-16.5 3.75h16.5M3.75 19.5h16.5M5.625 4.5h12.75a1.875 1.875 0 0 1 0 3.75H5.625a1.875 1.875 0 0 1 0-3.75Z" />
            </svg>
            Runs
          </button>
        )}
        <div className="flex flex-1">
          <TabButton
            active={viewer.activeTab === 'outputs'}
            onClick={() => viewer.setActiveTab('outputs')}
            count={filteredRuns.length}
            tooltip="View individual eval run results — see prompts, outputs, grading details, and provide feedback"
          >
            Outputs
          </TabButton>
          <TabButton
            active={viewer.activeTab === 'benchmark'}
            onClick={() => viewer.setActiveTab('benchmark')}
            tooltip="View aggregated statistics — pass rates, variance analysis, and performance trends across all runs"
          >
            Benchmark
          </TabButton>
        </div>
      </div>

      {/* Tab content with optional side panel */}
      <div className="flex-1 overflow-hidden flex">
        {/* Run list side panel — visible on Outputs tab when toggled on */}
        {viewer.activeTab === 'outputs' && showRunList && filteredRuns.length > 0 && (
          <div className="w-64 shrink-0 border-r border-slate-200/80 bg-white flex flex-col overflow-hidden">
            <EvalRunListPanel
             runs={filteredRuns}
             evalCases={evalCases}
             currentIndex={viewer.currentIndex}
             onGoToIndex={viewer.goToIndex}
             selectedRunIds={viewer.selectedRunIds}
             onToggleRunSelection={viewer.toggleRunSelection}
             onClearRunSelection={viewer.clearRunSelection}
             onCompare={handleCompare}
             slotA={viewer.slotA}
             selectionError={viewer.selectionError}
             comparisonSuggestions={viewer.comparisonSuggestions}
             onQuickCompare={viewer.quickCompare}
             onSelectSuggestion={(runId: string) => {
               viewer.selectSlot('B', runId);
             }}
           />
          </div>
        )}

        {/* Main content area */}
        <div className="flex-1 overflow-hidden">
          {viewer.isComparing && viewer.comparisonPair ? (
            <EvalRunComparison
              runA={viewer.comparisonPair[0]}
              runB={viewer.comparisonPair[1]}
              evalCases={evalCases}
              onClose={handleCloseComparison}
            />
          ) : viewer.activeTab === 'outputs' ? (
            <EvalOutputsTab
              currentIndex={viewer.currentIndex}
              totalRuns={viewer.totalRuns}
              hasPrev={viewer.hasPrev}
              hasNext={viewer.hasNext}
              onPrev={viewer.goToPrev}
              onNext={viewer.goToNext}
              onGoToIndex={viewer.goToIndex}
              currentRun={viewer.currentRun}
              evalCase={currentEvalCase}
              feedbackText={viewer.feedbackText}
              feedbackRating={viewer.feedbackRating}
              onFeedbackTextChange={viewer.setFeedbackText}
              onFeedbackRatingChange={viewer.setFeedbackRating}
              onSaveFeedback={viewer.saveFeedback}
              isSavingFeedback={viewer.savingFeedback}
              feedbackSaved={viewer.feedbackSaved}
              feedbackDirty={viewer.feedbackDirty}
              onDeleteRun={handleDeleteRun}
              isDeleting={deleting}
              selectedRunIds={viewer.selectedRunIds}
              onToggleRunSelection={viewer.toggleRunSelection}
              onClearRunSelection={viewer.clearRunSelection}
              onCompare={handleCompare}
              allRuns={filteredRuns}
              allEvalCases={evalCases}
              slotA={viewer.slotA}
              slotB={viewer.slotB}
              selectionError={viewer.selectionError}
            />
          ) : (
            <EvalBenchmarkTab
              benchmark={benchmark}
              isLoading={loading}
              versions={versions}
              selectedVersion={selectedVersion}
              onLoadBenchmark={loadBenchmarkForVersion}
              skillId={skillId}
              evalCases={evalCases}
              onAssertionsUpdated={() => { loadEvalCases(skillId); loadBenchmark(skillId, selectedVersion); }}
              onRunEvals={() => {
                startEvalRun(skillId, {
                  config: { compareBaseline },
                  ...(selectedVersion != null ? { targetVersion: selectedVersion } : {}),
                });
              }}
            />
          )}
        </div>
      </div>
    </div>
  );
}

export const EvalViewer = memo(EvalViewerComponent);

/* ─── Helper components ──────────────────────────────────────────────── */

function TabButton({
  active,
  onClick,
  children,
  count,
  tooltip,
}: {
  active: boolean;
  onClick: () => void;
  children: React.ReactNode;
  count?: number;
  tooltip?: string;
}) {
  return (
    <button
      onClick={onClick}
      className={`px-1 py-3 text-sm font-medium border-b-2 mr-6 transition-all duration-200 ${
        active
          ? 'border-indigo-500 text-indigo-600'
          : 'border-transparent text-slate-500 hover:text-slate-700'
      }`}
    >
      <span className="inline-flex items-center gap-1">
        {children}
        {tooltip && <InfoTip text={tooltip} size="h-3 w-3" />}
      </span>
      {count !== undefined && count > 0 && (
        <span className={`ml-2 rounded-full px-2 py-0.5 text-[10px] font-semibold ${
          active ? 'bg-indigo-100 text-indigo-600' : 'bg-slate-100 text-slate-500'
        }`}>
          {count}
        </span>
      )}
    </button>
  );
}
