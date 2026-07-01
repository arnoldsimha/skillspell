interface SkillEditorProps {
  value: string;
  readOnly?: boolean;
  onChange?: (value: string) => void;
}

export default function SkillEditor({ value, readOnly, onChange }: SkillEditorProps) {
  return (
    <div className="relative h-full">
      <textarea
        value={value}
        readOnly={readOnly}
        onChange={(e) => onChange?.(e.target.value)}
        className={`w-full h-full min-h-[400px] resize-y rounded-xl border p-5 font-mono text-sm text-slate-700 leading-relaxed shadow-sm
          focus:border-indigo-400 focus:outline-none focus:ring-2 focus:ring-indigo-500/40 transition-all duration-200
          ${readOnly ? 'cursor-default bg-slate-50/80 border-slate-200' : 'bg-white border-slate-200 hover:border-slate-300'}
        `}
        spellCheck={false}
      />
      {readOnly && (
        <span className="absolute right-4 top-4 rounded-lg bg-slate-100 px-2.5 py-1 text-[10px] font-semibold text-slate-400 uppercase tracking-wider">
          Read Only
        </span>
      )}
    </div>
  );
}
