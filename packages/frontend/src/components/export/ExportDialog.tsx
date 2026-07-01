import { useEffect, useState } from 'react';
import { createPortal } from 'react-dom';
import type { SkillSummary, ExportFormat, ExportFormatInfo } from '@skillspell/shared';
import { useExport } from '../../hooks/useExport.js';
import { useToast } from '../common/ToastContext.js';

interface ExportDialogProps {
  skill: SkillSummary;
  version?: number;
  onClose: () => void;
  /** Override the default ownership-gated export. Used by shared-skill view. */
  exportFn?: (format: ExportFormat, version?: number) => Promise<void>;
}

const EXPORT_FORMATS: ExportFormatInfo[] = [
  {
    id: 'claude',
    name: 'Claude Code',
    description: 'Multi-file skill with SKILL.md, scripts, references, and assets',
    outputPath: '.claude/skills/<name>/',
  },
  {
    id: 'cursor',
    name: 'Cursor',
    description: 'Single markdown rule file',
    outputPath: '.cursor/rules/<name>.md',
  },
  {
    id: 'windsurf',
    name: 'Windsurf',
    description: 'Single rules file at project root',
    outputPath: '.windsurfrules',
  },
  {
    id: 'copilot',
    name: 'GitHub Copilot',
    description: 'Instructions file for GitHub Copilot',
    outputPath: '.github/copilot-instructions.md',
  },
  {
    id: 'roo',
    name: 'Roo Code',
    description: 'Multi-file skill with SKILL.md, scripts, references, and assets',
    outputPath: '.roo/rules/<name>/',
  },
];

const FORMAT_ICONS: Record<ExportFormat, string> = {
  claude: '🟠',
  cursor: '⚡',
  windsurf: '🏄',
  copilot: '🐙',
  roo: '🪃',
};

