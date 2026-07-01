import { useState, useRef } from 'react';
import { createPortal } from 'react-dom';
import type { TestPromptSuggestion, EvalAssertion, CreateEvalCaseRequest } from '@skillspell/shared';
import {
  useProgressMessages,
  formatElapsed,
  GENERATE_TEST_EVALS_MESSAGES,
} from '../../hooks/useProgressMessages.js';
import { InfoTip } from '../common/InfoTip.js';
import { suggestTestCaseCount, type SuggestCountBreakdown } from '../../services/api/evals.js';

const MAX_EVAL_CASES_PER_SKILL = 50;

interface GenerateTestEvalsDialogProps {
  skillId: string;
  existingCaseCount: number;
  generating: boolean;
  onGenerate: (skillId: string, count: number, coverageHint?: string) => Promise<TestPromptSuggestion[]>;
  onBulkSave: (skillId: string, cases: CreateEvalCaseRequest[]) => Promise<unknown>;
  onClose: () => void;
}

const ASSERTION_TYPES: EvalAssertion['type'][] = [
  'contains',
  'not_contains',
  'regex',
  'semantic',
  'custom',
];

type Phase = 'input' | 'loading' | 'review';

interface EditableCase {
  id: string; // local id for React keys
  name: string;
  prompt: string;
  expectedOutput: string;
  context: string;
  assertions: EvalAssertion[];
  removed: boolean;
}

function toEditableCase(s: TestPromptSuggestion, idCounter: React.MutableRefObject<number>): EditableCase {
  return {
    id: `gen-${idCounter.current++}`,
    name: s.name || '',
    prompt: s.prompt || '',
    expectedOutput: s.expectedOutput || '',
    context: s.context || '',
    assertions: (s.assertions || []).map((a) => ({
      type: a.type,
      value: a.value,
      description: a.description || '',
    })),
    removed: false,
  };
}

