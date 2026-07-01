import React, { useEffect, useRef, useCallback } from 'react';
import type { SuggestionItem } from '@skillspell/shared';
import { useSuggestions } from '../../hooks/useSuggestions.js';

interface SmartSuggestionsProps {
  /** "create" for new skill builder, "optimize" for skill optimizer. */
  mode: 'create' | 'optimize';
  /** Current user input text (for context-aware suggestions). */
  partialInput?: string;
  /** Skill ID (required for optimize mode). */
  skillId?: string;
  /** Skill name entered by the user (create mode) — narrows suggestions to this skill's domain. */
  skillName?: string;
  /** Called when a suggestion is selected — fills/submits the prompt. */
  onSelect: (prompt: string, suggestedName?: string) => void;
  /** Whether the parent is in a loading state (disables suggestions). */
  disabled?: boolean;
}

/**
 * Smart AI-powered suggestion chips.
 *
 * Fetches context-aware suggestions from the AI backend on mount
 * and when the user's partial input changes significantly.
 * For optimize mode, suggestions are tailored to the specific skill.
 *
 * Does NOT re-fetch when a suggestion is selected (fills the prompt textarea).
 */
function SmartSuggestions({
  mode,
  partialInput,
  skillId,
  skillName,
  onSelect,
  disabled = false,
}: SmartSuggestionsProps) {
  const { suggestions, loading, error, fetchSuggestions, refresh } =
    useSuggestions();

  // Track when a suggestion was just selected to suppress re-fetch
  const justSelectedRef = useRef(false);

  // Fetch whenever any context changes (mode, skillId, skillName, or partialInput).
  // Debouncing is handled inside useSuggestions — no length gate needed here.
  // Skip re-fetch when the change was caused by selecting a suggestion.
  useEffect(() => {
    if (justSelectedRef.current) {
      justSelectedRef.current = false;
      return;
    }
    fetchSuggestions(mode, partialInput, skillId, skillName);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [mode, skillId, skillName, partialInput]);

  const handleSelect = useCallback(
    (prompt: string, suggestedName?: string) => {
      justSelectedRef.current = true;
      onSelect(prompt, suggestedName);
    },
    [onSelect],
  );

  const hasSuggestions = suggestions.length > 0;
  const showSkeleton = loading && !hasSuggestions;

  return (
    <div className="space-y-2.5">
      {/* Header */}
      <div className="flex items-center gap-2">
        <div className="flex items-center gap-1.5">
          <div className={`flex h-5 w-5 items-center justify-center rounded-md ${loading ? 'bg-indigo-100' : hasSuggestions ? 'bg-indigo-50' : 'bg-slate-100'}`}>
            <svg
              className={`h-3 w-3 ${loading ? 'animate-pulse text-indigo-500' : hasSuggestions ? 'text-indigo-500' : 'text-slate-400'}`}
              fill="none"
              viewBox="0 0 24 24"
              strokeWidth={2}
              stroke="currentColor"
            >
              <path
                strokeLinecap="round"
                strokeLinejoin="round"
                d="M9.813 15.904 9 18.75l-.813-2.846a4.5 4.5 0 0 0-3.09-3.09L2.25 12l2.846-.813a4.5 4.5 0 0 0 3.09-3.09L9 5.25l.813 2.846a4.5 4.5 0 0 0 3.09 3.09L15.75 12l-2.846.813a4.5 4.5 0 0 0-3.09 3.09ZM18.259 8.715 18 9.75l-.259-1.035a3.375 3.375 0 0 0-2.455-2.456L14.25 6l1.036-.259a3.375 3.375 0 0 0 2.455-2.456L18 2.25l.259 1.035a3.375 3.375 0 0 0 2.455 2.456L21.75 6l-1.036.259a3.375 3.375 0 0 0-2.455 2.456Z"
              />
            </svg>
          </div>
          <span className="text-xs font-semibold text-slate-500">
            {mode === 'create' ? 'AI skill ideas' : 'AI improvement suggestions'}
          </span>

          {/* Loading indicator */}
          {loading && (
            <span className="inline-flex items-center gap-1.5 text-[10px] text-slate-400">
              <div className="h-3 w-3 animate-spin-ease rounded-full border-[1.5px] border-indigo-400/30 border-t-indigo-400" />
              Analyzing{mode === 'optimize' ? ' skill' : ''}…
            </span>
          )}
        </div>

        {hasSuggestions && !loading && (
          <button
            onClick={() => refresh()}
            disabled={disabled || loading}
            className="group flex items-center gap-1 rounded-lg px-2 py-1 text-[10px] font-semibold text-slate-400 hover:bg-slate-100 hover:text-slate-600 disabled:opacity-40 transition-all duration-200"
            title="Get new AI suggestions"
          >
            <svg
              className="h-3 w-3 group-hover:rotate-180 transition-transform duration-500"
              fill="none"
              viewBox="0 0 24 24"
              strokeWidth={2}
              stroke="currentColor"
            >
              <path
                strokeLinecap="round"
                strokeLinejoin="round"
                d="M16.023 9.348h4.992v-.001M2.985 19.644v-4.992m0 0h4.992m-4.993 0 3.181 3.183a8.25 8.25 0 0 0 13.803-3.7M4.031 9.865a8.25 8.25 0 0 1 13.803-3.7l3.181 3.182"
              />
            </svg>
            Refresh
          </button>
        )}
      </div>

      {/* Error */}
      {error && !loading && (
        <p className="text-xs text-amber-600">
          Couldn&apos;t load suggestions.{' '}
          <button
            onClick={() => refresh()}
            className="underline hover:text-amber-700 transition-colors"
          >
            Try again
          </button>
        </p>
      )}

      {/* Skeleton loader */}
      {showSkeleton && (
        <div className="flex flex-wrap gap-2">
          {[1, 2, 3, 4].map((i) => (
            <div
              key={i}
              className="h-8 rounded-xl animate-shimmer"
              // eslint-disable-next-line react-hooks/purity
              style={{ width: `${80 + Math.random() * 60}px` }}
            />
          ))}
        </div>
      )}

      {/* Suggestion chips */}
      {hasSuggestions && (
        <div className="flex flex-wrap gap-2">
          {suggestions.map((s: SuggestionItem, idx: number) => (
            <button
              key={`${s.label}-${idx}`}
              onClick={() => handleSelect(s.prompt, s.suggestedName)}
              disabled={disabled}
              className="suggestion-chip group flex items-center gap-1.5 rounded-xl border border-indigo-200/60 bg-indigo-50/50 px-3.5 py-2 text-xs font-medium text-indigo-600 shadow-sm hover:border-indigo-300 hover:bg-indigo-100/70 hover:text-indigo-700 hover:shadow-md disabled:opacity-40 disabled:hover:border-indigo-200/60 disabled:hover:bg-indigo-50/50 disabled:hover:text-indigo-600 disabled:hover:shadow-sm transition-all duration-200"
              style={{ animationDelay: `${idx * 75}ms` }}
              title={s.prompt}
            >
              <span className="max-w-[200px] truncate">{s.label}</span>
              <svg
                className="h-3 w-3 opacity-0 -translate-x-1 group-hover:opacity-100 group-hover:translate-x-0 transition-all duration-200"
                fill="none"
                viewBox="0 0 24 24"
                strokeWidth={2.5}
                stroke="currentColor"
              >
                <path
                  strokeLinecap="round"
                  strokeLinejoin="round"
                  d="m4.5 19.5 15-15m0 0H8.25m11.25 0v11.25"
                />
              </svg>
            </button>
          ))}
        </div>
      )}
    </div>
  );
}

export default React.memo(SmartSuggestions);
