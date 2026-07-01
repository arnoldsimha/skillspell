interface OptimizationSuggestionsProps {
  onSelect: (message: string) => void;
}

const SUGGESTIONS = [
  {
    label: 'Improve description',
    message: 'Improve the description to be more trigger-optimized and specific about when this skill should be activated.',
    icon: '📝',
  },
  {
    label: 'Add error handling',
    message: 'Add robust error handling instructions and edge case documentation to the skill.',
    icon: '🛡️',
  },
  {
    label: 'Add scripts',
    message: 'Generate useful automation scripts (build, test, deploy) that complement this skill.',
    icon: '⚡',
  },
  {
    label: 'Enhance references',
    message: 'Add detailed reference documentation with examples and best practices.',
    icon: '📚',
  },
];

export default function OptimizationSuggestions({ onSelect }: OptimizationSuggestionsProps) {
  return (
    <div>
      <p className="mb-2.5 text-xs font-semibold text-slate-500">Quick suggestions</p>
      <div className="flex flex-wrap gap-2">
        {SUGGESTIONS.map((s) => (
          <button
            key={s.label}
            onClick={() => onSelect(s.message)}
            className="flex items-center gap-1.5 rounded-xl border border-slate-200/80 bg-white px-3.5 py-2 text-xs font-medium text-slate-600 shadow-sm hover:border-indigo-300 hover:bg-indigo-50 hover:text-indigo-700 hover:shadow-md transition-all duration-200"
          >
            <span>{s.icon}</span>
            {s.label}
          </button>
        ))}
      </div>
    </div>
  );
}