export function GenerateTestEvalsDialog({
  skillId,
  existingCaseCount,
  generating,
  onGenerate,
  onBulkSave,
  onClose,
}: GenerateTestEvalsDialogProps) {
  const idCounterRef = useRef(0);
  const [phase, setPhase] = useState<Phase>('input');
  const remainingSlots = Math.max(0, MAX_EVAL_CASES_PER_SKILL - existingCaseCount);
  const [count, setCount] = useState(Math.min(5, remainingSlots));
  const [cases, setCases] = useState<EditableCase[]>([]);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [expandedCase, setExpandedCase] = useState<string | null>(null);
  const [suggesting, setSuggesting] = useState(false);
  const [suggestionBreakdown, setSuggestionBreakdown] = useState<SuggestCountBreakdown | null>(null);
  const [suggestionReasoning, setSuggestionReasoning] = useState<string | null>(null);

  const activeCases = cases.filter((c) => !c.removed);

  const handleGenerate = async () => {
    setError(null);
    setPhase('loading');
    try {
      const generated = await onGenerate(skillId, count, suggestionReasoning ?? undefined);
      if (generated.length === 0) {
        setError('AI returned no test cases. Try again or reduce the count.');
        setPhase('input');
        return;
      }
      setCases(generated.map((s) => toEditableCase(s, idCounterRef)));
      setPhase('review');
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to generate test cases');
      setPhase('input');
    }
  };

  const handleSuggestCount = async () => {
    setSuggesting(true);
    setSuggestionBreakdown(null);
    setSuggestionReasoning(null);
    try {
      const result = await suggestTestCaseCount(skillId);
      setCount(Math.max(1, Math.min(remainingSlots, result.count)));
      if (result.breakdown) setSuggestionBreakdown(result.breakdown);
      if (result.reasoning) setSuggestionReasoning(result.reasoning);
    } catch {
      // silently ignore — user can still manually set count
    } finally {
      setSuggesting(false);
    }
  };

  const handleRemoveCase = (id: string) => {
    setCases((prev) =>
      prev.map((c) => (c.id === id ? { ...c, removed: true } : c)),
    );
  };

  const handleRestoreCase = (id: string) => {
    setCases((prev) =>
      prev.map((c) => (c.id === id ? { ...c, removed: false } : c)),
    );
  };

  const handleCaseChange = (
    id: string,
    field: keyof EditableCase,
    value: string,
  ) => {
    setCases((prev) =>
      prev.map((c) => (c.id === id ? { ...c, [field]: value } : c)),
    );
  };

  const handleAssertionChange = (
    caseId: string,
    index: number,
    field: keyof EvalAssertion,
    value: string,
  ) => {
    setCases((prev) =>
      prev.map((c) => {
        if (c.id !== caseId) return c;
        const updated = [...c.assertions];
        updated[index] = { ...updated[index], [field]: value };
        return { ...c, assertions: updated };
      }),
    );
  };

  const handleAddAssertion = (caseId: string) => {
    setCases((prev) =>
      prev.map((c) => {
        if (c.id !== caseId) return c;
        return {
          ...c,
          assertions: [
            ...c.assertions,
            { type: 'contains' as const, value: '', description: '' },
          ],
        };
      }),
    );
  };

  const handleRemoveAssertion = (caseId: string, index: number) => {
    setCases((prev) =>
      prev.map((c) => {
        if (c.id !== caseId) return c;
        return {
          ...c,
          assertions: c.assertions.filter((_, i) => i !== index),
        };
      }),
    );
  };

  const handleSaveAll = async () => {
    setSaving(true);
    setError(null);
    try {
      const toSave: CreateEvalCaseRequest[] = activeCases
        .filter((c) => c.name.trim() && c.prompt.trim())
        .map((c) => ({
          name: c.name.trim(),
          prompt: c.prompt.trim(),
          expectedOutput: c.expectedOutput.trim() || undefined,
          context: c.context.trim() || undefined,
          assertions: c.assertions.filter((a) => a.value.trim()),
        }));

      if (toSave.length === 0) {
        setError('No valid test cases to save. Each case needs a name and prompt.');
        setSaving(false);
        return;
      }

      await onBulkSave(skillId, toSave);
      onClose();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to save test cases');
    } finally {
      setSaving(false);
    }
  };

  const toggleExpand = (id: string) => {
    setExpandedCase((prev) => (prev === id ? null : id));
  };

  return createPortal(
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 backdrop-blur-sm animate-backdrop"
      onClick={onClose}
    >
      <div
        role="dialog"
        aria-modal="true"
        className="mx-4 flex w-full max-w-3xl max-h-[90vh] flex-col rounded-2xl border border-slate-200/80 bg-white shadow-2xl animate-scale-in"
        onClick={(e) => e.stopPropagation()}
      >
        {/* Header */}
        <div className="flex shrink-0 items-center gap-3 border-b border-slate-100 px-6 pt-6 pb-4">
          <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-purple-50">
            <svg className="h-5 w-5 text-purple-500" fill="none" viewBox="0 0 24 24" strokeWidth={2} stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" d="M9.813 15.904 9 18.75l-.813-2.846a4.5 4.5 0 0 0-3.09-3.09L2.25 12l2.846-.813a4.5 4.5 0 0 0 3.09-3.09L9 5.25l.813 2.846a4.5 4.5 0 0 0 3.09 3.09L15.75 12l-2.846.813a4.5 4.5 0 0 0-3.09 3.09ZM18.259 8.715 18 9.75l-.259-1.035a3.375 3.375 0 0 0-2.455-2.456L14.25 6l1.036-.259a3.375 3.375 0 0 0 2.455-2.456L18 2.25l.259 1.035a3.375 3.375 0 0 0 2.455 2.456L21.75 6l-1.036.259a3.375 3.375 0 0 0-2.455 2.456Z" />
            </svg>
          </div>
          <div>
            <h3 className="text-lg font-bold text-slate-800">
              {phase === 'review' ? 'Review Generated Test Cases' : 'Generate Test Cases'}
            </h3>
            <p className="text-xs text-slate-500 flex items-center gap-1">
              {phase === 'review'
                ? `${activeCases.length} of ${cases.length} cases selected — edit, remove, or save`
                : (
                  <>
                    AI analyzes your skill first, then generates targeted test cases
                    <InfoTip
                      text="Smart test generation works in two steps: First, AI analyzes your skill to identify key behaviors, edge cases, constraints, and weak areas. Then it uses this analysis — plus any prior eval failures — to generate targeted, high-quality test cases instead of generic ones. This means your tests will specifically cover what matters most for your skill."
                      size="h-3.5 w-3.5"
                    />
                  </>
                )}
            </p>
          </div>
        </div>

        {/* Content */}
        <div className="flex-1 overflow-y-auto px-6 py-4">
          {error && (
            <div className="rounded-xl border border-red-200 bg-red-50 p-3.5 text-sm text-red-700 mb-4">
              {error}
            </div>
          )}

          {/* Phase 1: Count Input */}
          {phase === 'input' && (
            <div className="flex flex-col items-center gap-5 py-8">
              <div className="flex h-16 w-16 items-center justify-center rounded-2xl bg-purple-50">
                <svg className="h-8 w-8 text-purple-400" fill="none" viewBox="0 0 24 24" strokeWidth={1.5} stroke="currentColor">
                  <path strokeLinecap="round" strokeLinejoin="round" d="M9.75 3.104v5.714a2.25 2.25 0 0 1-.659 1.591L5 14.5M9.75 3.104c-.251.023-.501.05-.75.082m.75-.082a24.301 24.301 0 0 1 4.5 0m0 0v5.714c0 .597.237 1.17.659 1.591L19.8 15.3M14.25 3.104c.251.023.501.05.75.082M19.8 15.3l-1.57.393A9.065 9.065 0 0 1 12 15a9.065 9.065 0 0 0-6.23.693L5 14.5m14.8.8 1.402 1.402c1.232 1.232.65 3.318-1.067 3.611l-.772.13c-1.687.282-3.41.395-5.13.334l-.213-.01a8.86 8.86 0 0 1-2.89-.614L5 18.5" />
                </svg>
              </div>
              <div className="text-center max-w-sm">
                <p className="text-sm text-slate-600 leading-relaxed">
                  AI first analyzes your skill to identify key behaviors, edge cases, and weak areas —
                  then generates targeted test cases that cover what matters most. Prior eval failures
                  are used to focus on known problem areas.
                </p>
              </div>
              <div className="flex items-center gap-3">
                <label htmlFor="gen-count" className="text-sm font-medium text-slate-700">
                  Number of test cases:
                </label>
                <input
                  id="gen-count"
                  type="number"
                  min={1}
                  max={remainingSlots}
                  value={count}
                  disabled={suggesting}
                  onChange={(e) => {
                    setCount(Math.max(1, Math.min(remainingSlots, parseInt(e.target.value) || 1)));
                    setSuggestionBreakdown(null);
                    setSuggestionReasoning(null);
                  }}
                  className="w-20 rounded-xl border border-slate-200 bg-white px-3 py-2 text-sm text-center text-slate-800 shadow-sm
                    focus:outline-none focus:ring-2 focus:ring-purple-500/40 focus:border-purple-400
                    hover:border-slate-300 transition-all duration-200 disabled:opacity-50 disabled:cursor-not-allowed"
                />
                <button
                  type="button"
                  onClick={handleSuggestCount}
                  disabled={suggesting || remainingSlots === 0}
                  className={`flex items-center gap-1.5 rounded-xl border px-3 py-2 text-xs font-medium transition-all duration-200 ${
                    suggesting || remainingSlots === 0
                      ? 'border-slate-200 bg-slate-50 text-slate-400 cursor-not-allowed'
                      : 'border-purple-200 bg-purple-50 text-purple-700 hover:bg-purple-100 hover:border-purple-300'
                  }`}
                >
                  {suggesting ? (
                    <>
                      <div className="h-3 w-3 animate-spin rounded-full border-2 border-purple-300 border-t-purple-600" />
                      Thinking…
                    </>
                  ) : (
                    <>
                      <svg className="h-3 w-3" fill="none" viewBox="0 0 24 24" strokeWidth={2} stroke="currentColor">
                        <path strokeLinecap="round" strokeLinejoin="round" d="M9.813 15.904 9 18.75l-.813-2.846a4.5 4.5 0 0 0-3.09-3.09L2.25 12l2.846-.813a4.5 4.5 0 0 0 3.09-3.09L9 5.25l.813 2.846a4.5 4.5 0 0 0 3.09 3.09L15.75 12l-2.846.813a4.5 4.5 0 0 0-3.09 3.09Z" />
                      </svg>
                      AI Suggest
                    </>
                  )}
                </button>
              </div>
              {(suggestionBreakdown || suggestionReasoning) && (
                <div className="flex flex-col items-center gap-2 max-w-sm">
                  {suggestionBreakdown && (
                    <div className="flex flex-wrap justify-center gap-1.5">
                      {[
                        { label: 'core', value: suggestionBreakdown.coreBehaviors },
                        { label: 'edge cases', value: suggestionBreakdown.edgeCasesAndErrors },
                        { label: 'ref docs', value: suggestionBreakdown.referenceFileScenarios },
                        { label: 'scripts', value: suggestionBreakdown.scriptPathScenarios },
                      ].filter((c) => c.value > 0).map((c) => (
                        <span key={c.label} className="rounded-full bg-purple-100 px-2.5 py-1 text-xs font-medium text-purple-700">
                          {c.value} {c.label}
                        </span>
                      ))}
                    </div>
                  )}
                  {suggestionReasoning && (
                    <p className="text-xs text-purple-600/80 text-center leading-relaxed">
                      {suggestionReasoning}
                    </p>
                  )}
                </div>
              )}
              {remainingSlots === 0 && (
                <p className="text-xs text-red-600 bg-red-50 rounded-lg px-3 py-2">
                  This skill has reached the maximum of {MAX_EVAL_CASES_PER_SKILL} test cases. Please delete some existing cases before generating new ones.
                </p>
              )}
              {remainingSlots > 0 && remainingSlots < MAX_EVAL_CASES_PER_SKILL && (
                <p className="text-xs text-slate-500 bg-slate-50 rounded-lg px-3 py-2">
                  This skill has {existingCaseCount} of {MAX_EVAL_CASES_PER_SKILL} test cases. You can generate up to {remainingSlots} more.
                </p>
              )}
              {count > 20 && (
                <p className="text-xs text-amber-600 bg-amber-50 rounded-lg px-3 py-2">
                  Large counts (&gt;20) will be generated in batches. This may take a minute.
                </p>
              )}
            </div>
          )}

          {/* Phase: Loading — animated progress */}
          {phase === 'loading' && (
            <GenerateLoadingView count={count} />
          )}

          {/* Phase 2: Review & Edit */}
          {phase === 'review' && (
            <div className="space-y-3">
              {cases.map((c) => (
                <div
                  key={c.id}
                  className={`rounded-xl border transition-all duration-200 ${
                    c.removed
                      ? 'border-slate-200/50 bg-slate-50/50 opacity-50'
                      : 'border-slate-200 bg-white hover:border-slate-300'
                  }`}
                >
                  {/* Case header — always visible */}
                  <div className="flex items-center gap-3 px-4 py-3">
                    <button
                      type="button"
                      onClick={() => toggleExpand(c.id)}
                      className="flex-1 flex items-center gap-2 min-w-0 text-left"
                      disabled={c.removed}
                    >
                      <svg
                        className={`h-4 w-4 shrink-0 text-slate-400 transition-transform duration-200 ${
                          expandedCase === c.id ? 'rotate-90' : ''
                        }`}
                        fill="none" viewBox="0 0 24 24" strokeWidth={2} stroke="currentColor"
                      >
                        <path strokeLinecap="round" strokeLinejoin="round" d="m8.25 4.5 7.5 7.5-7.5 7.5" />
                      </svg>
                      <span className="text-sm font-medium text-slate-800 truncate">
                        {c.name || 'Untitled Case'}
                      </span>
                      {c.assertions.length > 0 && (
                        <span className="shrink-0 rounded-full bg-slate-100 px-2 py-0.5 text-[10px] font-medium text-slate-500">
                          {c.assertions.length} assertion{c.assertions.length !== 1 ? 's' : ''}
                        </span>
                      )}
                    </button>
                    {c.removed ? (
                      <button
                        type="button"
                        onClick={() => handleRestoreCase(c.id)}
                        className="shrink-0 rounded-lg px-2.5 py-1 text-xs font-medium text-indigo-600 hover:bg-indigo-50 transition-colors"
                      >
                        Restore
                      </button>
                    ) : (
                      <button
                        type="button"
                        onClick={() => handleRemoveCase(c.id)}
                        className="shrink-0 rounded-lg p-1.5 text-slate-400 hover:bg-red-50 hover:text-red-500 transition-colors"
                        title="Remove this case"
                      >
                        <svg className="h-4 w-4" fill="none" viewBox="0 0 24 24" strokeWidth={2} stroke="currentColor">
                          <path strokeLinecap="round" strokeLinejoin="round" d="M6 18 18 6M6 6l12 12" />
                        </svg>
                      </button>
                    )}
                  </div>

                  {/* Expanded edit form */}
                  {expandedCase === c.id && !c.removed && (
                    <div className="border-t border-slate-100 px-4 py-3 space-y-3">
                      {/* Name */}
                      <div>
                        <label htmlFor={`name-${c.id}`} className="block text-xs font-medium text-slate-600 mb-1">Name</label>
                        <input
                          id={`name-${c.id}`}
                          type="text"
                          value={c.name}
                          onChange={(e) => handleCaseChange(c.id, 'name', e.target.value)}
                          placeholder="Test case name"
                          className="w-full rounded-lg border border-slate-200 bg-white px-3 py-2 text-sm text-slate-800 placeholder:text-slate-400
                            focus:outline-none focus:ring-2 focus:ring-purple-500/40 focus:border-purple-400 transition-all duration-200"
                        />
                      </div>
                      {/* Prompt */}
                      <div>
                        <label htmlFor={`prompt-${c.id}`} className="block text-xs font-medium text-slate-600 mb-1">Prompt</label>
                        <textarea
                          id={`prompt-${c.id}`}
                          value={c.prompt}
                          onChange={(e) => handleCaseChange(c.id, 'prompt', e.target.value)}
                          placeholder="Test prompt"
                          rows={3}
                          className="w-full rounded-lg border border-slate-200 bg-white px-3 py-2 text-sm text-slate-800 placeholder:text-slate-400 resize-none
                            focus:outline-none focus:ring-2 focus:ring-purple-500/40 focus:border-purple-400 transition-all duration-200"
                        />
                      </div>
                      {/* Expected Output */}
                      <div>
                        <label htmlFor={`expected-${c.id}`} className="block text-xs font-medium text-slate-600 mb-1">
                          Expected Output <span className="text-slate-400 font-normal">(optional)</span>
                        </label>
                        <textarea
                          id={`expected-${c.id}`}
                          value={c.expectedOutput}
                          onChange={(e) => handleCaseChange(c.id, 'expectedOutput', e.target.value)}
                          placeholder="Expected output"
                          rows={2}
                          className="w-full rounded-lg border border-slate-200 bg-white px-3 py-2 text-sm text-slate-800 placeholder:text-slate-400 resize-none
                            focus:outline-none focus:ring-2 focus:ring-purple-500/40 focus:border-purple-400 transition-all duration-200"
                        />
                      </div>
                      {/* Context */}
                      <div>
                        <label htmlFor={`context-${c.id}`} className="block text-xs font-medium text-slate-600 mb-1">
                          Context <span className="text-slate-400 font-normal">(optional)</span>
                        </label>
                        <textarea
                          id={`context-${c.id}`}
                          value={c.context}
                          onChange={(e) => handleCaseChange(c.id, 'context', e.target.value)}
                          placeholder="Additional context"
                          rows={2}
                          className="w-full rounded-lg border border-slate-200 bg-white px-3 py-2 text-sm text-slate-800 placeholder:text-slate-400 resize-none
                            focus:outline-none focus:ring-2 focus:ring-purple-500/40 focus:border-purple-400 transition-all duration-200"
                        />
                      </div>
                      {/* Assertions */}
                      <div>
                        <div className="flex items-center justify-between mb-2">
                          <label className="text-xs font-medium text-slate-600">Assertions</label>
                          <button
                            type="button"
                            onClick={() => handleAddAssertion(c.id)}
                            className="text-xs font-medium text-purple-600 hover:text-purple-700 transition-colors"
                          >
                            + Add
                          </button>
                        </div>
                        {c.assertions.length === 0 ? (
                          <p className="text-xs text-slate-400 italic">No assertions</p>
                        ) : (
                          <div className="space-y-2">
                            {c.assertions.map((assertion, idx) => (
                              <div key={idx} className="flex gap-2 items-start">
                                <select
                                  value={assertion.type}
                                  onChange={(e) => handleAssertionChange(c.id, idx, 'type', e.target.value)}
                                  aria-label={`Assertion ${idx + 1} type`}
                                  className="rounded-lg border border-slate-200 bg-white px-2 py-1.5 text-xs text-slate-800
                                    focus:outline-none focus:ring-2 focus:ring-purple-500/40 transition-all duration-200"
                                >
                                  {ASSERTION_TYPES.map((t) => (
                                    <option key={t} value={t}>{t}</option>
                                  ))}
                                </select>
                                <input
                                  type="text"
                                  value={assertion.value}
                                  maxLength={1000}
                                  onChange={(e) => handleAssertionChange(c.id, idx, 'value', e.target.value)}
                                  placeholder="Value"
                                  className="flex-1 rounded-lg border border-slate-200 bg-white px-2 py-1.5 text-xs text-slate-800 placeholder:text-slate-400
                                    focus:outline-none focus:ring-2 focus:ring-purple-500/40 transition-all duration-200"
                                />
                                <button
                                  type="button"
                                  onClick={() => handleRemoveAssertion(c.id, idx)}
                                  className="shrink-0 rounded-lg p-1 text-slate-400 hover:bg-red-50 hover:text-red-500 transition-colors"
                                  aria-label={`Remove assertion ${idx + 1}`}
                                >
                                  <svg className="h-3.5 w-3.5" fill="none" viewBox="0 0 24 24" strokeWidth={2} stroke="currentColor">
                                    <path strokeLinecap="round" strokeLinejoin="round" d="M6 18 18 6M6 6l12 12" />
                                  </svg>
                                </button>
                              </div>
                            ))}
                          </div>
                        )}
                      </div>
                    </div>
                  )}
                </div>
              ))}
            </div>
          )}
        </div>

        {/* Footer */}
        <div className="flex shrink-0 items-center justify-between border-t border-slate-100 px-6 pt-4 pb-6">
          <div className="text-xs text-slate-400">
            {phase === 'review' && (
              <span>
                {activeCases.length} case{activeCases.length !== 1 ? 's' : ''} will be saved
                {cases.length - activeCases.length > 0 && (
                  <span className="text-slate-300"> · {cases.length - activeCases.length} removed</span>
                )}
              </span>
            )}
          </div>
          <div className="flex items-center gap-3">
            <button
              type="button"
              onClick={onClose}
              className="rounded-xl bg-slate-100 px-4 py-2.5 text-sm font-medium text-slate-700 hover:bg-slate-200 transition-all duration-200"
            >
              Cancel
            </button>
            {phase === 'input' && (
              <button
                type="button"
                onClick={handleGenerate}
                disabled={generating || suggesting || count < 1 || remainingSlots === 0}
                className={`flex items-center gap-2 rounded-xl px-5 py-2.5 text-sm font-semibold transition-all duration-200 ${
                  generating || suggesting || count < 1
                    ? 'bg-slate-200 text-slate-400 cursor-not-allowed'
                    : 'bg-gradient-to-r from-purple-600 to-indigo-600 text-white shadow-lg shadow-purple-500/20 hover:shadow-xl hover:brightness-110'
                }`}
              >
                <svg className="h-4 w-4" fill="none" viewBox="0 0 24 24" strokeWidth={2} stroke="currentColor">
                  <path strokeLinecap="round" strokeLinejoin="round" d="M9.813 15.904 9 18.75l-.813-2.846a4.5 4.5 0 0 0-3.09-3.09L2.25 12l2.846-.813a4.5 4.5 0 0 0 3.09-3.09L9 5.25l.813 2.846a4.5 4.5 0 0 0 3.09 3.09L15.75 12l-2.846.813a4.5 4.5 0 0 0-3.09 3.09ZM18.259 8.715 18 9.75l-.259-1.035a3.375 3.375 0 0 0-2.455-2.456L14.25 6l1.036-.259a3.375 3.375 0 0 0 2.455-2.456L18 2.25l.259 1.035a3.375 3.375 0 0 0 2.455 2.456L21.75 6l-1.036.259a3.375 3.375 0 0 0-2.455 2.456Z" />
                </svg>
                Generate {count} Case{count !== 1 ? 's' : ''}
              </button>
            )}
            {phase === 'review' && (
              <button
                type="button"
                onClick={handleSaveAll}
                disabled={saving || activeCases.length === 0}
                className={`flex items-center gap-2 rounded-xl px-5 py-2.5 text-sm font-semibold transition-all duration-200 ${
                  saving || activeCases.length === 0
                    ? 'bg-slate-200 text-slate-400 cursor-not-allowed'
                    : 'bg-gradient-to-r from-indigo-600 to-purple-600 text-white shadow-lg shadow-indigo-500/20 hover:shadow-xl hover:brightness-110'
                }`}
              >
                {saving ? (
                  <>
                    <div className="h-4 w-4 animate-spin rounded-full border-2 border-slate-300 border-t-slate-500" />
                    Saving…
                  </>
                ) : (
                  <>
                    <svg className="h-4 w-4" fill="none" viewBox="0 0 24 24" strokeWidth={2} stroke="currentColor">
                      <path strokeLinecap="round" strokeLinejoin="round" d="m4.5 12.75 6 6 9-13.5" />
                    </svg>
                    Save {activeCases.length} Case{activeCases.length !== 1 ? 's' : ''}
                  </>
                )}
              </button>
            )}
          </div>
        </div>
      </div>
    </div>,
    document.body,
  );
}

