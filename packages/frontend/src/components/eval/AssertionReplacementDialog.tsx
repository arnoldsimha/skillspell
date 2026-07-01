import { useState } from 'react';
import { createPortal } from 'react-dom';
import type { AssertionReplacementSuggestion } from '@skillspell/shared';

interface AssertionReplacementDialogProps {
  suggestions: AssertionReplacementSuggestion[];
  onApply: (accepted: AssertionReplacementSuggestion[]) => void;
  onClose: () => void;
  isApplying?: boolean;
  /** When true, show a loading spinner instead of suggestions. Dialog cannot be closed. */
  isLoading?: boolean;
  /** Custom loading message shown when isLoading is true */
  loadingMessage?: string;
}

/**
 * Modal dialog for reviewing AI-suggested assertion replacements.
 * Shows original → replacement pairs with accept/reject toggles per suggestion.
 */
export function AssertionReplacementDialog({
  suggestions,
  onApply,
  onClose,
  isApplying = false,
  isLoading = false,
  loadingMessage,
}: AssertionReplacementDialogProps) {
  // Track which suggestions are accepted (all accepted by default)
  const [accepted, setAccepted] = useState<Set<number>>(
    () => new Set(suggestions.map((_, i) => i)),
  );

  const toggleAccepted = (index: number) => {
    setAccepted((prev) => {
      const next = new Set(prev);
      if (next.has(index)) next.delete(index);
      else next.add(index);
      return next;
    });
  };

  const acceptedCount = accepted.size;

  const handleApply = () => {
    const acceptedSuggestions = suggestions.filter((_, i) => accepted.has(i));
    onApply(acceptedSuggestions);
  };

  return createPortal(
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 backdrop-blur-sm animate-backdrop"
      onClick={isLoading ? undefined : onClose}
    >
      <div
        role="dialog"
        aria-modal="true"
        className="mx-4 flex w-full max-w-3xl max-h-[85vh] flex-col rounded-2xl border border-slate-200/80 bg-white shadow-2xl animate-scale-in"
        onClick={(e) => e.stopPropagation()}
      >
        {/* Header */}
        <div className="flex shrink-0 items-center justify-between border-b border-slate-100 px-6 pt-6 pb-4">
          <div className="flex items-center gap-3">
            <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-indigo-50">
              <svg
                className="h-5 w-5 text-indigo-600"
                fill="none"
                viewBox="0 0 24 24"
                strokeWidth={2}
                stroke="currentColor"
              >
                <path
                  strokeLinecap="round"
                  strokeLinejoin="round"
                  d="M9.813 15.904 9 18.75l-.813-2.846a4.5 4.5 0 0 0-3.09-3.09L2.25 12l2.846-.813a4.5 4.5 0 0 0 3.09-3.09L9 5.25l.813 2.846a4.5 4.5 0 0 0 3.09 3.09L15.75 12l-2.846.813a4.5 4.5 0 0 0-3.09 3.09ZM18.259 8.715 18 9.75l-.259-1.035a3.375 3.375 0 0 0-2.455-2.456L14.25 6l1.036-.259a3.375 3.375 0 0 0 2.455-2.456L18 2.25l.259 1.035a3.375 3.375 0 0 0 2.455 2.456L21.75 6l-1.036.259a3.375 3.375 0 0 0-2.455 2.456ZM16.894 20.567 16.5 21.75l-.394-1.183a2.25 2.25 0 0 0-1.423-1.423L13.5 18.75l1.183-.394a2.25 2.25 0 0 0 1.423-1.423l.394-1.183.394 1.183a2.25 2.25 0 0 0 1.423 1.423l1.183.394-1.183.394a2.25 2.25 0 0 0-1.423 1.423Z"
                />
              </svg>
            </div>
            <div>
              <h3 className="text-lg font-bold text-slate-800">
                AI-Suggested Assertion Replacements
              </h3>
              {!isLoading && suggestions.length > 0 && (
                <p className="text-xs text-slate-500">
                  {suggestions.length} replacement{suggestions.length !== 1 ? 's' : ''} suggested · {acceptedCount} accepted
                </p>
              )}
            </div>
          </div>
          {!isLoading && (
            <button
              onClick={onClose}
              disabled={isApplying}
              className="rounded-xl p-2 text-slate-400 hover:bg-slate-100 hover:text-slate-700 transition-all duration-200 disabled:opacity-50"
              aria-label="Close dialog"
            >
              <svg className="h-5 w-5" fill="none" viewBox="0 0 24 24" strokeWidth={2} stroke="currentColor">
                <path strokeLinecap="round" strokeLinejoin="round" d="M6 18L18 6M6 6l12 12" />
              </svg>
            </button>
          )}
        </div>

        {/* Scrollable suggestion list */}
        <div className="flex-1 overflow-y-auto px-6 py-4 space-y-4">
          {isLoading ? (
            <div className="flex flex-col items-center justify-center py-16 text-slate-400 gap-4">
              <div className="h-8 w-8 animate-spin rounded-full border-3 border-indigo-200 border-t-indigo-600" />
              <div className="text-center">
                <p className="text-sm font-medium text-slate-600">{loadingMessage ?? 'Analyzing non-discriminating assertions…'}</p>
                <p className="text-xs mt-1 text-slate-400">
                  {loadingMessage
                    ? 'Please wait while the eval runs complete.'
                    : 'The AI is examining your skill and suggesting better assertions. This may take a moment.'}
                </p>
              </div>
            </div>
          ) : suggestions.length === 0 ? (
            <div className="flex flex-col items-center justify-center py-12 text-slate-400">
              <p className="text-sm font-medium">No suggestions available</p>
              <p className="text-xs mt-1">The AI could not generate replacement suggestions for these assertions.</p>
            </div>
          ) : (
            suggestions.map((suggestion, i) => (
              <SuggestionCard
                key={i}
                suggestion={suggestion}
                isAccepted={accepted.has(i)}
                onToggle={() => toggleAccepted(i)}
                disabled={isApplying}
              />
            ))
          )}
        </div>

        {/* Footer — hidden while loading */}
        {!isLoading && (
        <div className="shrink-0 border-t border-slate-100 px-6 py-4 flex items-center justify-between gap-3">
          <div className="flex items-center gap-2">
            <button
              onClick={() => setAccepted(new Set(suggestions.map((_, i) => i)))}
              disabled={isApplying || acceptedCount === suggestions.length}
              className="text-xs text-indigo-600 hover:text-indigo-700 font-medium disabled:opacity-40 disabled:cursor-not-allowed"
            >
              Accept all
            </button>
            <span className="text-slate-300">·</span>
            <button
              onClick={() => setAccepted(new Set())}
              disabled={isApplying || acceptedCount === 0}
              className="text-xs text-slate-500 hover:text-slate-700 font-medium disabled:opacity-40 disabled:cursor-not-allowed"
            >
              Reject all
            </button>
          </div>
          <div className="flex items-center gap-2">
            <button
              onClick={onClose}
              disabled={isApplying}
              className="rounded-xl px-4 py-2.5 text-sm font-semibold text-slate-600 bg-slate-100 hover:bg-slate-200 transition-all duration-200 disabled:opacity-50"
            >
              Cancel
            </button>
            <button
              onClick={handleApply}
              disabled={isApplying || acceptedCount === 0}
              className={`rounded-xl px-4 py-2.5 text-sm font-semibold transition-all duration-200 ${
                acceptedCount === 0 || isApplying
                  ? 'bg-slate-100 text-slate-400 cursor-not-allowed'
                  : 'bg-gradient-to-r from-indigo-600 to-purple-600 text-white shadow-lg shadow-indigo-500/20 hover:shadow-xl hover:brightness-110'
              }`}
            >
              {isApplying ? (
                <span className="flex items-center gap-1.5">
                  <span className="h-3 w-3 animate-spin rounded-full border-2 border-white/30 border-t-white" />
                  Applying…
                </span>
              ) : (
                `Apply ${acceptedCount} replacement${acceptedCount !== 1 ? 's' : ''} & run evals`
              )}
            </button>
          </div>
        </div>
        )}
      </div>
    </div>,
    document.body,
  );
}

