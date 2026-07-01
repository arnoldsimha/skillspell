import { useState, useEffect, useCallback, useMemo } from 'react';
import { useNavigate } from 'react-router';
import type { Skill, SkillSummary, EvalCase, EvalBenchmark, SkillVersionSummary } from '@skillspell/shared';
import { fetchSkill, fetchVersionHistory, fetchBenchmark as apiFetchBenchmark } from '../../services/api/index.js';
import { buildSkillPath } from '../../utils/parseVersionParam.js';
import { EvalCaseEditor } from '../eval/EvalCaseEditor.js';
import { EvalCaseList } from '../eval/EvalCaseList.js';
import { EvalHelpDialog } from '../eval/EvalHelpDialog.js';
import { GenerateTestEvalsDialog } from '../eval/GenerateTestEvalsDialog.js';
import { EvalOutputsTab } from '../eval/EvalOutputsTab.js';
import { EvalBenchmarkTab } from '../eval/EvalBenchmarkTab.js';
import { EvalRunComparison } from '../eval/EvalRunComparison.js';
import { EvalRunListPanel } from '../eval/EvalRunListPanel.js';
import DropdownMenu from '../common/DropdownMenu.js';
import EvalRunProgress from '../eval/EvalRunProgress.js';
import { useEvals } from '../../hooks/useEvals.js';
import { useEvalRunner } from '../../hooks/useEvalRunner.js';
import { useEvalViewer } from '../../hooks/useEvalViewer.js';
import { useToast } from '../common/ToastContext.js';

interface SkillTestsPageProps {
  skillId: string;
  pinnedVersion?: number;
  onBack: () => void;
  onUpdate?: (skill: Skill) => void;
  onOptimize?: (skill: SkillSummary) => void;
}

type TestsTab = 'cases' | 'results' | 'benchmark';

/**
 * Standalone tests page for a skill.
 * Contains test cases management, eval results, and benchmark.
 *
 * Flat 3-tab layout: Test Cases | Run Results | Benchmark
 * Single unified header with all primary actions.
 */