// ── Loading sub-component (extracted for hook usage) ────────────────

function GenerateLoadingView({ count }: { count: number }) {
  const { currentMessage, progress, elapsed } = useProgressMessages({
    messages: GENERATE_TEST_EVALS_MESSAGES,
    interval: 4000,
    active: true,
  });

  const showElapsed = elapsed >= 6;

  return (
    <div className="flex flex-col items-center gap-5 py-12">
      <div className="relative">
        <div className="absolute -inset-4 rounded-full bg-purple-500/10 blur-xl animate-pulse" />
        <div className="relative h-12 w-12 rounded-xl bg-gradient-to-br from-purple-500 to-indigo-600 shadow-xl shadow-purple-500/25 animate-pulse-glow flex items-center justify-center">
          <div className="absolute inset-0 rounded-xl border-2 border-white/20" />
          <svg
            className="h-6 w-6 text-white animate-spin-ease"
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
      <div className="relative h-14 flex flex-col items-center justify-start overflow-hidden">
        <div key={currentMessage.text} className="flex flex-col items-center animate-fade-in-up">
          <h4 className="text-base font-semibold text-slate-800 flex items-center gap-2">
            {currentMessage.emoji && <span>{currentMessage.emoji}</span>}
            {currentMessage.text}
          </h4>
          {currentMessage.detail && (
            <p className="mt-1 text-sm text-slate-500 text-center leading-relaxed">
              {currentMessage.detail}
            </p>
          )}
        </div>
      </div>

      {/* Progress bar */}
      <div className="w-48">
        <div className="h-1.5 w-full rounded-full bg-slate-100 overflow-hidden">
          <div
            className="h-full rounded-full bg-gradient-to-r from-purple-500 to-indigo-500 transition-all duration-1000 ease-out"
            style={{ width: `${Math.max(5, progress * 90 + 5)}%` }}
          />
        </div>
      </div>

      {/* Count info + elapsed */}
      <div className="flex items-center gap-3">
        <p className="text-xs text-slate-400">
          {count > 20
            ? `Generating ${count} cases in batches`
            : `Creating ${count} test case${count !== 1 ? 's' : ''}`}
        </p>
        {showElapsed && (
          <span className="text-xs text-slate-400 font-medium tabular-nums">
            · {formatElapsed(elapsed)}
          </span>
        )}
      </div>
    </div>
  );
}
