import React, { useState, useEffect, useCallback, useRef } from 'react';
import type { CreateEvalCaseRequest, EvalAssertion, EvalCase, TestPromptSuggestion } from '@skillspell/shared';
import { fetchTestPromptSuggestions } from '../../services/api/index.js';
import { useDebounce } from '../../hooks/useDebounce.js';

interface EvalCaseEditorProps {
  skillId: string;
  existingCase?: EvalCase; // If editing an existing case
  onSave: (data: CreateEvalCaseRequest) => Promise<void>;
  onCancel: () => void;
}

const ASSERTION_TYPES: EvalAssertion['type'][] = [
  'contains',
  'not_contains',
  'regex',
  'semantic',
  'custom',
];

export function EvalCaseEditor({
  skillId,
  existingCase,
  onSave,
  onCancel,
}: EvalCaseEditorProps) {
  const [name, setName] = useState(existingCase?.name || '');
  const [prompt, setPrompt] = useState(existingCase?.prompt || '');
  const [expectedOutput, setExpectedOutput] = useState(
    existingCase?.expectedOutput || '',
  );
  const [context, setContext] = useState(existingCase?.context || '');
  const [assertions, setAssertions] = useState<EvalAssertion[]>(
    existingCase?.assertions || [],
  );
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // Prompt suggestions state
  const [suggestions, setSuggestions] = useState<TestPromptSuggestion[]>([]);
  const [suggestionsLoading, setSuggestionsLoading] = useState(false);
  const [suggestionsError, setSuggestionsError] = useState(false);

  // Abort controller ref for cancelling in-flight suggestion requests
  const suggestionsAbortRef = useRef<AbortController | null>(null);

  // Load suggestions (callable for manual refresh too)
  const loadSuggestions = useCallback(async (existingPrompt?: string, testCaseName?: string) => {
    // Cancel any previous in-flight request
    suggestionsAbortRef.current?.abort();
    const controller = new AbortController();
    suggestionsAbortRef.current = controller;

    setSuggestionsLoading(true);
    setSuggestionsError(false);
    try {
      const result = await fetchTestPromptSuggestions(skillId, existingPrompt, controller.signal, testCaseName);
      if (!controller.signal.aborted) {
        setSuggestions(result);
      }
    // eslint-disable-next-line @typescript-eslint/no-unused-vars
    } catch (_err) {
      if (!controller.signal.aborted) {
        setSuggestionsError(true);
      }
    } finally {
      if (!controller.signal.aborted) {
        setSuggestionsLoading(false);
      }
    }
  }, [skillId]);

  // Load suggestions on mount (only for new cases, not editing)
  useEffect(() => {
    if (!existingCase) {
      loadSuggestions();
    }
    return () => {
      suggestionsAbortRef.current?.abort();
    };
  }, [existingCase, loadSuggestions]);

  // Re-fetch suggestions when the user types a name (≥ 10 chars), using the
  // name as context — mirrors how PromptInput drives SmartSuggestions via partialInput.
  const debouncedName = useDebounce(name, 800);
  const isFirstMount = useRef(true);
  useEffect(() => {
    if (isFirstMount.current) {
      isFirstMount.current = false;
      return;
    }
    if (!existingCase && debouncedName.length >= 10) {
      loadSuggestions(undefined, debouncedName);
    }
  }, [debouncedName, existingCase, loadSuggestions]);

  const handleUseSuggestion = (suggestion: TestPromptSuggestion) => {
    setPrompt(suggestion.prompt);
    setName(suggestion.name);
    if (suggestion.expectedOutput) {
      setExpectedOutput(suggestion.expectedOutput);
    }
    if (suggestion.context) {
      setContext(suggestion.context);
    }
    if (suggestion.assertions && suggestion.assertions.length > 0) {
      setAssertions(suggestion.assertions.map((a) => ({
        type: a.type,
        value: a.value,
        description: a.description || '',
      })));
    }
  };

  const handleAddAssertion = () => {
    setAssertions([
      ...assertions,
      { type: 'contains', value: '', description: '' },
    ]);
  };

  const handleRemoveAssertion = (index: number) => {
    setAssertions(assertions.filter((_, i) => i !== index));
  };

  const handleAssertionChange = (
    index: number,
    field: keyof EvalAssertion,
    value: string,
  ) => {
    const updated = [...assertions];
    updated[index] = { ...updated[index], [field]: value };
    setAssertions(updated);
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);

    if (!name.trim() || !prompt.trim()) {
      setError('Name and prompt are required');
      return;
    }

    setSaving(true);
    try {
      await onSave({
        name: name.trim(),
        prompt: prompt.trim(),
        expectedOutput: expectedOutput.trim() || undefined,
        context: context.trim() || undefined,
        assertions: assertions.filter((a) => a.value.trim()),
      });
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to save');
    } finally {
      setSaving(false);
    }
  };

  return (
    <form onSubmit={handleSubmit} className="flex flex-col max-h-[80vh]">
      {/* Header — pinned */}
      <div className="flex shrink-0 items-center gap-3 border-b border-slate-100 px-6 pt-6 pb-4">
        <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-indigo-50">
          <svg className="h-5 w-5 text-indigo-500" fill="none" viewBox="0 0 24 24" strokeWidth={2} stroke="currentColor">
            <path strokeLinecap="round" strokeLinejoin="round" d="M11.35 3.836c-.065.21-.1.433-.1.664 0 .414.336.75.75.75h4.5a.75.75 0 0 0 .75-.75 2.25 2.25 0 0 0-.1-.664m-5.8 0A2.251 2.251 0 0 1 13.5 2.25H15a2.25 2.25 0 0 1 2.15 1.586m-5.8 0c-.376.023-.75.05-1.124.08C9.095 4.01 8.25 4.973 8.25 6.108V8.25m8.9-4.414c.376.023.75.05 1.124.08 1.131.094 1.976 1.057 1.976 2.192V16.5A2.25 2.25 0 0 1 18 18.75h-2.25m-7.5-10.5H4.875c-.621 0-1.125.504-1.125 1.125v11.25c0 .621.504 1.125 1.125 1.125h9.75c.621 0 1.125-.504 1.125-1.125V18.75m-7.5-10.5h6.375c.621 0 1.125.504 1.125 1.125v9.375m-8.25-3 1.5 1.5 3-3.75" />
          </svg>
        </div>
        <div>
          <h3 className="text-lg font-bold text-slate-800">
            {existingCase ? 'Edit Eval Case' : 'Create Eval Case'}
          </h3>
          <p className="text-xs text-slate-500">
            Define a test case to evaluate this skill&apos;s behavior
          </p>
        </div>
      </div>

      {/* Scrollable content */}
      <div className="flex-1 overflow-y-auto px-6 py-4 space-y-5">
        {/* Error message */}
        {error && (
          <div className="rounded-xl border border-red-200 bg-red-50 p-3.5 text-sm text-red-700">
            {error}
          </div>
        )}

        {/* Prompt Suggestions — only shown when creating new cases */}
        {!existingCase && (
          <div>
            <div className="flex items-center gap-2 mb-2">
              <svg className="h-4 w-4 text-amber-500" fill="none" viewBox="0 0 24 24" strokeWidth={2} stroke="currentColor">
                <path strokeLinecap="round" strokeLinejoin="round" d="M12 18v-5.25m0 0a6.01 6.01 0 0 0 1.5-.189m-1.5.189a6.01 6.01 0 0 1-1.5-.189m3.75 7.478a12.06 12.06 0 0 1-4.5 0m3.75 2.383a14.406 14.406 0 0 1-3 0M14.25 18v-.192c0-.983.658-1.823 1.508-2.316a7.5 7.5 0 1 0-7.517 0c.85.493 1.509 1.333 1.509 2.316V18" />
              </svg>
              <span className="text-sm font-semibold text-slate-700">Suggested Test Prompts</span>
              {suggestionsLoading && (
                <div className="h-3.5 w-3.5 animate-spin rounded-full border-2 border-indigo-200 border-t-indigo-500" />
              )}
              {!suggestionsLoading && suggestions.length > 0 && (
                <button
                  type="button"
                  onClick={() => loadSuggestions(prompt || undefined)}
                  className="ml-auto text-xs font-medium text-indigo-500 hover:text-indigo-700 transition-colors duration-200"
                  title="Refresh suggestions"
                >
                  <svg className="h-3.5 w-3.5" fill="none" viewBox="0 0 24 24" strokeWidth={2} stroke="currentColor">
                    <path strokeLinecap="round" strokeLinejoin="round" d="M16.023 9.348h4.992v-.001M2.985 19.644v-4.992m0 0h4.992m-4.993 0 3.181 3.183a8.25 8.25 0 0 0 13.803-3.7M4.031 9.865a8.25 8.25 0 0 1 13.803-3.7l3.181 3.182" />
                  </svg>
                </button>
              )}
            </div>

            {suggestionsLoading && suggestions.length === 0 ? (
              <div className="flex items-center gap-2 rounded-xl border border-slate-100 bg-slate-50/50 px-4 py-3">
                <div className="h-4 w-4 animate-spin rounded-full border-2 border-indigo-200 border-t-indigo-500" />
                <span className="text-xs text-slate-500">Generating suggestions based on this skill...</span>
              </div>
            ) : suggestionsError ? (
              <div className="flex items-center gap-2 rounded-xl border border-slate-100 bg-slate-50/50 px-4 py-2.5">
                <span className="text-xs text-slate-400">Could not load suggestions.</span>
                <button
                  type="button"
                  onClick={() => loadSuggestions()}
                  className="text-xs font-medium text-indigo-500 hover:text-indigo-700 transition-colors"
                >
                  Retry
                </button>
              </div>
            ) : suggestions.length > 0 ? (
              <div className="flex flex-wrap gap-2">
                {suggestions.map((suggestion, idx) => (
                  <button
                    key={idx}
                    type="button"
                    onClick={() => handleUseSuggestion(suggestion)}
                    className="group relative flex items-center gap-1.5 rounded-lg border border-indigo-100 bg-indigo-50/50 px-3 py-1.5 text-xs font-medium text-indigo-700 
                      hover:bg-indigo-100 hover:border-indigo-200 hover:shadow-sm
                      active:bg-indigo-150 transition-all duration-200"
                    title={suggestion.prompt}
                  >
                    <svg className="h-3 w-3 text-indigo-400 group-hover:text-indigo-600 transition-colors" fill="none" viewBox="0 0 24 24" strokeWidth={2} stroke="currentColor">
                      <path strokeLinecap="round" strokeLinejoin="round" d="M9.813 15.904 9 18.75l-.813-2.846a4.5 4.5 0 0 0-3.09-3.09L2.25 12l2.846-.813a4.5 4.5 0 0 0 3.09-3.09L9 5.25l.813 2.846a4.5 4.5 0 0 0 3.09 3.09L15.75 12l-2.846.813a4.5 4.5 0 0 0-3.09 3.09ZM18.259 8.715 18 9.75l-.259-1.035a3.375 3.375 0 0 0-2.455-2.456L14.25 6l1.036-.259a3.375 3.375 0 0 0 2.455-2.456L18 2.25l.259 1.035a3.375 3.375 0 0 0 2.455 2.456L21.75 6l-1.036.259a3.375 3.375 0 0 0-2.455 2.456Z" />
                    </svg>
                    {suggestion.label || suggestion.name}
                  </button>
                ))}
              </div>
            ) : null}
          </div>
        )}

        {/* Name */}
      <div>
        <label className="block text-sm font-semibold text-slate-700 mb-1.5">
          Name <span className="text-red-500">*</span>
        </label>
        <input
          type="text"
          value={name}
          onChange={(e) => setName(e.target.value)}
          placeholder="e.g., Basic greeting test"
          className="w-full rounded-xl border border-slate-200 bg-white px-4 py-2.5 text-sm text-slate-800 placeholder:text-slate-400 shadow-sm
            focus:outline-none focus:ring-2 focus:ring-indigo-500/40 focus:border-indigo-400
            hover:border-slate-300 transition-all duration-200"
        />
      </div>

      {/* Prompt */}
      <div>
        <label className="block text-sm font-semibold text-slate-700 mb-1.5">
          Test Prompt <span className="text-red-500">*</span>
        </label>
        <textarea
          value={prompt}
          onChange={(e) => setPrompt(e.target.value)}
          placeholder="Enter the prompt to test..."
          rows={4}
          className="w-full rounded-xl border border-slate-200 bg-white px-4 py-2.5 text-sm text-slate-800 placeholder:text-slate-400 shadow-sm resize-none
            focus:outline-none focus:ring-2 focus:ring-indigo-500/40 focus:border-indigo-400
            hover:border-slate-300 transition-all duration-200"
        />
      </div>

      {/* Expected Output (optional) */}
      <div>
        <label className="block text-sm font-semibold text-slate-700 mb-1.5">
          Expected Output{' '}
          <span className="text-slate-400 font-normal text-xs">(optional)</span>
        </label>
        <textarea
          value={expectedOutput}
          onChange={(e) => setExpectedOutput(e.target.value)}
          placeholder="What output do you expect?"
          rows={3}
          className="w-full rounded-xl border border-slate-200 bg-white px-4 py-2.5 text-sm text-slate-800 placeholder:text-slate-400 shadow-sm resize-none
            focus:outline-none focus:ring-2 focus:ring-indigo-500/40 focus:border-indigo-400
            hover:border-slate-300 transition-all duration-200"
        />
      </div>

      {/* Context (optional) */}
      <div>
        <label className="block text-sm font-semibold text-slate-700 mb-1.5">
          Additional Context{' '}
          <span className="text-slate-400 font-normal text-xs">(optional)</span>
        </label>
        <textarea
          value={context}
          onChange={(e) => setContext(e.target.value)}
          placeholder="Any additional context for this test..."
          rows={2}
          className="w-full rounded-xl border border-slate-200 bg-white px-4 py-2.5 text-sm text-slate-800 placeholder:text-slate-400 shadow-sm resize-none
            focus:outline-none focus:ring-2 focus:ring-indigo-500/40 focus:border-indigo-400
            hover:border-slate-300 transition-all duration-200"
        />
      </div>

      {/* Assertions */}
      <div>
        <div className="flex items-center justify-between mb-2">
          <label className="block text-sm font-semibold text-slate-700">
            Assertions
          </label>
          <button
            type="button"
            onClick={handleAddAssertion}
            className="text-sm font-medium text-indigo-600 hover:text-indigo-700 transition-colors duration-200"
          >
            + Add Assertion
          </button>
        </div>

        {assertions.length === 0 ? (
          <p className="text-sm text-slate-500 italic">
            No assertions yet. Add assertions to validate the output.
          </p>
        ) : (
          <div className="space-y-3">
            {assertions.map((assertion, index) => (
              <div key={index} className="rounded-xl border border-slate-200/80 bg-slate-50/30 p-3.5 space-y-2.5">
                <div className="flex gap-2.5">
                  <select
                    value={assertion.type}
                    onChange={(e) =>
                      handleAssertionChange(
                        index,
                        'type',
                        e.target.value as EvalAssertion['type'],
                      )
                    }
                    aria-label={`Assertion ${index + 1} type`}
                    className="rounded-xl border border-slate-200 bg-white px-3 py-2 text-sm text-slate-800 shadow-sm
                      focus:outline-none focus:ring-2 focus:ring-indigo-500/40 focus:border-indigo-400
                      hover:border-slate-300 transition-all duration-200"
                  >
                    {ASSERTION_TYPES.map((type) => (
                      <option key={type} value={type}>
                        {type}
                      </option>
                    ))}
                  </select>
                  <input
                    type="text"
                    value={assertion.value}
                    maxLength={1000}
                    onChange={(e) =>
                      handleAssertionChange(index, 'value', e.target.value)
                    }
                    placeholder={getPlaceholder(assertion.type)}
                    className="flex-1 rounded-xl border border-slate-200 bg-white px-3 py-2 text-sm text-slate-800 placeholder:text-slate-400 shadow-sm
                      focus:outline-none focus:ring-2 focus:ring-indigo-500/40 focus:border-indigo-400
                      hover:border-slate-300 transition-all duration-200"
                  />
                  <button
                    type="button"
                    onClick={() => handleRemoveAssertion(index)}
                    className="flex h-9 w-9 items-center justify-center rounded-xl text-slate-400 hover:bg-red-50 hover:text-red-500 transition-all duration-200"
                    aria-label={`Remove assertion ${index + 1}`}
                  >
                    <svg className="h-4 w-4" fill="none" viewBox="0 0 24 24" strokeWidth={2} stroke="currentColor">
                      <path strokeLinecap="round" strokeLinejoin="round" d="M6 18 18 6M6 6l12 12" />
                    </svg>
                  </button>
                </div>
                <input
                  type="text"
                  value={assertion.description || ''}
                  onChange={(e) =>
                    handleAssertionChange(
                      index,
                      'description',
                      e.target.value,
                    )
                  }
                  placeholder="Description (optional)"
                  className="w-full rounded-xl border border-slate-200 bg-white px-3 py-2 text-sm text-slate-800 placeholder:text-slate-400 shadow-sm
                    focus:outline-none focus:ring-2 focus:ring-indigo-500/40 focus:border-indigo-400
                    hover:border-slate-300 transition-all duration-200"
                />
              </div>
            ))}
          </div>
        )}
      </div>
      </div>{/* end scrollable content */}

      {/* Actions — pinned footer */}
      <div className="flex shrink-0 items-center justify-end gap-3 border-t border-slate-100 px-6 pt-4 pb-6">
        <button
          type="button"
          onClick={onCancel}
          className="rounded-xl bg-slate-100 px-4 py-2.5 text-sm font-medium text-slate-700 hover:bg-slate-200 transition-all duration-200"
        >
          Cancel
        </button>
        <button
          type="submit"
          disabled={saving}
          className={`flex items-center gap-2 rounded-xl px-5 py-2.5 text-sm font-semibold transition-all duration-200 ${
            saving
              ? 'bg-slate-200 text-slate-400 cursor-not-allowed'
              : 'bg-gradient-to-r from-indigo-600 to-purple-600 text-white shadow-lg shadow-indigo-500/20 hover:shadow-xl hover:shadow-indigo-500/30 hover:brightness-110'
          }`}
        >
          {saving ? (
            <>
              <div className="h-4 w-4 animate-spin-ease rounded-full border-2 border-slate-300 border-t-slate-500" />
              Saving...
            </>
          ) : (
            existingCase ? 'Update' : 'Create'
          )}
        </button>
      </div>
    </form>
  );
}

/* ─── Helper ─────────────────────────────────────────────────────────── */

function getPlaceholder(type: EvalAssertion['type']): string {
  switch (type) {
    case 'contains':
      return 'Text to find in output';
    case 'not_contains':
      return 'Text that should NOT appear';
    case 'regex':
      return 'Regular expression pattern';
    case 'semantic':
      return 'Expected meaning/concept';
    case 'custom':
      return 'Custom criteria';
    default:
      return 'Value';
  }
}
