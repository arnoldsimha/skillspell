import { useRef, useState, useCallback } from 'react';

interface SkillZipUploaderProps {
  /** Whether the parser is currently processing a file. */
  parsing: boolean;
  /** Error message from the parser (null when no error). */
  error: string | null;
  /** Error details (e.g. list of specific issues). */
  errorDetails: string[];
  /** Called when the user selects or drops a zip file. */
  onFile: (file: File) => void;
  /** Called when the user drops or selects a folder. */
  onFolder: (source: FileSystemDirectoryEntry | FileList) => void;
  /** Called to reset the upload state (re-upload). */
  onReset: () => void;
}

export default function SkillZipUploader({
  parsing,
  error,
  errorDetails,
  onFile,
  onFolder,
  onReset,
}: SkillZipUploaderProps) {
  const [dragOver, setDragOver] = useState(false);
  const zipInputRef = useRef<HTMLInputElement>(null);
  const folderInputRef = useRef<HTMLInputElement>(null);

  const handleDragOver = useCallback((e: React.DragEvent) => {
    e.preventDefault();
    e.stopPropagation();
    setDragOver(true);
  }, []);

  const handleDragLeave = useCallback((e: React.DragEvent) => {
    e.preventDefault();
    e.stopPropagation();
    setDragOver(false);
  }, []);

  const handleDrop = useCallback(
    (e: React.DragEvent) => {
      e.preventDefault();
      e.stopPropagation();
      setDragOver(false);

      // Check if a folder was dropped via the DataTransfer items API
      if (e.dataTransfer.items.length > 0) {
        const item = e.dataTransfer.items[0];
        if (item.kind === 'file') {
          const entry = item.webkitGetAsEntry?.();
          if (entry?.isDirectory) {
            onFolder(entry as FileSystemDirectoryEntry);
            return;
          }
        }
      }

      // Fall back to zip file handling
      const file = e.dataTransfer.files[0];
      if (file) onFile(file);
    },
    [onFile, onFolder],
  );

  const handleZipInputChange = useCallback(
    (e: React.ChangeEvent<HTMLInputElement>) => {
      const file = e.target.files?.[0];
      if (file) onFile(file);
      e.target.value = '';
    },
    [onFile],
  );

  const handleFolderInputChange = useCallback(
    (e: React.ChangeEvent<HTMLInputElement>) => {
      const files = e.target.files;
      if (files && files.length > 0) onFolder(files);
      e.target.value = '';
    },
    [onFolder],
  );

  const handleClick = useCallback(() => {
    zipInputRef.current?.click();
  }, []);

  const handleFolderClick = useCallback((e: React.MouseEvent) => {
    e.stopPropagation();
    folderInputRef.current?.click();
  }, []);

  return (
    <div className="space-y-4">
      {/* Drop zone */}
      <div
        onDragOver={handleDragOver}
        onDragLeave={handleDragLeave}
        onDrop={handleDrop}
        onClick={!parsing ? handleClick : undefined}
        className={`relative flex flex-col items-center justify-center rounded-xl border-2 border-dashed p-10 text-center transition-all duration-200 cursor-pointer
          ${
            parsing
              ? 'border-indigo-300 bg-indigo-50/50 cursor-wait'
              : dragOver
                ? 'border-indigo-500 bg-indigo-50 scale-[1.01] shadow-lg shadow-indigo-500/10'
                : 'border-slate-300 bg-slate-50/50 hover:border-indigo-400 hover:bg-indigo-50/30'
          }
        `}
      >
        {/* Hidden zip file input */}
        <input
          ref={zipInputRef}
          type="file"
          accept=".zip"
          onChange={handleZipInputChange}
          className="hidden"
          disabled={parsing}
          aria-label="Upload skill zip file"
        />

        {/* Hidden folder input */}
        <input
          ref={folderInputRef}
          type="file"
          // @ts-expect-error — webkitdirectory is not in standard typings
          webkitdirectory=""
          onChange={handleFolderInputChange}
          className="hidden"
          disabled={parsing}
          aria-label="Upload skill folder"
        />

        {parsing ? (
          /* Loading indicator */
          <div className="flex flex-col items-center gap-3 animate-fade-in-up">
            <div className="h-10 w-10 animate-spin-ease rounded-full border-3 border-indigo-200 border-t-indigo-600" />
            <p className="text-sm font-medium text-indigo-700">Extracting skill files...</p>
            <p className="text-xs text-indigo-500">Validating structure and security</p>
          </div>
        ) : (
          /* Upload prompt */
          <div className="flex flex-col items-center gap-3">
            <div
              className={`flex h-14 w-14 items-center justify-center rounded-2xl transition-all duration-200 ${
                dragOver
                  ? 'bg-indigo-100 scale-110'
                  : 'bg-slate-100'
              }`}
            >
              <svg
                className={`h-7 w-7 transition-colors duration-200 ${
                  dragOver ? 'text-indigo-600' : 'text-slate-400'
                }`}
                fill="none"
                viewBox="0 0 24 24"
                strokeWidth={1.5}
                stroke="currentColor"
              >
                <path
                  strokeLinecap="round"
                  strokeLinejoin="round"
                  d="M3 16.5v2.25A2.25 2.25 0 0 0 5.25 21h13.5A2.25 2.25 0 0 0 21 18.75V16.5m-13.5-9L12 3m0 0 4.5 4.5M12 3v13.5"
                />
              </svg>
            </div>
            <div>
              <p className="text-sm font-semibold text-slate-700">
                {dragOver ? 'Drop your zip or folder here' : 'Drag & drop a skill zip or folder'}
              </p>
              <p className="mt-1 text-xs text-slate-500">
                <span className="text-indigo-600 font-medium cursor-pointer" onClick={handleClick}>browse zip</span>
                {' '}or{' '}
                <span className="text-indigo-600 font-medium cursor-pointer" onClick={handleFolderClick}>browse folder</span>
                {' '}· max 500 KB
              </p>
            </div>
            <div className="mt-2 rounded-lg bg-slate-100/80 px-4 py-2.5 text-xs text-slate-500 leading-relaxed">
              <span className="font-medium text-slate-600">Expected structure:</span>{' '}
              <code className="text-indigo-600">SKILL.md</code> at root, with optional{' '}
              <code className="text-indigo-600">scripts/</code>{' '}
              <code className="text-indigo-600">references/</code>{' '}
              <code className="text-indigo-600">assets/</code> directories
            </div>
          </div>
        )}
      </div>

      {/* Error display */}
      {error && (
        <div className="rounded-xl border border-red-200 bg-red-50 p-4 animate-fade-in-up">
          <div className="flex items-start gap-2.5">
            <svg
              className="h-4 w-4 text-red-500 shrink-0 mt-0.5"
              fill="none"
              viewBox="0 0 24 24"
              strokeWidth={2}
              stroke="currentColor"
            >
              <path
                strokeLinecap="round"
                strokeLinejoin="round"
                d="M12 9v3.75m9-.75a9 9 0 1 1-18 0 9 9 0 0 1 18 0Zm-9 3.75h.008v.008H12v-.008Z"
              />
            </svg>
            <div className="flex-1 min-w-0">
              <p className="text-sm font-medium text-red-700">{error}</p>
              {errorDetails.length > 0 && (
                <ul className="mt-2 space-y-1">
                  {errorDetails.map((detail, i) => (
                    <li key={i} className="text-xs text-red-600">
                      • {detail}
                    </li>
                  ))}
                </ul>
              )}
            </div>
          </div>
          <button
            type="button"
            onClick={onReset}
            className="mt-3 rounded-lg bg-red-100 px-3 py-1.5 text-xs font-medium text-red-700 hover:bg-red-200 transition-colors"
          >
            Try again
          </button>
        </div>
      )}
    </div>
  );
}
