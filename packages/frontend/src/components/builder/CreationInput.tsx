import type { UseZipUploadReturn } from '../../hooks/useZipUpload.js';
import PromptInput from './PromptInput.js';
import SkillZipUploader from './SkillZipUploader.js';

export type CreationMode = 'describe' | 'upload';


interface CreationInputProps {
  skillName: string;
  onNameChange: (name: string) => void;
  creationMode: CreationMode;
  onModeChange: (mode: CreationMode) => void;
  /** AI generation state */
  generating: boolean;
  onGenerate: (prompt: string) => void;
  /** Zip upload state */
  zipUpload: UseZipUploadReturn;
  onZipFile: (file: File) => void;
  onZipFolder: (source: FileSystemDirectoryEntry | FileList) => void;
  onZipReset: () => void;
}

/**
 * Input phase of the skill builder — shared name field above
 * "Describe" / "Upload" tabs.
 */
export default function CreationInput({
  skillName,
  onNameChange,
  creationMode,
  onModeChange,
  generating,
  onGenerate,
  zipUpload,
  onZipFile,
  onZipFolder,
  onZipReset,
}: CreationInputProps) {
  return (
    <div className="space-y-5 animate-fade-in-up">
      {/* Shared Skill Name field */}
      <div>
        <label htmlFor="skill-name-input" className="block text-sm font-semibold text-slate-700 mb-1.5">
          Skill Name <span className="text-red-400 font-normal text-xs">*</span>
        </label>
        <input
          id="skill-name-input"
          type="text"
          value={skillName}
          onChange={(e) => onNameChange(e.target.value)}
          maxLength={64}
          placeholder="my-skill-name"
          disabled={generating}
          className="w-full rounded-xl border border-slate-200 bg-white px-4 py-2.5 text-sm text-slate-800 placeholder:text-slate-400 shadow-sm focus:outline-none focus:ring-2 focus:ring-indigo-500/40 focus:border-indigo-400 hover:border-slate-300 disabled:opacity-60 transition-all duration-200"
        />
      </div>

      {/* Tab bar */}
      <div className="flex border-b border-slate-200">
        <button
          onClick={() => onModeChange('describe')}
          className={`flex items-center gap-2 px-5 py-2.5 text-sm font-semibold border-b-2 transition-all duration-200 -mb-px ${
            creationMode === 'describe'
              ? 'border-indigo-500 text-indigo-700'
              : 'border-transparent text-slate-500 hover:text-slate-700 hover:border-slate-300'
          }`}
        >
          <svg className="h-4 w-4" fill="none" viewBox="0 0 24 24" strokeWidth={2} stroke="currentColor">
            <path strokeLinecap="round" strokeLinejoin="round" d="M9.813 15.904 9 18.75l-.813-2.846a4.5 4.5 0 0 0-3.09-3.09L2.25 12l2.846-.813a4.5 4.5 0 0 0 3.09-3.09L9 5.25l.813 2.846a4.5 4.5 0 0 0 3.09 3.09L15.75 12l-2.846.813a4.5 4.5 0 0 0-3.09 3.09Z" />
          </svg>
          Describe
        </button>
        <button
          onClick={() => onModeChange('upload')}
          className={`flex items-center gap-2 px-5 py-2.5 text-sm font-semibold border-b-2 transition-all duration-200 -mb-px ${
            creationMode === 'upload'
              ? 'border-indigo-500 text-indigo-700'
              : 'border-transparent text-slate-500 hover:text-slate-700 hover:border-slate-300'
          }`}
        >
          <svg className="h-4 w-4" fill="none" viewBox="0 0 24 24" strokeWidth={2} stroke="currentColor">
            <path strokeLinecap="round" strokeLinejoin="round" d="M3 16.5v2.25A2.25 2.25 0 0 0 5.25 21h13.5A2.25 2.25 0 0 0 21 18.75V16.5m-13.5-9L12 3m0 0 4.5 4.5M12 3v13.5" />
          </svg>
          Upload
        </button>
      </div>

      {/* Tab content */}
      {creationMode === 'describe' ? (
        <PromptInput
          onSubmit={(prompt) => onGenerate(prompt)}
          loading={generating}
          suggestionsMode="create"
          externalSkillName={skillName}
        />
      ) : (
        <SkillZipUploader
          parsing={zipUpload.parsing}
          error={zipUpload.error}
          errorDetails={zipUpload.errorDetails}
          onFile={onZipFile}
          onFolder={onZipFolder}
          onReset={onZipReset}
        />
      )}
    </div>
  );
}
