import React from 'react';

interface EvalFeedbackProps {
  value: string;
  onChange: (value: string) => void;
  rating: 'good' | 'bad' | 'neutral' | null;
  onRatingChange: (rating: 'good' | 'bad' | 'neutral' | null) => void;
  onSave: () => void;
  isSaving: boolean;
  isSaved: boolean;
  isDirty: boolean;
  hideHeader?: boolean;
}

/**
 * Feedback panel with rating buttons, a textarea with character counter,
 * and a manual "Save feedback" button.
 * Purely presentational — save logic is handled by the parent / hook.
 */
export function EvalFeedback({
  value,
  onChange,
  rating,
  onRatingChange,
  onSave,
  isSaving,
  isSaved,
  isDirty,
  hideHeader = false,
}: EvalFeedbackProps) {
  return (
    <div className="space-y-3">
      {!hideHeader && (
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-2">
            <svg className="h-4 w-4 text-amber-500" fill="none" viewBox="0 0 24 24" strokeWidth={2} stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" d="M7.5 8.25h9m-9 3H12m-9.75 1.51c0 1.6 1.123 2.994 2.707 3.227 1.087.16 2.185.283 3.293.369V21l4.076-4.076a1.526 1.526 0 0 1 1.037-.443 48.282 48.282 0 0 0 5.68-.494c1.584-.233 2.707-1.626 2.707-3.228V6.741c0-1.602-1.123-2.995-2.707-3.228A48.394 48.394 0 0 0 12 3c-2.392 0-4.744.175-7.043.513C3.373 3.746 2.25 5.14 2.25 6.741v6.018Z" />
            </svg>
            <h4 className="text-sm font-bold text-slate-700 uppercase tracking-wide">Feedback</h4>
          </div>
          <SaveIndicator isSaving={isSaving} isSaved={isSaved} />
        </div>
      )}

      {/* Rating buttons */}
      <div className="flex gap-2" role="radiogroup" aria-label="Rate this output">
        <RatingButton
          selected={rating === 'good'}
          onClick={() => onRatingChange(rating === 'good' ? null : 'good')}
          emoji="👍"
          label="Good"
          activeColor="bg-emerald-50 border-emerald-300 text-emerald-700"
        />
        <RatingButton
          selected={rating === 'neutral'}
          onClick={() => onRatingChange(rating === 'neutral' ? null : 'neutral')}
          emoji="😐"
          label="Neutral"
          activeColor="bg-amber-50 border-amber-300 text-amber-700"
        />
        <RatingButton
          selected={rating === 'bad'}
          onClick={() => onRatingChange(rating === 'bad' ? null : 'bad')}
          emoji="👎"
          label="Bad"
          activeColor="bg-red-50 border-red-300 text-red-700"
        />
      </div>

      {/* Feedback textarea */}
      <div className="relative">
        <textarea
          value={value}
          onChange={(e: React.ChangeEvent<HTMLTextAreaElement>) => onChange(e.target.value)}
          maxLength={200}
          placeholder="Add your feedback about this output..."
          className="w-full h-24 p-3 rounded-xl border border-slate-200 bg-white text-sm text-slate-800 placeholder:text-slate-400 resize-none focus:border-indigo-400 focus:outline-none focus:ring-2 focus:ring-indigo-500/20 transition-all duration-200"
          aria-label="Feedback text"
        />
        <span
          className={`absolute bottom-2 right-3 text-[10px] tabular-nums ${
            value.length >= 200
              ? 'text-red-400 font-medium'
              : value.length >= 160
                ? 'text-amber-400'
                : 'text-slate-300'
          }`}
          aria-live="polite"
        >
          {value.length}/200
        </span>
      </div>

      {/* Save button + status */}
      <div className="flex items-center justify-between">
        <button
          onClick={onSave}
          disabled={isSaving || !isDirty}
          className={`px-4 py-1.5 rounded-lg text-sm font-medium transition-all duration-200 ${
            isSaving
              ? 'bg-slate-100 text-slate-400 cursor-wait'
              : isDirty
                ? 'bg-indigo-500 text-white hover:bg-indigo-600 shadow-sm'
                : 'bg-slate-100 text-slate-400 cursor-not-allowed'
          }`}
        >
          {isSaving ? 'Saving…' : 'Save feedback'}
        </button>
        <SaveIndicator isSaving={false} isSaved={isSaved} />
      </div>
    </div>
  );
}

/* ─── Sub-components ─────────────────────────────────────────────────── */

function SaveIndicator({ isSaving, isSaved }: { isSaving: boolean; isSaved: boolean }) {
  if (isSaving) {
    return (
      <span className="flex items-center gap-1.5 text-xs text-slate-500">
        <div className="h-3 w-3 animate-spin-ease rounded-full border-2 border-indigo-400 border-t-transparent" />
        Saving…
      </span>
    );
  }

  if (isSaved) {
    return (
      <span className="flex items-center gap-1 text-xs text-emerald-600 font-medium">
        <svg className="h-3.5 w-3.5" fill="none" viewBox="0 0 24 24" strokeWidth={2} stroke="currentColor">
          <path strokeLinecap="round" strokeLinejoin="round" d="m4.5 12.75 6 6 9-13.5" />
        </svg>
        Saved
      </span>
    );
  }

  return null;
}

function RatingButton({
  selected,
  onClick,
  emoji,
  label,
  activeColor,
}: {
  selected: boolean;
  onClick: () => void;
  emoji: string;
  label: string;
  activeColor: string;
}) {
  return (
    <button
      onClick={onClick}
      role="radio"
      aria-checked={selected}
      aria-label={label}
      className={`flex items-center gap-1.5 px-3 py-2 rounded-xl border text-sm font-medium transition-all duration-200 ${
        selected
          ? activeColor
          : 'bg-white border-slate-200 text-slate-600 hover:bg-slate-50 hover:border-slate-300'
      }`}
    >
      <span aria-hidden="true">{emoji}</span>
      <span>{label}</span>
    </button>
  );
}