export default function ExportDialog({ skill, version, onClose, exportFn }: ExportDialogProps) {
  const [selectedFormat, setSelectedFormat] = useState<ExportFormat>('claude');
  const { exporting, error, exportSkill } = useExport();
  const { addToast } = useToast();

  // Escape key to close
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onClose();
    };
    document.addEventListener('keydown', handleKeyDown);
    return () => document.removeEventListener('keydown', handleKeyDown);
  }, [onClose]);

  const handleExport = async () => {
    try {
      if (exportFn) {
        await exportFn(selectedFormat, version);
      } else {
        await exportSkill(skill.id, selectedFormat, version);
      }
      const formatName = EXPORT_FORMATS.find((f) => f.id === selectedFormat)?.name ?? selectedFormat;
      const versionLabel = version ? ` (v${version})` : '';
      addToast('success', `Skill "${skill.name}"${versionLabel} exported for ${formatName}`);
      onClose();
    } catch {
      addToast('error', 'Export failed. Please try again.');
    }
  };

  const selected = EXPORT_FORMATS.find((f) => f.id === selectedFormat)!;

  return createPortal(
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 backdrop-blur-sm animate-backdrop" onClick={onClose}>
      <div
        role="dialog"
        aria-modal="true"
        className="mx-4 flex max-h-[90vh] w-full max-w-lg flex-col rounded-2xl border border-slate-200/80 bg-white shadow-2xl animate-scale-in"
        onClick={(e) => e.stopPropagation()}
      >
        {/* Header — pinned */}
        <div className="flex shrink-0 items-center gap-3 border-b border-slate-100 px-6 pt-6 pb-4">
          <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-indigo-50">
            <svg
              className="h-5 w-5 text-indigo-500"
              fill="none"
              viewBox="0 0 24 24"
              strokeWidth={2}
              stroke="currentColor"
            >
              <path
                strokeLinecap="round"
                strokeLinejoin="round"
                d="M3 16.5v2.25A2.25 2.25 0 0 0 5.25 21h13.5A2.25 2.25 0 0 0 21 18.75V16.5M16.5 12 12 16.5m0 0L7.5 12m4.5 4.5V3"
              />
            </svg>
          </div>
          <div>
            <h3 className="text-lg font-bold text-slate-800">Export <span className="text-gradient">{skill.name}</span></h3>
            <p className="text-xs text-slate-500">Choose your IDE format and download</p>
          </div>
        </div>

        {/* Scrollable content */}
        <div className="flex-1 overflow-y-auto px-6 py-4">
        {/* Skill info */}
        <div className="mb-4 rounded-xl border border-slate-200/60 bg-slate-50/50 p-3.5">
          <p className="text-sm font-semibold text-slate-700">{skill.name}</p>
          <p className="mt-0.5 text-xs text-slate-500">{skill.description}</p>
        </div>

        {/* Format selector */}
        <div className="mb-4">
          <label className="mb-2.5 block text-sm font-semibold text-slate-700">Target IDE</label>
          <div className="space-y-2">
            {EXPORT_FORMATS.map((fmt) => (
              <button
                key={fmt.id}
                type="button"
                onClick={() => setSelectedFormat(fmt.id)}
                className={`flex w-full items-center gap-3 rounded-xl border p-3.5 text-left transition-all duration-200 ${
                  selectedFormat === fmt.id
                    ? 'border-indigo-400 bg-indigo-50/60 ring-1 ring-indigo-400/30 shadow-sm'
                    : 'border-slate-200/80 bg-white hover:border-slate-300 hover:bg-slate-50/50'
                }`}
              >
                <span className="text-xl" role="img" aria-label={fmt.name}>
                  {FORMAT_ICONS[fmt.id]}
                </span>
                <div className="min-w-0 flex-1">
                  <p
                    className={`text-sm font-semibold ${
                      selectedFormat === fmt.id ? 'text-indigo-800' : 'text-slate-700'
                    }`}
                  >
                    {fmt.name}
                  </p>
                  <p
                    className={`text-xs ${
                      selectedFormat === fmt.id ? 'text-indigo-600/70' : 'text-slate-500'
                    }`}
                  >
                    {fmt.description}
                  </p>
                </div>
                {selectedFormat === fmt.id && (
                  <div className="flex h-5 w-5 items-center justify-center rounded-full bg-indigo-500">
                    <svg className="h-3 w-3 text-white" fill="none" viewBox="0 0 24 24" strokeWidth={3} stroke="currentColor">
                      <path strokeLinecap="round" strokeLinejoin="round" d="m4.5 12.75 6 6 9-13.5" />
                    </svg>
                  </div>
                )}
              </button>
            ))}
          </div>
        </div>

        {/* Output path preview */}
        <div className="mb-4 rounded-xl border border-slate-200/60 bg-slate-50/50 p-3.5">
          <p className="text-[10px] font-bold text-slate-400 uppercase tracking-widest">Output structure</p>
          <p className="mt-1.5 font-mono text-xs text-slate-700">
            {selected.outputPath.replace(/<name>/g, skill.name)}
          </p>
          <div className="mt-2.5 space-y-1 text-xs text-slate-500">
            <p>📄 SKILL.md</p>
          </div>
        </div>

        {error && (
          <div className="mb-4 rounded-xl border border-red-200 bg-red-50 p-3.5">
            <p className="text-sm text-red-700">{error}</p>
          </div>
        )}
        </div>{/* end scrollable content */}

        {/* Actions — pinned footer */}
        <div className="flex shrink-0 items-center justify-end border-t border-slate-100 px-6 pt-4 pb-6">
          <div className="flex gap-3">
            <button
              onClick={onClose}
              className="rounded-xl bg-slate-100 px-4 py-2.5 text-sm font-medium text-slate-700 transition-all duration-200 hover:bg-slate-200"
            >
              Cancel
            </button>
            <button
              onClick={handleExport}
              disabled={exporting}
              className="flex items-center gap-2 rounded-xl bg-gradient-to-r from-indigo-600 to-purple-600 px-5 py-2.5 text-sm font-semibold text-white shadow-lg shadow-indigo-500/20 transition-all duration-200 hover:shadow-xl hover:shadow-indigo-500/30 hover:brightness-110 disabled:opacity-50 disabled:shadow-none"
            >
              {exporting ? (
                <>
                  <div className="h-4 w-4 animate-spin-ease rounded-full border-2 border-white/30 border-t-white" />
                  Exporting...
                </>
              ) : (
                <>
                  <span>{FORMAT_ICONS[selectedFormat]}</span>
                  Download for {selected.name}
                </>
              )}
            </button>
          </div>
        </div>
      </div>
    </div>,
    document.body,
  );
}
