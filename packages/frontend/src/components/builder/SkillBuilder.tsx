import { useState, useCallback, useEffect, useRef } from 'react';
import type { Skill, SkillWithSession } from '@skillspell/shared';
import { useGeneration } from '../../hooks/useGeneration.js';
import { useZipUpload } from '../../hooks/useZipUpload.js';
import { createSkill, checkSkillNameExists } from '../../services/api/index.js';
import CreationInput from './CreationInput.js';
import type { CreationMode } from './CreationInput.js';
import GenerationProgress from './GenerationProgress.js';
import SkillPreview from '../skills/SkillPreview.js';
import SecretWarningBanner from './SecretWarningBanner.js';
import ConfirmDialog from '../common/ConfirmDialog.js';
import { detectSecrets } from '../../utils/secretScanner.js';
import type { SecretFinding } from '../../utils/secretScanner.js';

type BuilderState = 'idle' | 'generating' | 'preview' | 'refining';

interface SkillBuilderProps {
  onComplete: (skill: Skill) => void;
  onCancel: () => void;
  /** Called immediately when a skill is saved (generated or refined) so the sidebar can refresh. */
  onSkillSaved?: (skill: Skill) => void;
}

export default function SkillBuilder({ onComplete, onCancel, onSkillSaved }: SkillBuilderProps) {
  const [state, setState] = useState<BuilderState>('idle');
  const [creationMode, setCreationMode] = useState<CreationMode>('describe');
  const [skillName, setSkillName] = useState('');
  const [saving, setSaving] = useState(false);

  // Name conflict tracking (for zip upload flow)
  const [nameConflict, setNameConflict] = useState(false);
  const [nameChecking, setNameChecking] = useState(false);
  const [dismissedSecretWarning, setDismissedSecretWarning] = useState(false);
  const [showSecretConfirm, setShowSecretConfirm] = useState(false);
  const [saveError, setSaveError] = useState<string | null>(null);
  const [showRefineSecretConfirm, setShowRefineSecretConfirm] = useState(false);
  const [pendingRefineMessage, setPendingRefineMessage] = useState('');
  const [refineSecretFindings, setRefineSecretFindings] = useState<SecretFinding[]>([]);

  const { skill, generating, error, refineError, generate, refine, updateSkillName, cancel: cancelRefine } = useGeneration();
  const zipUpload = useZipUpload();

  // Track whether we already transitioned to preview for the current parsed skill
  const didTransitionRef = useRef(false);

  // Transition to preview after successful zip parse — also check name uniqueness
  useEffect(() => {
    if (zipUpload.parsedSkill && state === 'idle' && creationMode === 'upload' && !didTransitionRef.current) {
      didTransitionRef.current = true;
      const parsedName = zipUpload.parsedSkill.name || '';
      if (!skillName && parsedName) {
        setSkillName(parsedName);
      }
      setState('preview');

      // Check if name already exists
      const nameToCheck = skillName || parsedName;
      if (nameToCheck) {
        setNameChecking(true);
        checkSkillNameExists(nameToCheck)
          .then((exists) => setNameConflict(exists))
          .catch(() => setNameConflict(false))
          .finally(() => setNameChecking(false));
      }
    }
  }, [zipUpload.parsedSkill, state, creationMode, skillName]);

  // Reset transition flag when upload is reset
  useEffect(() => {
    if (!zipUpload.parsedSkill) {
      didTransitionRef.current = false;
      setNameConflict(false);
      setDismissedSecretWarning(false);
    }
  }, [zipUpload.parsedSkill]);

  const isUploadPreviewState = creationMode === 'upload' && !!zipUpload.parsedSkill && state === 'preview';

  // Re-check name uniqueness when user edits the skill name (debounced)
  const nameCheckTimerRef = useRef<ReturnType<typeof setTimeout> | undefined>(undefined);
  useEffect(() => {
    if (!isUploadPreviewState) return;
    if (!skillName.trim()) {
      setNameConflict(false);
      return;
    }
    setNameChecking(true);
    clearTimeout(nameCheckTimerRef.current);
    nameCheckTimerRef.current = setTimeout(() => {
      checkSkillNameExists(skillName.trim())
        .then((exists) => setNameConflict(exists))
        .catch(() => setNameConflict(false))
        .finally(() => setNameChecking(false));
    }, 400);
    return () => clearTimeout(nameCheckTimerRef.current);
  }, [skillName, isUploadPreviewState]);

  // Derived: uploaded skill as SkillWithSession for SkillPreview
  const uploadedSkillPreview: SkillWithSession | null = zipUpload.parsedSkill
    ? {
        id: '',
        ownerId: '',
        name: skillName || zipUpload.parsedSkill.name,
        description: zipUpload.parsedSkill.description,
        status: 'draft' as const,
        skillContent: zipUpload.parsedSkill.skillContent,
        scripts: zipUpload.parsedSkill.scripts,
        references: zipUpload.parsedSkill.references,
        assets: zipUpload.parsedSkill.assets,
        version: 1,
        createdAt: new Date().toISOString(),
        updatedAt: new Date().toISOString(),
        isPublished: false,
      }
    : null;

  const isUploadPreview = creationMode === 'upload' && !!uploadedSkillPreview && state === 'preview';
  const showInputPhase = state === 'idle';

  /* ─── Handlers ─────────────────────────────────────────────────────── */

  const handleGenerate = async (prompt: string) => {
    if (!skillName.trim()) return;
    setState('generating');
    try {
      const saved = await generate(prompt, skillName.trim());
      setState('preview');
      onSkillSaved?.(saved);
    } catch {
      setState('idle');
    }
  };

  const doRefine = async (message: string) => {
    setState('refining');
    try {
      const updated = await refine(message);
      setState('preview');
      onSkillSaved?.(updated);
    } catch {
      setState('preview');
    }
  };

  const handleRefine = (message: string) => {
    const findings = detectSecrets({
      name: '', description: '', skillContent: message,
      scripts: [], references: [], assets: [],
    }).map((f) => ({ ...f, fileName: 'refine request' }));
    if (findings.length > 0) {
      setPendingRefineMessage(message);
      setRefineSecretFindings(findings);
      setShowRefineSecretConfirm(true);
      return;
    }
    void doRefine(message);
  };

  const handleUploadDoneWithConfirm = () => {
    if (zipUpload.secretFindings.length > 0) {
      setShowSecretConfirm(true);
    } else {
      void handleUploadDone();
    }
  };

  const handleUploadDone = async () => {
    if (!uploadedSkillPreview) return;
    setSaving(true);
    try {
      const created = await createSkill({
        name: skillName || uploadedSkillPreview.name,
        description: uploadedSkillPreview.description,
        skillContent: uploadedSkillPreview.skillContent,
        scripts: uploadedSkillPreview.scripts,
        references: uploadedSkillPreview.references,
        assets: uploadedSkillPreview.assets,
        status: 'ready',
      });
      onSkillSaved?.(created);
      onComplete(created);
    } catch {
      setSaveError('Failed to save skill. Please try again.');
    } finally {
      setSaving(false);
    }
  };

  const handleZipFile = useCallback(
    async (file: File) => { setDismissedSecretWarning(false); await zipUpload.handleFile(file); },
    [zipUpload],
  );

  const handleZipFolder = useCallback(
    async (source: FileSystemDirectoryEntry | FileList) => { setDismissedSecretWarning(false); await zipUpload.handleFolder(source); },
    [zipUpload],
  );

  const handleResetUpload = useCallback(() => {
    zipUpload.reset();
    setState('idle');
  }, [zipUpload]);

  const handleTabChange = (mode: CreationMode) => {
    if (state !== 'idle') return;
    setCreationMode(mode);
  };

  /* ─── Render ───────────────────────────────────────────────────────── */

  return (
    <>
      <ConfirmDialog
        open={showSecretConfirm}
        title={`${zipUpload.secretFindings.length} potential secret${zipUpload.secretFindings.length !== 1 ? 's' : ''} detected`}
        confirmLabel="I understand, save anyway"
        cancelLabel="Go back"
        variant="warning"
        onConfirm={() => { setShowSecretConfirm(false); void handleUploadDone(); }}
        onCancel={() => setShowSecretConfirm(false)}
      >
        <ul className="mb-3 space-y-2">
          {zipUpload.secretFindings.map((f, i) => (
            <li key={i} className="rounded-lg bg-orange-50 border border-orange-200 px-3 py-2">
              <p className="text-xs font-semibold text-orange-900">{f.patternName}</p>
              <p className="text-xs text-orange-700 font-mono mt-0.5">{f.fileName} — {f.redactedValue}</p>
            </li>
          ))}
        </ul>
        <p className="text-xs text-slate-500">
          These patterns may be real secrets. Saving will store them on the server — review carefully before proceeding.
        </p>
      </ConfirmDialog>
      <ConfirmDialog
        open={showRefineSecretConfirm}
        title={`${refineSecretFindings.length} potential secret${refineSecretFindings.length !== 1 ? 's' : ''} in your refine request`}
        confirmLabel="I understand, send anyway"
        cancelLabel="Go back"
        variant="warning"
        onConfirm={() => {
          setShowRefineSecretConfirm(false);
          void doRefine(pendingRefineMessage);
          setPendingRefineMessage('');
          setRefineSecretFindings([]);
        }}
        onCancel={() => {
          setShowRefineSecretConfirm(false);
          setPendingRefineMessage('');
          setRefineSecretFindings([]);
        }}
      >
        <ul className="mb-3 space-y-2">
          {refineSecretFindings.map((f, i) => (
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
            <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-gradient-to-br from-indigo-500 to-purple-600 shadow-lg shadow-indigo-500/15">
              <svg className="h-5 w-5 text-white" fill="none" viewBox="0 0 24 24" strokeWidth={1.5} stroke="currentColor">
                <path strokeLinecap="round" strokeLinejoin="round" d="M9.813 15.904 9 18.75l-.813-2.846a4.5 4.5 0 0 0-3.09-3.09L2.25 12l2.846-.813a4.5 4.5 0 0 0 3.09-3.09L9 5.25l.813 2.846a4.5 4.5 0 0 0 3.09 3.09L15.75 12l-2.846.813a4.5 4.5 0 0 0-3.09 3.09Z" />
              </svg>
            </div>
            <div>
              <h2 className="text-lg font-bold text-slate-800">Create New Skill</h2>
              <p className="text-xs text-slate-500">Describe what you want or upload an existing skill</p>
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
      </div>

      {/* Content */}
      <div className="flex-1 overflow-auto p-6">
        {/* Error banner */}
        {(error || saveError) && (
          <div className="mb-5 rounded-xl border border-red-200 bg-red-50 p-4 animate-fade-in-up">
            <div className="flex items-center gap-2">
              <svg className="h-4 w-4 text-red-500 shrink-0" fill="none" viewBox="0 0 24 24" strokeWidth={2} stroke="currentColor">
                <path strokeLinecap="round" strokeLinejoin="round" d="M12 9v3.75m9-.75a9 9 0 1 1-18 0 9 9 0 0 1 18 0Zm-9 3.75h.008v.008H12v-.008Z" />
              </svg>
              <p className="text-sm text-red-700">{error ?? saveError}</p>
            </div>
          </div>
        )}

        {/* Input phase — kept mounted to preserve textarea content on error */}
        <div className={showInputPhase ? '' : 'hidden'}>
          <CreationInput
            skillName={skillName}
            onNameChange={setSkillName}
            creationMode={creationMode}
            onModeChange={handleTabChange}
            generating={generating}
            onGenerate={handleGenerate}
            zipUpload={zipUpload}
            onZipFile={handleZipFile}
            onZipFolder={handleZipFolder}
            onZipReset={handleResetUpload}
          />
        </div>

        {/* Generating */}
        {state === 'generating' && generating && <GenerationProgress />}

        {/* Upload warnings */}
        {isUploadPreview && zipUpload.warnings.length > 0 && (
          <div className="mb-5 rounded-xl border border-amber-200 bg-amber-50 p-4 animate-fade-in-up">
            <div className="flex items-start gap-2.5">
              <svg className="h-4 w-4 text-amber-500 shrink-0 mt-0.5" fill="none" viewBox="0 0 24 24" strokeWidth={2} stroke="currentColor">
                <path strokeLinecap="round" strokeLinejoin="round" d="M12 9v3.75m-9.303 3.376c-.866 1.5.217 3.374 1.948 3.374h14.71c1.73 0 2.813-1.874 1.948-3.374L13.949 3.378c-.866-1.5-3.032-1.5-3.898 0L2.697 16.126Z" />
              </svg>
              <div className="flex-1 min-w-0">
                <p className="text-sm font-medium text-amber-700">
                  {zipUpload.warnings.length} warning{zipUpload.warnings.length !== 1 ? 's' : ''} during extraction
                </p>
                <ul className="mt-1.5 space-y-0.5">
                  {zipUpload.warnings.map((w, i) => (
                    <li key={i} className="text-xs text-amber-600">• {w}</li>
                  ))}
                </ul>
              </div>
            </div>
          </div>
        )}

        {/* Secret warning banner */}
        {isUploadPreview && !dismissedSecretWarning && zipUpload.secretFindings.length > 0 && (
          <SecretWarningBanner
            findings={zipUpload.secretFindings}
            className="mb-5"
            onDismiss={() => setDismissedSecretWarning(true)}
          />
        )}

        {/* Upload preview */}
        {isUploadPreview && uploadedSkillPreview && (
          <div className="animate-fade-in-up">
            <SkillPreview
              skill={uploadedSkillPreview}
              refining={false}
              onRefine={() => {}}
              onDone={handleUploadDoneWithConfirm}
              onNameChange={setSkillName}
              draftMode
              approving={saving}
              hideRefine
              nameConflict={nameConflict}
              nameChecking={nameChecking}
            />
          </div>
        )}

        {/* Generation preview */}
        {!isUploadPreview && (state === 'preview' || state === 'refining') && skill && (
          <div className="animate-fade-in-up">
            <SkillPreview
              skill={skill}
              refining={state === 'refining'}
              onRefine={handleRefine}
              onDone={() => skill && onComplete(skill)}
              onNameChange={updateSkillName}
              onAbort={() => { cancelRefine(); setState('preview'); }}
              refineError={refineError}
            />
          </div>
        )}
      </div>
    </div>
    </>
  );
}
