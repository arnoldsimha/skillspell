import { useState, useRef, useEffect } from 'react';
import { createPortal } from 'react-dom';
import SmartSuggestions from './SmartSuggestions.js';

interface RefinementDialogProps {
  open: boolean;
  loading: boolean;
  onSubmit: (refinement: string) => void;
  onCancel: () => void;
  /** Skill ID for AI-powered optimization suggestions. */
  skillId?: string;
}

const MAX_CHARS = 4000;

export default function RefinementDialog({
  open,
  loading,
  onSubmit,
  onCancel,
  skillId,
}: RefinementDialogProps) {
  const [text, setText] = useState('');
  const textareaRef = useRef<HTMLTextAreaElement>(null);

  useEffect(() => {
    if (open) {
      setText('');
      // Focus textarea after dialog opens
      setTimeout(() => textareaRef.current?.focus(), 100);
    }
  }, [open]);

  if (!open) return null;

  const handleSubmit = () => {
    const trimmed = text.trim();
    if (trimmed && !loading) {
      onSubmit(trimmed);
    }
  };

  const handleKeyDown = (e: React.KeyboardEvent) => {
    // Escape key is intentionally NOT handled here — only the Cancel button closes the dialog.
    // Submit on Ctrl/Cmd+Enter
    if ((e.metaKey || e.ctrlKey) && e.key === 'Enter') {
      e.preventDefault();
      handleSubmit();
    }
  };

  const handleSuggestionSelect = (prompt: string) => {
    setText(prompt);
  };

  return createPortal(
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 backdrop-blur-sm animate-backdrop">
      {/* Modal dialog — large centered popup */}
      <div className="flex flex-col w-[90vw] max-w-3xl h-[80vh] rounded-2xl bg-white shadow-2xl animate-scale-in">
        {/* Header */}
        <div className="flex items-center gap-3 border-b border-slate-200/80 px-6 py-4 shrink-0 rounded-t-2xl">
          <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-indigo-50">
            <svg className="h-5 w-5 text-indigo-500" fill="none" viewBox="0 0 24 24" strokeWidth={2} stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" d="M16.023 9.348h4.992v-.001M2.985 19.644v-4.992m0 0h4.992m-4.993 0 3.181 3.183a8.25 8.25 0 0 0 13.803-3.7M4.031 9.865a8.25 8.25 0 0 1 13.803-3.7l3.181 3.182" />
            </svg>
          </div>
          <div className="flex-1">
            <h3 className="text-lg font-bold text-slate-800">Refine Skill</h3>
            <p className="text-xs text-slate-500">
              Describe improvements and the AI will refine the skill
            </p>
          </div>
          <button
            onClick={onCancel}
            className="rounded-xl bg-slate-100 px-4 py-2 text-sm font-medium text-slate-700 hover:bg-slate-200 transition-all duration-200"
          >
            Cancel
          </button>
        </div>

        {/* Content area */}
        <div className="flex-1 overflow-auto p-6">
          <div className="mx-auto max-w-3xl space-y-5">
            {/* Textarea */}
            <div className="relative">
              <textarea
                ref={textareaRef}
                value={text}
                onChange={(e) => setText(e.target.value.slice(0, MAX_CHARS))}
                onKeyDown={handleKeyDown}
                disabled={loading}
                placeholder="e.g., Make the descriptions more concise, add error handling for edge cases, include a reference file for common patterns..."
                className="w-full min-h-[280px] resize-y rounded-xl border border-slate-200 bg-slate-50/50 p-5 text-sm text-slate-800 leading-relaxed placeholder:text-slate-400 focus:border-indigo-400 focus:bg-white focus:outline-none focus:ring-2 focus:ring-indigo-500/40 disabled:opacity-50 transition-all duration-200"
                spellCheck={false}
              />
              <span
                className={`absolute bottom-4 right-4 text-xs font-medium ${
                  text.length > MAX_CHARS * 0.9 ? 'text-red-500' : 'text-slate-300'
                }`}
              >
                {text.length}/{MAX_CHARS}
              </span>
            </div>

            {/* AI Smart Suggestions */}
            {skillId && (
              <SmartSuggestions
                mode="optimize"
                partialInput={text}
                skillId={skillId}
                onSelect={handleSuggestionSelect}
                disabled={loading}
              />
            )}
          </div>
        </div>

        {/* Footer */}
        <div className="flex items-center justify-end gap-2 border-t border-slate-200/80 px-6 py-4 shrink-0 rounded-b-2xl">
          <button
            onClick={onCancel}
            disabled={loading}
            className="rounded-xl bg-slate-100 px-4 py-2 text-sm font-medium text-slate-700 hover:bg-slate-200 disabled:opacity-50 transition-all duration-200"
          >
            Cancel
          </button>
          <button
            onClick={handleSubmit}
            disabled={!text.trim() || loading}
            className="flex items-center gap-2 rounded-xl bg-gradient-to-r from-indigo-600 to-purple-600 px-5 py-2.5 text-sm font-semibold text-white shadow-lg shadow-indigo-500/20 hover:shadow-xl hover:shadow-indigo-500/30 hover:brightness-110 disabled:opacity-40 disabled:shadow-none transition-all duration-200"
          >
            {loading ? (
              <>
                <div className="h-4 w-4 animate-spin-ease rounded-full border-2 border-white/30 border-t-white" />
                Refining...
              </>
            ) : (
              <>
                <svg className="h-4 w-4" fill="none" viewBox="0 0 24 24" strokeWidth={2} stroke="currentColor">
                  <path strokeLinecap="round" strokeLinejoin="round" d="M16.023 9.348h4.992v-.001M2.985 19.644v-4.992m0 0h4.992m-4.993 0 3.181 3.183a8.25 8.25 0 0 0 13.803-3.7M4.031 9.865a8.25 8.25 0 0 1 13.803-3.7l3.181 3.182" />
                </svg>
                Refine
              </>
            )}
          </button>
        </div>
      </div>
    </div>,
    document.body,
  );
}