/* ─── Sub-components ──────────────────────────────────────────────── */

function SuggestionCard({
  suggestion,
  isAccepted,
  onToggle,
  disabled,
}: {
  suggestion: AssertionReplacementSuggestion;
  isAccepted: boolean;
  onToggle: () => void;
  disabled: boolean;
}) {
  const borderColor = isAccepted
    ? 'border-indigo-200 bg-indigo-50/30'
    : 'border-slate-200 bg-slate-50/30 opacity-60';

  return (
    <div className={`rounded-xl border ${borderColor} p-4 transition-all duration-200`}>
      {/* Toggle + compact header */}
      <div className="flex items-start gap-3">
        <button
          onClick={onToggle}
          disabled={disabled}
          className={`mt-1 flex h-5 w-5 shrink-0 items-center justify-center rounded-md border-2 transition-all ${
            isAccepted
              ? 'bg-indigo-600 border-indigo-600 text-white'
              : 'border-slate-300 bg-white hover:border-indigo-400'
          } ${disabled ? 'cursor-not-allowed opacity-50' : 'cursor-pointer'}`}
          aria-label={isAccepted ? 'Reject this replacement' : 'Accept this replacement'}
        >
          {isAccepted && (
            <svg className="h-3 w-3" fill="none" viewBox="0 0 24 24" strokeWidth={3} stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" d="m4.5 12.75 6 6 9-13.5" />
            </svg>
          )}
        </button>

        <div className="flex-1 min-w-0 space-y-3">
          {/* Original assertion */}
          <div>
            <div className="flex items-center gap-1.5 mb-1">
              <span className="text-[10px] font-bold text-red-500 uppercase tracking-wider">Original</span>
              <span className="inline-flex items-center px-1.5 py-0.5 rounded text-[9px] font-mono bg-slate-100 text-slate-500">
                {suggestion.original.assertionType}
              </span>
            </div>
            <p className="text-sm text-slate-600 font-mono bg-red-50/50 px-2 py-1 rounded-lg border border-red-100 whitespace-pre-wrap break-words" title={suggestion.original.assertionValue}>
              {suggestion.original.assertionValue}
            </p>
          </div>

          {/* Arrow */}
          <div className="flex items-center gap-2 text-slate-400">
            <svg className="h-4 w-4" fill="none" viewBox="0 0 24 24" strokeWidth={2} stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" d="M19.5 13.5 12 21m0 0-7.5-7.5M12 21V3" />
            </svg>
            <span className="text-[10px] font-medium">Replace with</span>
          </div>

          {/* Replacement assertion */}
          <div>
            <div className="flex items-center gap-1.5 mb-1">
              <span className="text-[10px] font-bold text-emerald-600 uppercase tracking-wider">Replacement</span>
              <span className="inline-flex items-center px-1.5 py-0.5 rounded text-[9px] font-mono bg-emerald-50 text-emerald-600">
                {suggestion.replacement.type}
              </span>
            </div>
            <p className="text-sm text-slate-700 font-mono bg-emerald-50/50 px-2 py-1 rounded-lg border border-emerald-100 whitespace-pre-wrap break-words" title={suggestion.replacement.value}>
              {suggestion.replacement.value}
            </p>
            {suggestion.replacement.description && (
              <p className="text-xs text-slate-500 mt-1 italic">{suggestion.replacement.description}</p>
            )}
          </div>

          {/* Reasoning */}
          <div className="flex items-start gap-1.5 pt-1">
            <svg className="h-3.5 w-3.5 text-slate-400 shrink-0 mt-0.5" fill="none" viewBox="0 0 24 24" strokeWidth={2} stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" d="M12 18v-5.25m0 0a6.01 6.01 0 0 0 1.5-.189m-1.5.189a6.01 6.01 0 0 1-1.5-.189m3.75 7.478a12.06 12.06 0 0 1-4.5 0m3.75 2.383a14.406 14.406 0 0 1-3 0M14.25 18v-.192c0-.983.658-1.823 1.508-2.316a7.5 7.5 0 1 0-7.517 0c.85.493 1.509 1.333 1.509 2.316V18" />
            </svg>
            <p className="text-xs text-slate-500">{suggestion.reasoning}</p>
          </div>
        </div>
      </div>
    </div>
  );
}
