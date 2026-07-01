import { useState } from 'react';
import SmartSuggestions from './SmartSuggestions.js';

interface PromptInputProps {
  onSubmit: (prompt: string, skillName?: string) => void;
  loading?: boolean;
  placeholder?: string;
  submitLabel?: string;
  /** Show the optional skill name field. Defaults to false. */
  showNameField?: boolean;
  /** Enable AI-powered smart suggestions. */
  suggestionsMode?: 'create' | 'optimize';
  /** Skill ID for optimize-mode suggestions. */
  suggestionsSkillId?: string;
  /** Skill name entered above the prompt — gates AI ideas display and provides context for suggestions. */
  externalSkillName?: string;
}

const MAX_CHARS = 4000;
const NAME_PATTERN = /^[a-z][a-z0-9-]*$/;

export default function PromptInput({
  onSubmit,
  loading,
  placeholder = 'Describe the skill you want to create...\n\nFor example: "Create a skill that helps with code review, focusing on security best practices and performance patterns."',
  submitLabel = 'Generate Skill',
  showNameField = false,
  suggestionsMode,
  suggestionsSkillId,
  externalSkillName,
}: PromptInputProps) {
  const [prompt, setPrompt] = useState('');
  const [skillName, setSkillName] = useState('');

  const nameProvided = skillName.trim().length > 0;
  const nameValid = !skillName || NAME_PATTERN.test(skillName);

  const handleSubmit = () => {
    const trimmed = prompt.trim();
    const trimmedName = skillName.trim();
    if (!trimmed || loading || !nameValid) return;
    if (showNameField && !trimmedName) return;
    onSubmit(trimmed, trimmedName || undefined);
  };


  const handleSuggestionSelect = (suggestionPrompt: string, suggestedName?: string) => {
    setPrompt(suggestionPrompt);
    if (suggestedName) {
      setSkillName(suggestedName);
    }
  };

  return (
    <div className="space-y-4">
      {showNameField && (
        <div>
          <label htmlFor="skill-name-input" className="block text-sm font-semibold text-slate-700 mb-1.5">
            Skill Name <span className="text-red-400 font-normal text-xs">*</span>
          </label>
          <input
            id="skill-name-input"
            type="text"
            value={skillName}
            onChange={(e) => setSkillName(e.target.value)}
            maxLength={64}
            placeholder="my-skill-name"
            disabled={loading}
            className={`w-full rounded-xl border bg-white px-4 py-2.5 text-sm text-slate-800 placeholder:text-slate-400 shadow-sm
              focus:outline-none focus:ring-2 focus:ring-indigo-500/40 disabled:opacity-60 transition-all duration-200
              ${!nameValid ? 'border-red-300 focus:border-red-400 focus:ring-red-500/40' : 'border-slate-200 focus:border-indigo-400 hover:border-slate-300'}`}
          />
          {!nameValid && (
            <p className="mt-1.5 text-xs text-red-500">
              Must be lowercase, start with a letter, and contain only lowercase letters, numbers, and hyphens.
            </p>
          )}
        </div>
      )}
      <div className="relative">
        <textarea
          value={prompt}
          onChange={(e) => setPrompt(e.target.value.slice(0, MAX_CHARS))}
          placeholder={placeholder}
          disabled={loading}
          className="min-h-[220px] w-full resize-none rounded-xl border border-slate-200 bg-white p-5 text-sm text-slate-800 leading-relaxed placeholder:text-slate-400 shadow-sm
            focus:border-indigo-400 focus:outline-none focus:ring-2 focus:ring-indigo-500/40
            hover:border-slate-300 disabled:opacity-60 transition-all duration-200"
        />
        <span
          className={`absolute bottom-4 right-4 text-xs font-medium ${
            prompt.length > MAX_CHARS * 0.9 ? 'text-red-500' : 'text-slate-300'
          }`}
        >
          {prompt.length}/{MAX_CHARS}
        </span>
      </div>

      {/* Smart Suggestions — only shown once the user has provided some context */}
      {suggestionsMode && (prompt.trim().length > 0 || (externalSkillName ?? '').trim().length > 0) && (
        <SmartSuggestions
          mode={suggestionsMode}
          partialInput={prompt}
          skillId={suggestionsSkillId}
          skillName={externalSkillName}
          onSelect={handleSuggestionSelect}
          disabled={loading}
        />
      )}

      <div className="flex items-center justify-end">
        <button
          onClick={handleSubmit}
          disabled={!prompt.trim() || loading || !nameValid || (showNameField && !nameProvided)}
          className="flex items-center gap-2 rounded-xl bg-gradient-to-r from-indigo-600 to-purple-600 px-6 py-2.5 text-sm font-semibold text-white shadow-lg shadow-indigo-500/20 hover:shadow-xl hover:shadow-indigo-500/30 hover:brightness-110 disabled:opacity-40 disabled:shadow-none disabled:hover:brightness-100 transition-all duration-200"
        >
          {loading ? (
            <>
              <div className="h-4 w-4 animate-spin-ease rounded-full border-2 border-white/30 border-t-white" />
              Generating...
            </>
          ) : (
            <>
              <svg className="h-4 w-4" fill="none" viewBox="0 0 24 24" strokeWidth={2} stroke="currentColor">
                <path
                  strokeLinecap="round"
                  strokeLinejoin="round"
                  d="M9.813 15.904 9 18.75l-.813-2.846a4.5 4.5 0 0 0-3.09-3.09L2.25 12l2.846-.813a4.5 4.5 0 0 0 3.09-3.09L9 5.25l.813 2.846a4.5 4.5 0 0 0 3.09 3.09L15.75 12l-2.846.813a4.5 4.5 0 0 0-3.09 3.09Z"
                />
              </svg>
              {submitLabel}
            </>
          )}
        </button>
      </div>
    </div>
  );
}
