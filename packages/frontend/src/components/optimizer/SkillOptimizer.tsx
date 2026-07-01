import { useState, useEffect } from 'react';
import type { Skill, SkillSummary } from '@skillspell/shared';
import { fetchSkill } from '../../services/api/index.js';
import { useOptimizer } from '../../hooks/useOptimizer.js';
import PromptInput from '../builder/PromptInput.js';
import GenerationProgress from '../builder/GenerationProgress.js';
import SkillPreview from '../skills/SkillPreview.js';
import ConfirmDialog from '../common/ConfirmDialog.js';
import { detectSecrets } from '../../utils/secretScanner.js';
import type { SecretFinding } from '../../utils/secretScanner.js';

type OptState = 'idle' | 'loading' | 'generating' | 'preview' | 'refining' | 'approving';

interface SkillOptimizerProps {
  /** Lightweight metadata — the full skill is fetched on mount for diff capabilities. */
  skill: SkillSummary;
  onComplete: (skill: Skill) => void;
  onCancel: () => void;
  /** Called when a skill is approved so the sidebar can refresh. */
  onSkillSaved?: (skill: Skill) => void;
}

export default function SkillOptimizer({ skill, onComplete, onCancel, onSkillSaved }: SkillOptimizerProps) {
  const [state, setState] = useState<OptState>('loading');
  const [fullSkill, setFullSkill] = useState<Skill | null>(null);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [secretFindings, setSecretFindings] = useState<SecretFinding[]>([]);
  const [pendingAction, setPendingAction] = useState<(() => void) | null>(null);
  const { draft, generating, error, optimizeDraft, refineDraft, approveDraft, cancel: cancelRequest } = useOptimizer(skill);

  // Fetch full skill on mount for diff/preview capabilities
  useEffect(() => {
    let cancelled = false;
    setLoadError(null);
    fetchSkill(skill.id)
      .then((data) => {
        if (!cancelled) {
          setFullSkill(data);
          setState('idle');
        }
      })
      .catch((err) => {
        if (!cancelled) {
          setLoadError(err instanceof Error ? err.message : 'Failed to load skill content');
          setState('idle');
        }
      });
    return () => { cancelled = true; };
  }, [skill.id]);

  const scanAndConfirm = (message: string, action: () => void) => {
    const findings = detectSecrets({
      name: '', description: '', skillContent: message,
      scripts: [], references: [], assets: [],
    }).map((f) => ({ ...f, fileName: 'prompt' }));
    if (findings.length > 0) {
      setSecretFindings(findings);
      setPendingAction(() => action);
      return;
    }
    action();
  };

  const handleOptimize = (message: string) => {
    scanAndConfirm(message, async () => {
      setState('generating');
      try {
        await optimizeDraft(message);
        setState('preview');
      } catch {
        setState('idle');
      }
    });
  };

  const handleRefine = (message: string) => {
    scanAndConfirm(message, async () => {
      setState('refining');
      try {
        await refineDraft(message);
        setState('preview');
      } catch {
        setState('preview');
      }
    });
  };

  const handleApprove = async () => {
    setState('approving');
    try {
      const saved = await approveDraft();
      onSkillSaved?.(saved);
      onComplete(saved);
    } catch {
      setState('preview');
    }
  };

  // Build a SkillWithSession-like object from the draft for SkillPreview.
  // Always use the main skill name — name is never changed by optimization.
  // Uses fullSkill (fetched on mount) as the base for spreading metadata.
  const draftAsSkill = draft && fullSkill
    ? {
        ...fullSkill,
        description: draft.description,
        skillContent: draft.skillContent,
        scripts: draft.scripts,
        references: draft.references,
        assets: draft.assets,
        explanation: draft.explanation,
        stats: draft.stats,
      }
    : null;

  const dismissConfirm = () => { setSecretFindings([]); setPendingAction(null); };

  return (
    <>
      <ConfirmDialog
        open={secretFindings.length > 0}
        title={`${secretFindings.length} potential secret${secretFindings.length !== 1 ? 's' : ''} in your prompt`}
        confirmLabel="I understand, send anyway"
        cancelLabel="Go back"
        variant="warning"
        onConfirm={() => { dismissConfirm(); pendingAction?.(); }}
        onCancel={dismissConfirm}
      >
        <ul className="mb-3 space-y-2">
          {secretFindings.map((f, i) => (
            <li key={i} className="rounded-lg bg-orange-50 border border-orange-200 px-3 py-2">
              <p className="text-xs font-semibold text-orange-900">{f.patternName}</p>
              <p className="text-xs text-orange-700 font-mono mt-0.5">{f.fileName} — {f.redactedValue}</p>
            </li>
          ))}
        </ul>
        <p className="text-xs text-slate-500">
          These patterns may be real secrets. Sending them will include them in the AI prompt — review carefully before proceeding.
        </p>
      </ConfirmDialog>
    <div className="flex h-full flex-col">
      {/* Top bar */}
      <div className="border-b border-slate-200/80 bg-white px-6 py-5">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-3">
            <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-gradient-to-br from-blue-500 to-indigo-600 shadow-lg shadow-blue-500/15">
              <svg className="h-5 w-5 text-white" fill="none" viewBox="0 0 24 24" strokeWidth={1.5} stroke="currentColor">
                <path strokeLinecap="round" strokeLinejoin="round" d="M9.813 15.904 9 18.75l-.813-2.846a4.5 4.5 0 0 0-3.09-3.09L2.25 12l2.846-.813a4.5 4.5 0 0 0 3.09-3.09L9 5.25l.813 2.846a4.5 4.5 0 0 0 3.09 3.09L15.75 12l-2.846.813a4.5 4.5 0 0 0-3.09 3.09Z" />
              </svg>
            </div>
            <div>
              <h2 className="text-lg font-bold text-slate-800">Optimize Skill</h2>
              <p className="text-xs text-slate-500">
                Improving <span className="font-semibold text-slate-700">{skill.name}</span> <span className="text-slate-400">v{skill.version}</span>
              </p>
            </div>
          </div>
          <button
            type="button"
            onClick={onCancel}
            className="rounded-xl bg-slate-100 px-4 py-2 text-sm font-medium text-slate-600 hover:bg-slate-200 transition-all duration-200"
          >
            Cancel
          </button>
        </div>

        {/* Current skill summary */}
        <div className="mt-4 rounded-xl border border-slate-200/60 bg-slate-50/50 p-3.5">
          <p className="text-[10px] font-bold text-slate-400 uppercase tracking-widest">Current description</p>
          <p className="mt-1.5 text-sm text-slate-700 leading-relaxed">{skill.description}</p>
        </div>
      </div>

      {/* Content */}
      <div className="flex-1 overflow-auto p-6">
        {state === 'loading' && (
          <div className="flex items-center justify-center py-12">
            <div className="h-10 w-10 animate-spin-ease rounded-full border-[3px] border-indigo-200 border-t-indigo-600" />
          </div>
        )}

        {loadError && (
          <div className="mb-5 rounded-xl border border-red-200 bg-red-50 p-4 animate-fade-in-up">
            <div className="flex items-center gap-2">
              <svg className="h-4 w-4 text-red-500 shrink-0" fill="none" viewBox="0 0 24 24" strokeWidth={2} stroke="currentColor">
                <path strokeLinecap="round" strokeLinejoin="round" d="M12 9v3.75m9-.75a9 9 0 1 1-18 0 9 9 0 0 1 18 0Zm-9 3.75h.008v.008H12v-.008Z" />
              </svg>
              <p className="text-sm text-red-700">{loadError}</p>
            </div>
          </div>
        )}

        {error && (
          <div className="mb-5 rounded-xl border border-red-200 bg-red-50 p-4 animate-fade-in-up">
            <div className="flex items-center gap-2">
              <svg className="h-4 w-4 text-red-500 shrink-0" fill="none" viewBox="0 0 24 24" strokeWidth={2} stroke="currentColor">
                <path strokeLinecap="round" strokeLinejoin="round" d="M12 9v3.75m9-.75a9 9 0 1 1-18 0 9 9 0 0 1 18 0Zm-9 3.75h.008v.008H12v-.008Z" />
              </svg>
              <p className="text-sm text-red-700">{error}</p>
            </div>
          </div>
        )}

        {/* Show prompt input when idle */}
        {state === 'idle' && !draft && (
          <div className="animate-fade-in-up space-y-6">
            {/* Page description */}
            <div className="rounded-2xl border border-indigo-100 bg-indigo-50/60 p-5">
              <p className="text-sm font-semibold text-indigo-900 mb-3">How optimization works</p>
              <ol className="space-y-2.5">
                {[
                  { step: '1', label: 'Describe your goal', detail: 'Tell SkillSpell what you want to improve — clarity, structure, tone, coverage, or anything specific.' },
                  { step: '2', label: 'Review the AI-generated version', detail: 'SkillSpell rewrites the skill content. You\'ll see a side-by-side diff so nothing is hidden.' },
                  { step: '3', label: 'Approve or keep refining', detail: 'Accept the result to save a new version, or ask for further changes until it\'s right.' },
                ].map(({ step, label, detail }) => (
                  <li key={step} className="flex gap-3">
                    <span className="flex h-5 w-5 shrink-0 items-center justify-center rounded-full bg-indigo-200 text-[10px] font-bold text-indigo-700 mt-0.5">{step}</span>
                    <span className="text-sm text-indigo-800"><span className="font-semibold">{label}</span> — {detail}</span>
                  </li>
                ))}
              </ol>
            </div>
            <PromptInput
              onSubmit={handleOptimize}
              loading={generating}
              placeholder="Describe what you'd like to improve or change about this skill..."
              submitLabel="Optimize"
              suggestionsMode="optimize"
              suggestionsSkillId={skill.id}
            />
          </div>
        )}

        {(state === 'generating' || state === 'refining') && generating && <GenerationProgress mode="optimize" />}

        {(state === 'preview' || state === 'refining' || state === 'approving') && draftAsSkill && (
          <div className="animate-fade-in-up">
            <SkillPreview
              skill={draftAsSkill}
              originalSkill={fullSkill ?? undefined}
              refining={state === 'refining'}
              onRefine={handleRefine}
              onDone={handleApprove}
              draftMode
              approving={state === 'approving'}
              onAbort={() => {
                cancelRequest();
                setState('preview');
              }}
            />
          </div>
        )}
      </div>
    </div>
    </>
  );
}