export default function SkillTestsPage({
  skillId,
  pinnedVersion,
  onBack,
  // eslint-disable-next-line @typescript-eslint/no-unused-vars
  onUpdate: _onUpdate,
  onOptimize,
}: SkillTestsPageProps) {
  const navigate = useNavigate();
  const [skill, setSkill] = useState<Skill | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [showCaseEditor, setShowCaseEditor] = useState(false);
  const [showGenerateDialog, setShowGenerateDialog] = useState(false);
  const [testsTab, setTestsTab] = useState<TestsTab>('cases');
  const [editingCase, setEditingCase] = useState<EvalCase | null>(null);
  const [deletingCase, setDeletingCase] = useState<EvalCase | null>(null);
  const [showEvalHelp, setShowEvalHelp] = useState(false);

  // ── Eval data (lifted from EvalViewer) ──────────────────────────
  const {
    evalCases,
    evalRuns,
    benchmark,
    feedbackMap,
    loading: evalsLoading,
    running,
    deleting,
    generating,
    error: evalsError,
    createCase,
    updateCase,
    deleteCase,
    loadEvalCases,
    loadEvalRuns,
    loadBenchmark,
    loadFeedback,
    deleteRun,
    submitFeedback,
    generateTestEvals,
    cancelGenerate,
    bulkCreateCases,
    clearError,
  } = useEvals();
  const { progress: evalProgress, startRun: startEvalRun, cancel: cancelEvalRun } = useEvalRunner();
  const { addToast } = useToast();

  // Unified running state: either from legacy mutation or SSE stream
  const isRunning = running || evalProgress.running;

  // Version filter state (page-level — controls all tabs)
  const [versions, setVersions] = useState<SkillVersionSummary[]>([]);
  const [selectedVersion, setSelectedVersion] = useState<number | undefined>(pinnedVersion);
  const [versionSwitching, setVersionSwitching] = useState(false);

  // Eval viewer state (lifted from EvalViewer — compareBaseline, run evals dialog)
  const [showRunEvalsDialog, setShowRunEvalsDialog] = useState(false);
  const [compareBaseline, setCompareBaseline] = useState(true);

  const MAX_EVAL_CASES = 50;
  const isAtLimit = evalCases.length >= MAX_EVAL_CASES;

  // Filter runs by selected version
  const filteredRuns = useMemo(() => {
    if (selectedVersion == null) return evalRuns;
    return evalRuns.filter((r) => r.skillVersion === selectedVersion);
  }, [evalRuns, selectedVersion]);

  // Filter eval cases by selected version
  const filteredEvalCases = useMemo(() => {
    if (selectedVersion == null) return evalCases;
    return evalCases.filter((ec) => (ec.createdAtVersion ?? 1) <= selectedVersion);
  }, [evalCases, selectedVersion]);

  // ── useEvalViewer hook (navigation, feedback, comparison) ───────
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

  // Callback for cross-version comparison — loads a benchmark for a specific version
  const loadBenchmarkForVersion = useCallback(async (version: number): Promise<EvalBenchmark | null> => {
    try {
      return await apiFetchBenchmark(skillId, version);
    } catch {
      return null;
    }
  }, [skillId]);

  const handleAddTestCase = useCallback(() => {
    if (isAtLimit) {
      addToast('error', `Maximum of ${MAX_EVAL_CASES} test cases reached. Please delete some existing test cases before adding new ones.`);
      return;
    }
    setEditingCase(null);
    setShowCaseEditor(true);
  }, [isAtLimit, addToast]);

  // ── Run All Evals handler ───────────────────────────────────────
  const handleRunAllClick = useCallback(() => {
    setShowRunEvalsDialog(true);
  }, []);

  const handleRunAll = useCallback(() => {
    setShowRunEvalsDialog(false);
    // Use SSE-based eval runner for real-time progress
    startEvalRun(skillId, {
      config: { compareBaseline },
      ...(selectedVersion != null ? { targetVersion: selectedVersion } : {}),
    });
    // Auto-switch to Run Results tab so user sees progress
    setTestsTab('results');
  }, [skillId, compareBaseline, selectedVersion, startEvalRun]);

  // Handle deleting a single eval run
  const handleDeleteRun = useCallback(async (runId: string) => {
    try {
      await deleteRun(skillId, runId);
      await loadBenchmark(skillId, selectedVersion);
    } catch {
      // Error handled in hook
    }
  }, [skillId, selectedVersion, deleteRun, loadBenchmark]);

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

  // Handle optimize click
  const handleOptimize = useCallback(() => {
    if (skill && onOptimize) {
      const skillSummary: SkillSummary = {
        id: skill.id,
        ownerId: skill.ownerId,
        name: skill.name,
        description: skill.description,
        status: skill.status,
        version: skill.version,
        createdAt: skill.createdAt,
        updatedAt: skill.updatedAt,
        isPublished: skill.isPublished,
      };
      onOptimize(skillSummary);
    }
  }, [skill, onOptimize]);

  // ── Data loading ────────────────────────────────────────────────

  // Load skill
  useEffect(() => {
    let cancelled = false;
    setLoading(true);
    setError(null);
    fetchSkill(skillId)
      .then((data) => {
        if (!cancelled) setSkill(data);
      })
      .catch((err) => {
        if (!cancelled)
          setError(err instanceof Error ? err.message : 'Failed to load skill');
      })
      .finally(() => {
        if (!cancelled) setLoading(false);
      });
    return () => { cancelled = true; };
  }, [skillId]);

  // Load eval cases, runs, feedback, benchmark
  useEffect(() => {
    loadEvalCases(skillId);
    loadEvalRuns(skillId);
    loadBenchmark(skillId, selectedVersion);
    loadFeedback(skillId);
  }, [skillId, loadEvalCases, loadEvalRuns, loadBenchmark, loadFeedback, selectedVersion]);

  // Load version history for the page-level version dropdown
  useEffect(() => {
    fetchVersionHistory(skillId)
      .then(setVersions)
      .catch(() => { /* Non-critical */ });
  }, [skillId]);

  const isViewingOldVersion = selectedVersion != null && skill != null && selectedVersion < skill.version;

  // ── Overflow menu items ─────────────────────────────────────────
  const overflowMenuItems = useMemo(() => [
    {
      label: 'Auto Optimize Skill',
      icon: (
        <svg className="h-4 w-4" fill="none" viewBox="0 0 24 24" strokeWidth={2} stroke="currentColor">
          <path strokeLinecap="round" strokeLinejoin="round" d="M16.023 9.348h4.992v-.001M2.985 19.644v-4.992m0 0h4.992m-4.993 0 3.181 3.183a8.25 8.25 0 0 0 13.803-3.7M4.031 9.865a8.25 8.25 0 0 1 13.803-3.7l3.181 3.182" />
        </svg>
      ),
      disabled: isViewingOldVersion,
      disabledReason: isViewingOldVersion ? 'Switch to the latest version to auto-optimize' : undefined,
      onClick: () => {
        if (skill) {
          navigate(`/skills/${skill.id}/auto-optimize`, {
            state: { skill: { id: skill.id, name: skill.name, description: skill.description, ownerId: skill.ownerId, status: skill.status, version: skill.version, createdAt: skill.createdAt, updatedAt: skill.updatedAt } },
          });
        }
      },
    },
    {
      label: 'How Tests Work',
      icon: (
        <svg className="h-4 w-4" fill="none" viewBox="0 0 24 24" strokeWidth={2} stroke="currentColor">
          <path strokeLinecap="round" strokeLinejoin="round" d="M9.879 7.519c1.171-1.025 3.071-1.025 4.242 0 1.172 1.025 1.172 2.687 0 3.712-.203.179-.43.326-.67.442-.745.361-1.45.999-1.45 1.827v.75M12 18.75h.008v.008H12v-.008Z" />
        </svg>
      ),
      onClick: () => setShowEvalHelp(true),
    },
  ], [skill, navigate, isViewingOldVersion]);


  // ── Loading / Error states ──────────────────────────────────────

  if (loading) {
    return (
      <div className="flex h-full items-center justify-center">
        <div className="h-10 w-10 animate-spin-ease rounded-full border-[3px] border-indigo-200 border-t-indigo-600" />
      </div>
    );
  }

  if (error || !skill) {
    return (
      <div className="flex h-full flex-col items-center justify-center gap-4">
        <div className="flex h-12 w-12 items-center justify-center rounded-xl bg-red-50">
          <svg className="h-6 w-6 text-red-500" fill="none" viewBox="0 0 24 24" strokeWidth={1.5} stroke="currentColor">
            <path strokeLinecap="round" strokeLinejoin="round" d="M12 9v3.75m9-.75a9 9 0 1 1-18 0 9 9 0 0 1 18 0Zm-9 3.75h.008v.008H12v-.008Z" />
          </svg>
        </div>
        <p className="text-sm text-red-600">{error ?? 'Skill not found'}</p>
        <button
          onClick={onBack}
          className="rounded-xl bg-slate-100 px-4 py-2 text-sm font-medium text-slate-700 hover:bg-slate-200 transition-all duration-200"
        >
          Go Back
        </button>
      </div>
    );
  }

  // ── Render ──────────────────────────────────────────────────────

  return (
    <div className="flex h-full flex-col">
      {/* ── Unified Header ──────────────────────────────────────── */}
      <div className="flex items-center justify-between border-b border-slate-200/80 bg-white px-6 py-3">
        {/* Left: Back + Title + Version selector */}
        <div className="flex items-center gap-3">
          <button
            onClick={onBack}
            className="rounded-xl p-2 text-slate-400 hover:bg-slate-100 hover:text-slate-700 transition-all duration-200"
            aria-label="Back to skill"
          >
            <svg className="h-5 w-5" fill="none" viewBox="0 0 24 24" strokeWidth={2} stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" d="M15.75 19.5 8.25 12l7.5-7.5" />
            </svg>
          </button>
          <div className="flex items-center gap-2.5">
            <div className="flex h-8 w-8 items-center justify-center rounded-lg bg-amber-50">
              <svg className="h-4 w-4 text-amber-600" fill="none" viewBox="0 0 24 24" strokeWidth={2} stroke="currentColor">
                <path strokeLinecap="round" strokeLinejoin="round" d="M9.75 3.104v5.714a2.25 2.25 0 0 1-.659 1.591L5 14.5M9.75 3.104c-.251.023-.501.05-.75.082m.75-.082a24.301 24.301 0 0 1 4.5 0m0 0v5.714c0 .597.237 1.17.659 1.591L19.8 15.3M14.25 3.104c.251.023.501.05.75.082M19.8 15.3l-1.57.393A9.065 9.065 0 0 1 12 15a9.065 9.065 0 0 0-6.23.693L5 14.5m14.8.8 1.402 1.402c1.232 1.232.65 3.318-1.067 3.611l-.772.13c-1.687.282-3.41.395-5.13.334l-.213-.01a8.86 8.86 0 0 1-2.89-.614L5 18.5" />
              </svg>
            </div>
            <div>
              <h3 className="text-lg font-bold text-slate-800">
                Skill Tests
                <span className="text-slate-400 font-normal"> · </span>
                <span className="text-slate-500 font-medium text-base">{skill.name}</span>
              </h3>
            </div>
            {/* Page-level version selector */}
            {versions.length > 1 ? (
              <select
                value={selectedVersion ?? ''}
                onChange={(e) => {
                  const v = e.target.value ? Number(e.target.value) : undefined;
                  if (v && v !== skill.version) {
                    navigate(buildSkillPath(skillId, v, 'tests'));
                  } else {
                    navigate(buildSkillPath(skillId, undefined, 'tests'));
                  }
                  setSelectedVersion(v);
                  setVersionSwitching(true);
                  setTimeout(() => setVersionSwitching(false), 600);
                }}
                className="rounded-lg border border-slate-200 bg-white px-2 py-1.5 text-xs font-medium text-slate-700 shadow-sm hover:border-slate-300 focus:border-indigo-400 focus:ring-1 focus:ring-indigo-400 cursor-pointer transition-all"
                aria-label="Filter by skill version"
                title="Filter tests and results by skill version"
              >
                <option value="">All versions (latest v{skill.version})</option>
                {[...versions].sort((a, b) => b.version - a.version).map((v) => (
                  <option key={v.version} value={v.version}>
                    v{v.version}{v.version === skill.version ? ' (latest)' : ''}
                  </option>
                ))}
              </select>
            ) : (
              <span className="inline-flex items-center rounded-full bg-slate-100 px-1.5 py-0.5 text-[10px] font-semibold text-slate-500">
                v{skill.version}
              </span>
            )}
          </div>
        </div>

        {/* Right: Run Evals (always visible) + Overflow menu */}
        <div className="flex items-center gap-2">
          <button
            onClick={handleRunAllClick}
            disabled={isRunning || filteredEvalCases.length === 0}
            className={`flex items-center gap-1.5 rounded-xl px-3.5 py-2 text-sm font-semibold transition-all duration-200 ${
              isRunning || filteredEvalCases.length === 0
                ? 'bg-slate-100 text-slate-400 cursor-not-allowed'
                : 'bg-gradient-to-r from-indigo-600 to-purple-600 text-white shadow-lg shadow-indigo-500/20 hover:shadow-xl hover:brightness-110'
            }`}
            title="Execute all test cases against the selected skill version"
          >
            <svg className="h-4 w-4" fill="none" viewBox="0 0 24 24" strokeWidth={2} stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" d="M5.25 5.653c0-.856.917-1.398 1.667-.986l11.54 6.347a1.125 1.125 0 0 1 0 1.972l-11.54 6.347a1.125 1.125 0 0 1-1.667-.986V5.653Z" />
            </svg>
            {isRunning ? 'Running…' : selectedVersion != null ? `Run v${selectedVersion}` : 'Run Evals'}
          </button>
          <DropdownMenu items={overflowMenuItems} />
        </div>
      </div>

      {/* ── Tab bar (3 flat tabs + context actions) ─────────────── */}
      <div className="flex items-center justify-between border-b border-slate-200/80 bg-white px-6">
        <div className="flex">
          {/* Tab: Test Cases */}
          <button
            onClick={() => setTestsTab('cases')}
            className={`px-1 py-3 text-sm font-medium border-b-2 mr-6 transition-all duration-200 ${
              testsTab === 'cases'
                ? 'border-indigo-500 text-indigo-600'
                : 'border-transparent text-slate-500 hover:text-slate-700'
            }`}
          >
            Test Cases
            {filteredEvalCases.length > 0 && (
              <span className={`ml-2 rounded-full px-2 py-0.5 text-[10px] font-semibold ${
                testsTab === 'cases' ? 'bg-indigo-100 text-indigo-600' : 'bg-slate-100 text-slate-500'
              }`}>
                {filteredEvalCases.length}{selectedVersion != null && filteredEvalCases.length !== evalCases.length ? `/${evalCases.length}` : ''}
              </span>
            )}
          </button>

          {/* Tab: Run Results */}
          <button
            onClick={() => setTestsTab('results')}
            className={`px-1 py-3 text-sm font-medium border-b-2 mr-6 transition-all duration-200 ${
              testsTab === 'results'
                ? 'border-indigo-500 text-indigo-600'
                : 'border-transparent text-slate-500 hover:text-slate-700'
            }`}
          >
            Run Results
            {filteredRuns.length > 0 && (
              <span className={`ml-2 rounded-full px-2 py-0.5 text-[10px] font-semibold ${
                testsTab === 'results' ? 'bg-indigo-100 text-indigo-600' : 'bg-slate-100 text-slate-500'
              }`}>
                {filteredRuns.length}
              </span>
            )}
          </button>

          {/* Tab: Benchmark */}
          <button
            onClick={() => setTestsTab('benchmark')}
            className={`px-1 py-3 text-sm font-medium border-b-2 transition-all duration-200 ${
              testsTab === 'benchmark'
                ? 'border-indigo-500 text-indigo-600'
                : 'border-transparent text-slate-500 hover:text-slate-700'
            }`}
          >
            Benchmark
          </button>
        </div>

        {/* Tab-specific context actions (right side of tab bar) */}
        <div className="flex items-center gap-2">
          {testsTab === 'cases' && (
            <>
              <button
                onClick={() => setShowGenerateDialog(true)}
                disabled={generating || isAtLimit}
                className={`flex items-center gap-1.5 rounded-xl px-3 py-1.5 text-xs font-medium transition-all duration-200 ${
                  generating || isAtLimit
                    ? 'bg-purple-50 text-purple-300 cursor-not-allowed'
                    : 'bg-purple-50 border border-purple-200/60 text-purple-700 hover:bg-purple-100'
                }`}
                title={isAtLimit ? `Maximum of ${MAX_EVAL_CASES} test cases reached` : 'Use AI to generate multiple test cases at once'}
              >
                <svg className="h-3.5 w-3.5" fill="none" viewBox="0 0 24 24" strokeWidth={2} stroke="currentColor">
                  <path strokeLinecap="round" strokeLinejoin="round" d="M9.813 15.904 9 18.75l-.813-2.846a4.5 4.5 0 0 0-3.09-3.09L2.25 12l2.846-.813a4.5 4.5 0 0 0 3.09-3.09L9 5.25l.813 2.846a4.5 4.5 0 0 0 3.09 3.09L15.75 12l-2.846.813a4.5 4.5 0 0 0-3.09 3.09ZM18.259 8.715 18 9.75l-.259-1.035a3.375 3.375 0 0 0-2.455-2.456L14.25 6l1.036-.259a3.375 3.375 0 0 0 2.455-2.456L18 2.25l.259 1.035a3.375 3.375 0 0 0 2.455 2.456L21.75 6l-1.036.259a3.375 3.375 0 0 0-2.455 2.456Z" />
                </svg>
                {generating ? 'Generating…' : 'Generate'}
              </button>
              <button
                onClick={handleAddTestCase}
                disabled={isAtLimit}
                className={`flex items-center gap-1.5 rounded-xl px-3 py-1.5 text-xs font-semibold transition-all duration-200 ${
                  isAtLimit
                    ? 'bg-slate-200 text-slate-400 cursor-not-allowed'
                    : 'bg-gradient-to-r from-indigo-600 to-purple-600 text-white shadow-lg shadow-indigo-500/20 hover:shadow-xl hover:brightness-110'
                }`}
                title={isAtLimit ? `Maximum of ${MAX_EVAL_CASES} test cases reached` : 'Add a new test case'}
              >
                <svg className="h-3.5 w-3.5" fill="none" viewBox="0 0 24 24" strokeWidth={2.5} stroke="currentColor">
                  <path strokeLinecap="round" strokeLinejoin="round" d="M12 4.5v15m7.5-7.5h-15" />
                </svg>
                Add Test Case
              </button>
            </>
          )}


          {testsTab === 'benchmark' && versions.length >= 2 && (
            <span className="text-xs text-slate-400 font-medium">
              {versions.length} versions available for comparison
            </span>
          )}
        </div>
      </div>

      {/* ── Error banner (from eval operations) ────────────────── */}
      {evalsError && (
        <div className="bg-red-50 border-b border-red-200/60 px-6 py-3 flex items-center justify-between">
          <div className="flex items-center gap-2">
            <div className="flex h-6 w-6 items-center justify-center rounded-lg bg-red-100">
              <svg className="h-3.5 w-3.5 text-red-500" fill="none" viewBox="0 0 24 24" strokeWidth={2} stroke="currentColor">
                <path strokeLinecap="round" strokeLinejoin="round" d="M12 9v3.75m9-.75a9 9 0 1 1-18 0 9 9 0 0 1 18 0Zm-9 3.75h.008v.008H12v-.008Z" />
              </svg>
            </div>
            <span className="text-sm text-red-700">{evalsError}</span>
          </div>
          <button
            onClick={clearError}
            className="rounded-xl px-3 py-1 text-xs font-medium text-red-600 hover:bg-red-100 transition-all duration-200"
          >
            Dismiss
          </button>
        </div>
      )}

      {/* ── Tab content ────────────────────────────────────────── */}
      <div className="relative flex-1 overflow-hidden">
        {/* Version switching overlay */}
        {versionSwitching && (
          <div className="absolute inset-0 z-10 flex items-center justify-center bg-white/70 backdrop-blur-[2px] transition-opacity duration-200">
            <div className="flex flex-col items-center gap-3">
              <div className="h-8 w-8 animate-spin-ease rounded-full border-[3px] border-indigo-200 border-t-indigo-600" />
              <p className="text-xs font-medium text-slate-500">
                Loading v{selectedVersion ?? 'all'}…
              </p>
            </div>
          </div>
        )}

        {/* Test Cases tab */}
        {testsTab === 'cases' && (
          <div className="h-full overflow-y-auto">
            <EvalCaseList
              evalCases={filteredEvalCases}
              loading={evalsLoading}
              onEdit={(ec) => { setEditingCase(ec); setShowCaseEditor(true); }}
              onDelete={(ec) => setDeletingCase(ec)}
              onAdd={() => { setEditingCase(null); setShowCaseEditor(true); }}
            />
          </div>
        )}

        {/* Run Results tab — with always-visible side panel */}
        {testsTab === 'results' && (
          <div className="flex h-full overflow-hidden">
            {/* Side panel — always visible when runs exist */}
            {filteredRuns.length > 0 && (
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
              ) : (
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
                  onOptimize={handleOptimize}
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
              )}
            </div>
          </div>
        )}

        {/* Benchmark tab */}
        {testsTab === 'benchmark' && (
          <EvalBenchmarkTab
            benchmark={benchmark}
            isLoading={evalsLoading}
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

      {/* ── Run Evals confirmation dialog ──────────────────────── */}
      {showRunEvalsDialog && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 backdrop-blur-sm animate-backdrop" onClick={() => setShowRunEvalsDialog(false)}>
          <div
            className="mx-4 w-full max-w-lg max-h-[85vh] flex flex-col rounded-2xl bg-white shadow-2xl animate-scale-in"
            onClick={(e) => e.stopPropagation()}
          >
            {/* Dialog header */}
            <div className="flex items-center gap-3 p-6 pb-4 border-b border-slate-100">
              <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-indigo-50">
                <svg className="h-5 w-5 text-indigo-600" fill="none" viewBox="0 0 24 24" strokeWidth={2} stroke="currentColor">
                  <path strokeLinecap="round" strokeLinejoin="round" d="M5.25 5.653c0-.856.917-1.398 1.667-.986l11.54 6.347a1.125 1.125 0 0 1 0 1.972l-11.54 6.347a1.125 1.125 0 0 1-1.667-.986V5.653Z" />
                </svg>
              </div>
              <div className="flex-1">
                <h3 className="text-lg font-bold text-slate-800">Run Evaluations</h3>
                <p className="text-xs text-slate-500">Execute test cases against the skill and grade results</p>
              </div>
              <button onClick={() => setShowRunEvalsDialog(false)} className="rounded-lg p-1.5 text-slate-400 hover:text-slate-600 hover:bg-slate-100 transition-all" aria-label="Close dialog" title="Close">
                <svg className="h-5 w-5" fill="none" viewBox="0 0 24 24" strokeWidth={2} stroke="currentColor">
                  <path strokeLinecap="round" strokeLinejoin="round" d="M6 18 18 6M6 6l12 12" />
                </svg>
              </button>
            </div>

            {/* Scrollable content */}
            <div className="flex-1 overflow-y-auto p-6 space-y-4">
              {/* Summary stats row */}
              <div className={`grid gap-3 ${filteredRuns.length > 0 ? 'grid-cols-3' : 'grid-cols-2'}`}>
                <div className="rounded-xl border border-slate-200 bg-white p-3 text-center">
                  <div className="text-2xl font-bold text-indigo-600">{filteredEvalCases.length}</div>
                  <div className="text-[10px] text-slate-500 font-medium mt-0.5">Test Cases</div>
                </div>
                <div className="rounded-xl border border-slate-200 bg-white p-3 text-center">
                  <div className="text-2xl font-bold text-slate-700">
                    {selectedVersion != null ? `v${selectedVersion}` : `v${skill.version}`}
                  </div>
                  <div className="text-[10px] text-slate-500 font-medium mt-0.5">
                    {selectedVersion != null ? 'Target Version' : 'Latest Version'}
                  </div>
                </div>
                {filteredRuns.length > 0 && (
                  <div className="rounded-xl border border-amber-200 bg-amber-50/50 p-3 text-center">
                    <div className="text-2xl font-bold text-amber-600">{filteredRuns.length}</div>
                    <div className="text-[10px] text-amber-600 font-medium mt-0.5">Existing Runs</div>
                  </div>
                )}
              </div>

              {/* Test cases list */}
              {filteredEvalCases.length > 0 && (
                <div>
                  <h4 className="text-xs font-bold text-slate-700 uppercase tracking-wide mb-2">
                    Test Cases to Run
                  </h4>
                  <div className="rounded-xl border border-slate-200 divide-y divide-slate-100 max-h-48 overflow-y-auto">
                    {filteredEvalCases.slice(0, 8).map((ec) => (
                      <div key={ec.id} className="flex items-center justify-between px-3 py-2">
                        <div className="flex items-center gap-2 min-w-0">
                          <svg className="h-3.5 w-3.5 text-green-500 shrink-0" fill="none" viewBox="0 0 24 24" strokeWidth={2.5} stroke="currentColor">
                            <path strokeLinecap="round" strokeLinejoin="round" d="m4.5 12.75 6 6 9-13.5" />
                          </svg>
                          <span className="text-sm text-slate-700 truncate">{ec.name}</span>
                        </div>
                        <span className="text-[10px] text-slate-400 font-medium shrink-0 ml-2">
                          {ec.assertions.length} assertion{ec.assertions.length !== 1 ? 's' : ''}
                        </span>
                      </div>
                    ))}
                    {filteredEvalCases.length > 8 && (
                      <div className="px-3 py-2 text-center">
                        <span className="text-xs text-slate-400">
                          and {filteredEvalCases.length - 8} more…
                        </span>
                      </div>
                    )}
                  </div>
                </div>
              )}

              {/* Empty state — no test cases */}
              {filteredEvalCases.length === 0 && (
                <div className="rounded-xl bg-slate-50 border border-slate-200/60 p-4 text-center">
                  <p className="text-sm text-slate-500">No test cases to run.</p>
                  <p className="text-xs text-slate-400 mt-1">Add test cases first from the Test Cases tab.</p>
                </div>
              )}

              {/* Existing runs warning */}
              {filteredRuns.length > 0 && (
                <div className="rounded-xl bg-amber-50 border border-amber-200/60 p-3 flex items-start gap-2.5">
                  <svg className="h-4 w-4 text-amber-500 mt-0.5 shrink-0" fill="none" viewBox="0 0 24 24" strokeWidth={2} stroke="currentColor">
                    <path strokeLinecap="round" strokeLinejoin="round" d="m11.25 11.25.041-.02a.75.75 0 0 1 1.063.852l-.708 2.836a.75.75 0 0 0 1.063.853l.041-.021M21 12a9 9 0 1 1-18 0 9 9 0 0 1 18 0Zm-9-3.75h.008v.008H12V8.25Z" />
                  </svg>
                  <p className="text-xs text-amber-700 leading-relaxed">
                    You already have <strong>{filteredRuns.length} run{filteredRuns.length !== 1 ? 's' : ''}</strong>. New results will be created alongside them — useful for variance analysis across multiple runs.
                  </p>
                </div>
              )}

              {/* Baseline comparison option */}
              <div className="rounded-xl border border-slate-200 bg-slate-50/50 p-4">
                <label className="flex items-start gap-3 cursor-pointer select-none">
                  <input
                    type="checkbox"
                    checked={compareBaseline}
                    onChange={(e) => setCompareBaseline(e.target.checked)}
                    className="h-4 w-4 mt-0.5 rounded border-slate-300 text-indigo-600 focus:ring-indigo-500 cursor-pointer"
                  />
                  <div>
                    <span className="text-sm font-medium text-slate-700">Include Baseline Comparison</span>
                    <p className="text-xs text-slate-500 mt-1 leading-relaxed">
                      Run each test without the skill to measure how much the skill actually improves results. Required for discrimination analysis in Benchmark.
                    </p>
                  </div>
                </label>
              </div>
            </div>

            {/* Footer with actions */}
            <div className="flex justify-end gap-2 p-6 pt-4 border-t border-slate-100">
              <button
                onClick={() => setShowRunEvalsDialog(false)}
                className="rounded-xl px-4 py-2 text-sm font-medium text-slate-700 hover:bg-slate-100 transition-all duration-200"
              >
                Cancel
              </button>
              <button
                onClick={handleRunAll}
                disabled={filteredEvalCases.length === 0}
                className={`flex items-center gap-1.5 rounded-xl px-5 py-2 text-sm font-semibold transition-all duration-200 ${
                  filteredEvalCases.length === 0
                    ? 'bg-slate-200 text-slate-400 cursor-not-allowed'
                    : 'bg-gradient-to-r from-indigo-600 to-purple-600 text-white shadow-lg shadow-indigo-500/20 hover:shadow-xl hover:brightness-110'
                }`}
                title={filteredEvalCases.length === 0 ? 'Add test cases first' : undefined}
              >
                <svg className="h-4 w-4" fill="none" viewBox="0 0 24 24" strokeWidth={2} stroke="currentColor">
                  <path strokeLinecap="round" strokeLinejoin="round" d="M5.25 5.653c0-.856.917-1.398 1.667-.986l11.54 6.347a1.125 1.125 0 0 1 0 1.972l-11.54 6.347a1.125 1.125 0 0 1-1.667-.986V5.653Z" />
                </svg>
                Run {filteredEvalCases.length} Eval{filteredEvalCases.length !== 1 ? 's' : ''}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* ── Running overlay with real-time progress ────────────── */}
      {evalProgress.running && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-900/40 backdrop-blur-sm animate-backdrop">
          <div className="mx-4 w-full max-w-lg animate-scale-in">
            <EvalRunProgress progress={evalProgress} onCancel={cancelEvalRun} />
          </div>
        </div>
      )}

      {/* ── Case Editor Modal (create or edit) ─────────────────── */}
      {showCaseEditor && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 backdrop-blur-sm animate-backdrop" onClick={() => { setShowCaseEditor(false); setEditingCase(null); }}>
          <div
            className="mx-4 flex w-full max-w-2xl max-h-[90vh] flex-col rounded-2xl border border-slate-200/80 bg-white shadow-2xl animate-scale-in"
            onClick={(e) => e.stopPropagation()}
          >
            <EvalCaseEditor
              skillId={skill.id}
              existingCase={editingCase ?? undefined}
              onSave={async (data) => {
                if (editingCase) {
                  await updateCase(skill.id, editingCase.id, data);
                  addToast('success', 'Test case updated successfully');
                } else {
                  await createCase(skill.id, data);
                  addToast('success', 'Test case created successfully');
                }
                setShowCaseEditor(false);
                setEditingCase(null);
              }}
              onCancel={() => { setShowCaseEditor(false); setEditingCase(null); }}
            />
          </div>
        </div>
      )}

      {/* ── Delete confirmation modal ──────────────────────────── */}
      {deletingCase && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 backdrop-blur-sm animate-backdrop" onClick={() => setDeletingCase(null)}>
          <div
            className="mx-4 w-full max-w-md rounded-2xl bg-white p-6 shadow-2xl animate-scale-in"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="flex items-center gap-3 mb-4">
              <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-red-50">
                <svg className="h-5 w-5 text-red-500" fill="none" viewBox="0 0 24 24" strokeWidth={2} stroke="currentColor">
                  <path strokeLinecap="round" strokeLinejoin="round" d="m14.74 9-.346 9m-4.788 0L9.26 9m9.968-3.21c.342.052.682.107 1.022.166m-1.022-.165L18.16 19.673a2.25 2.25 0 0 1-2.244 2.077H8.084a2.25 2.25 0 0 1-2.244-2.077L4.772 5.79m14.456 0a48.108 48.108 0 0 0-3.478-.397m-12 .562c.34-.059.68-.114 1.022-.165m0 0a48.11 48.11 0 0 1 3.478-.397m7.5 0v-.916c0-1.18-.91-2.164-2.09-2.201a51.964 51.964 0 0 0-3.32 0c-1.18.037-2.09 1.022-2.09 2.201v.916m7.5 0a48.667 48.667 0 0 0-7.5 0" />
                </svg>
              </div>
              <div>
                <h3 className="text-lg font-bold text-slate-800">Delete Test Case</h3>
                <p className="text-xs text-slate-500">This action cannot be undone</p>
              </div>
            </div>
            <p className="text-sm text-slate-600 mb-5">
              Are you sure you want to delete <strong>{deletingCase.name}</strong>?
            </p>
            <div className="flex justify-end gap-2">
              <button
                onClick={() => setDeletingCase(null)}
                className="rounded-xl px-4 py-2 text-sm font-medium text-slate-700 hover:bg-slate-100 transition-all duration-200"
              >
                Cancel
              </button>
              <button
                onClick={async () => {
                  try {
                    await deleteCase(skill.id, deletingCase.id);
                    addToast('success', 'Test case deleted');
                  } catch {
                    addToast('error', 'Failed to delete test case');
                  }
                  setDeletingCase(null);
                }}
                className="rounded-xl bg-red-600 px-4 py-2 text-sm font-semibold text-white hover:bg-red-700 transition-all duration-200"
              >
                Delete
              </button>
            </div>
          </div>
        </div>
      )}

      {/* ── Generate Test Cases dialog ─────────────────────────── */}
      {showGenerateDialog && (
        <GenerateTestEvalsDialog
          skillId={skill.id}
          existingCaseCount={evalCases.length}
          generating={generating}
          onGenerate={generateTestEvals}
          onBulkSave={async (sid, cases) => {
            await bulkCreateCases(sid, cases);
            addToast('success', `${cases.length} test case${cases.length !== 1 ? 's' : ''} created`);
          }}
          onClose={() => { cancelGenerate(); setShowGenerateDialog(false); }}
        />
      )}

      {/* ── Help dialog ────────────────────────────────────────── */}
      {showEvalHelp && (
        <EvalHelpDialog onClose={() => setShowEvalHelp(false)} />
      )}
    </div>
  );
}
