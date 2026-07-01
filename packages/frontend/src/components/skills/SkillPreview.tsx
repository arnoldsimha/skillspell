import { useState, useEffect, useRef, useMemo } from 'react';
import ReactDiffViewer, { DiffMethod } from 'react-diff-viewer-continued';
import type { Skill, SkillWithSession, SkillFileItem } from '@skillspell/shared';
import RefinementDialog from '../builder/RefinementDialog.js';
import { EvalViewer } from '../eval/EvalViewer.js';
import MarkdownToggleViewer, { SourcePreviewToggle } from '../common/MarkdownToggleViewer.js';
import CodeViewer from '../common/CodeViewer.js';
import ErrorBoundary from '../common/ErrorBoundary.js';
import { formatExplanation } from '../../utils/formatExplanation.js';
import { formatDuration } from '../../utils/formatDuration.js';
import { makeSkillLinkHandler } from '../../utils/skillFileUtils.js';

interface SkillPreviewProps {
  skill: SkillWithSession;
  /** The original skill before optimization/refinement — when provided, enables "Show Changes" diff view. */
  originalSkill?: Skill;
  refining?: boolean;
  onRefine: (message: string) => void;
  onDone: () => void;
  onNameChange?: (name: string) => void;
  /** When true, the preview is showing an unsaved draft (optimizer flow). */
  draftMode?: boolean;
  /** When true, the approve/save operation is in progress. */
  approving?: boolean;
  /** Called when the user cancels a running refinement request (aborts in-flight HTTP). */
  onAbort?: () => void;
  /** When true, hide the Refine button (e.g. for uploaded skills that haven't been saved yet). */
  hideRefine?: boolean;
  /** When true, the current skill name conflicts with an existing skill name (per owner). */
  nameConflict?: boolean;
  /** When true, a name uniqueness check is in progress. */
  nameChecking?: boolean;
  /** Error message from the last refine attempt — prevents dialog auto-close on failure so the user can retry with preserved text. */
  refineError?: string | null;
}

/** Represents a selectable file entry in the tree. */
interface FileEntry {
  /** Unique key for React & selection */
  key: string;
  /** Display name shown in the tree */
  name: string;
  /** Category label (used for grouping) */
  category: string;
  /** File content */
  content: string;
}

export default function SkillPreview({
  skill,
  originalSkill,
  refining,
  onRefine,
  onDone,
  onNameChange,
  draftMode = false,
  approving = false,
  onAbort,
  hideRefine = false,
  nameConflict = false,
  nameChecking = false,
  refineError,
}: SkillPreviewProps) {
  const [showRefineDialog, setShowRefineDialog] = useState(false);
  const [showEvalViewer, setShowEvalViewer] = useState(false);
  const hasDiff = !!originalSkill;
  const [splitView, setSplitView] = useState(true);
  const [mdRendered, setMdRendered] = useState(true);
  const prevRefining = useRef(refining);

  // Build flat file list for the current (optimized) skill
  const files: FileEntry[] = buildFileListFromSkill(skill);

  // Build flat file list for the original (pre-optimization) skill
  const originalFiles: FileEntry[] = useMemo(
    () => (originalSkill ? buildFileListFromSkill(originalSkill) : []),
    [originalSkill],
  );

  // Merge file keys from both original and new skill for diff sidebar
  const mergedFileKeys = useMemo(() => {
    if (!originalSkill) return files.map((f) => f.key);
    const seen = new Set<string>();
    const result: string[] = [];
    for (const f of originalFiles) {
      if (!seen.has(f.key)) { seen.add(f.key); result.push(f.key); }
    }
    for (const f of files) {
      if (!seen.has(f.key)) { seen.add(f.key); result.push(f.key); }
    }
    return result;
  }, [originalSkill, files, originalFiles]);

  // Determine which files have changes between original and new
  const changedFiles = useMemo(() => {
    if (!originalSkill) return new Set<string>();
    const changed = new Set<string>();
    const origMap = new Map(originalFiles.map((f) => [f.key, f.content]));
    const newMap = new Map(files.map((f) => [f.key, f.content]));
    for (const key of mergedFileKeys) {
      const origContent = origMap.get(key) ?? '';
      const newContent = newMap.get(key) ?? '';
      if (origContent !== newContent) changed.add(key);
    }
    return changed;
  }, [originalSkill, originalFiles, files, mergedFileKeys]);

  // When in diff mode, use the merged file list; otherwise use new files only
  const displayFiles = useMemo(() => {
    if (!hasDiff) return files;
    // Build display entries from merged keys
    const origMap = new Map(originalFiles.map((f) => [f.key, f]));
    const newMap = new Map(files.map((f) => [f.key, f]));
    return mergedFileKeys.map((key) => {
      const newFile = newMap.get(key);
      const origFile = origMap.get(key);
      // Prefer new file entry; fall back to original for deleted files
      return newFile ?? origFile!;
    });
  }, [hasDiff, files, originalFiles, mergedFileKeys]);

  const [selectedKey, setSelectedKey] = useState<string>(files[0]?.key ?? '');
  const [collapsedGroups, setCollapsedGroups] = useState<Set<string>>(new Set());

  // If the files change (e.g. after refinement) and the selected key is gone, reset
  useEffect(() => {
    const currentFiles = hasDiff ? displayFiles : files;
    if (!currentFiles.find((f) => f.key === selectedKey) && currentFiles.length > 0) {
      setSelectedKey(currentFiles[0].key);
    }
  }, [files, displayFiles, hasDiff, selectedKey]);

  // Auto-close dialog when refining finishes successfully (transitions from true → false with no error)
  useEffect(() => {
    if (prevRefining.current && !refining && !refineError) {
      setShowRefineDialog(false);
    }
    prevRefining.current = refining;
  }, [refining, refineError]);

  const handleRefineSubmit = (message: string) => {
    onRefine(message);
  };

  const selectedFile = (hasDiff ? displayFiles : files).find((f) => f.key === selectedKey);

  // Get original file content for the selected file (for diff view)
  const originalFileContent = useMemo(() => {
    if (!originalSkill || !selectedKey) return '';
    const origFile = originalFiles.find((f) => f.key === selectedKey);
    return origFile?.content ?? '';
  }, [originalSkill, originalFiles, selectedKey]);

  // Group files by category for the tree
  const groups = groupFiles(hasDiff ? displayFiles : files);

  const toggleGroup = (group: string) => {
    setCollapsedGroups((prev) => {
      const next = new Set(prev);
      if (next.has(group)) next.delete(group);
      else next.add(group);
      return next;
    });
  };

  // Check if selected file is markdown
  const selectedIsMarkdown = selectedFile ? isMarkdownFile(selectedFile.name) : false;

  return (
    <ErrorBoundary>
    <div className="space-y-5">
      {/* Action buttons — above everything else */}
      <div className="flex items-center gap-3">
        <button
          onClick={onDone}
          disabled={approving || nameConflict || nameChecking}
          className={`flex items-center gap-2 rounded-xl px-6 py-2.5 text-sm font-semibold text-white shadow-lg transition-all duration-200 ${
            draftMode
              ? 'bg-gradient-to-r from-blue-500 to-indigo-600 shadow-blue-500/20 hover:shadow-xl hover:shadow-blue-500/30 hover:brightness-110'
              : 'bg-gradient-to-r from-emerald-500 to-emerald-600 shadow-emerald-500/20 hover:shadow-xl hover:shadow-emerald-500/30 hover:brightness-110'
          } disabled:opacity-60 disabled:cursor-not-allowed`}
        >
          {approving ? (
            <div className="h-4 w-4 animate-spin-ease rounded-full border-2 border-white/30 border-t-white" />
          ) : (
            <svg className="h-4 w-4" fill="none" viewBox="0 0 24 24" strokeWidth={2.5} stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" d="m4.5 12.75 6 6 9-13.5" />
            </svg>
          )}
          {draftMode ? (approving ? 'Saving...' : 'Approve & Save') : 'Done'}
        </button>
        {!hideRefine && (
          <button
            onClick={() => setShowRefineDialog(true)}
            disabled={approving}
            className="flex items-center gap-2 rounded-xl bg-slate-100 px-5 py-2.5 text-sm font-semibold text-slate-700 hover:bg-slate-200 disabled:opacity-50 disabled:cursor-not-allowed transition-all duration-200"
          >
            <svg className="h-4 w-4" fill="none" viewBox="0 0 24 24" strokeWidth={2} stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" d="M16.023 9.348h4.992v-.001M2.985 19.644v-4.992m0 0h4.992m-4.993 0 3.181 3.183a8.25 8.25 0 0 0 13.803-3.7M4.031 9.865a8.25 8.25 0 0 1 13.803-3.7l3.181 3.182" />
            </svg>
            Refine
          </button>
        )}
      </div>

      {/* Draft / Auto-saved banner with stats */}
      <div className={`rounded-2xl border p-4 shadow-sm ${
        draftMode
          ? 'border-amber-200/80 bg-amber-50/80'
          : 'border-emerald-200/80 bg-emerald-50/80'
      }`}>
        <div className="flex items-center gap-2.5">
          <div className={`flex h-7 w-7 items-center justify-center rounded-lg ${
            draftMode ? 'bg-amber-100' : 'bg-emerald-100'
          }`}>
            {draftMode ? (
              <svg className="h-4 w-4 text-amber-600" fill="none" viewBox="0 0 24 24" strokeWidth={2.5} stroke="currentColor">
                <path strokeLinecap="round" strokeLinejoin="round" d="m16.862 4.487 1.687-1.688a1.875 1.875 0 1 1 2.652 2.652L10.582 16.07a4.5 4.5 0 0 1-1.897 1.13L6 18l.8-2.685a4.5 4.5 0 0 1 1.13-1.897l8.932-8.931Z" />
              </svg>
            ) : (
              <svg className="h-4 w-4 text-emerald-600" fill="none" viewBox="0 0 24 24" strokeWidth={2.5} stroke="currentColor">
                <path strokeLinecap="round" strokeLinejoin="round" d="m4.5 12.75 6 6 9-13.5" />
              </svg>
            )}
          </div>
          <h4 className={`text-sm font-semibold ${draftMode ? 'text-amber-800' : 'text-emerald-800'}`}>
            {draftMode ? 'Draft — click "Approve & Save" to create a new version' : 'Skill saved automatically'}
          </h4>
        </div>
        {skill.explanation && (
          <p className={`mt-2 ml-9 text-sm leading-relaxed whitespace-pre-wrap ${draftMode ? 'text-amber-700/80' : 'text-emerald-700/80'}`}>{formatExplanation(skill.explanation)}</p>
        )}
        {/* Generation stats */}
        {skill.stats && (
          <div className={`mt-3 ml-9 flex flex-wrap gap-3 text-xs ${draftMode ? 'text-amber-700/70' : 'text-emerald-700/70'}`}>
            <span className="flex items-center gap-1">
              <svg className="h-3.5 w-3.5" fill="none" viewBox="0 0 24 24" strokeWidth={2} stroke="currentColor">
                <path strokeLinecap="round" strokeLinejoin="round" d="M12 6v6h4.5m4.5 0a9 9 0 1 1-18 0 9 9 0 0 1 18 0Z" />
              </svg>
              {formatDuration(skill.stats.durationMs)}
            </span>
            <span className={draftMode ? 'text-amber-400' : 'text-emerald-400'}>·</span>
            <span>{skill.stats.inputTokens.toLocaleString()} input tokens</span>
            <span className={draftMode ? 'text-amber-400' : 'text-emerald-400'}>·</span>
            <span>{skill.stats.outputTokens.toLocaleString()} output tokens</span>
            {skill.stats.costUsd > 0 && (
              <>
                <span className={draftMode ? 'text-amber-400' : 'text-emerald-400'}>·</span>
                <span>${skill.stats.costUsd.toFixed(4)}</span>
              </>
            )}
            <span className={draftMode ? 'text-amber-400' : 'text-emerald-400'}>·</span>
            <span>{skill.stats.numTurns} turn{skill.stats.numTurns !== 1 ? 's' : ''}</span>
          </div>
        )}
      </div>

      {/* Skill metadata */}
      <div className={`rounded-2xl border bg-white p-5 shadow-sm ${
        nameConflict ? 'border-red-300' : 'border-slate-200/80'
      }`}>
        <div className="flex items-center gap-2.5">
          <label htmlFor="skill-name" className="text-sm font-semibold text-slate-500 shrink-0">
            Name:
          </label>
          {!nameConflict ? (
            <span className="flex-1 px-4 py-2 text-base font-bold text-slate-800">{skill.name}</span>
          ) : (
            <div className="flex-1 relative">
              <input
                id="skill-name"
                type="text"
                value={skill.name}
                onChange={(e) => onNameChange?.(e.target.value)}
                maxLength={64}
                className={`w-full rounded-xl border bg-slate-50/50 px-4 py-2 text-base font-bold text-slate-800
                  focus:bg-white focus:outline-none focus:ring-2 transition-all duration-200
                  ${nameConflict
                    ? 'border-red-300 focus:border-red-400 focus:ring-red-500/40'
                    : 'border-slate-200 focus:border-indigo-400 focus:ring-indigo-500/40 hover:border-slate-300'
                  }`}
                placeholder="skill-name"
              />
              {nameChecking && (
                <div className="absolute right-3 top-1/2 -translate-y-1/2">
                  <div className="h-4 w-4 animate-spin rounded-full border-2 border-slate-300 border-t-indigo-500" />
                </div>
              )}
            </div>
          )}
        </div>
        {/* Name conflict warning */}
        {nameConflict && (
          <div className="mt-3 flex items-start gap-2 rounded-lg border border-red-200 bg-red-50 p-3">
            <svg className="h-4 w-4 text-red-500 shrink-0 mt-0.5" fill="none" viewBox="0 0 24 24" strokeWidth={2} stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" d="M12 9v3.75m-9.303 3.376c-.866 1.5.217 3.374 1.948 3.374h14.71c1.73 0 2.813-1.874 1.948-3.374L13.949 3.378c-.866-1.5-3.032-1.5-3.898 0L2.697 16.126Z" />
            </svg>
            <div className="flex-1 min-w-0">
              <p className="text-sm font-medium text-red-700">
                A skill named &ldquo;{skill.name}&rdquo; already exists
              </p>
              <p className="mt-0.5 text-xs text-red-600">
                Please change the skill name above before saving.
              </p>
            </div>
          </div>
        )}
        {!draftMode && skill.name && !/^[a-z][a-z0-9-]*$/.test(skill.name) && (
          <p className="mt-2 text-xs text-amber-600">
            Name must be lowercase, start with a letter, and contain only lowercase letters, numbers, and hyphens.
          </p>
        )}
        <p className="mt-3 text-sm text-slate-600 leading-relaxed">{skill.description}</p>
      </div>

      {/* GitHub-style file browser */}
      <div className="rounded-2xl border border-slate-200/80 bg-white shadow-sm overflow-hidden">
        <div className="flex" style={{ minHeight: 420 }}>
          {/* Left: File tree */}
          <div className="w-60 shrink-0 border-r border-slate-200/80 bg-slate-50/50 overflow-y-auto">
            <div className="px-4 py-2.5 border-b border-slate-200/60">
              <span className="text-[10px] font-bold text-slate-400 uppercase tracking-widest">Files</span>
              {hasDiff && changedFiles.size > 0 && (
                <span className="ml-2 rounded-full bg-amber-100/80 px-2 py-0.5 text-[10px] font-semibold text-amber-700">
                  {changedFiles.size} changed
                </span>
              )}
            </div>
            <nav className="py-1">
              {groups.map((group) => {
                if (group.category === '_root') {
                  // Root-level files (SKILL.md)
                  return group.files.map((file) => (
                    <TreeFileItem
                      key={file.key}
                      name={file.name}
                      selected={file.key === selectedKey}
                      indent={0}
                      hasChanges={hasDiff ? changedFiles.has(file.key) : undefined}
                      onClick={() => setSelectedKey(file.key)}
                    />
                  ));
                }

                const isCollapsed = collapsedGroups.has(group.category);
                return (
                  <div key={group.category}>
                    {/* Folder header */}
                    <button
                      onClick={() => toggleGroup(group.category)}
                      className="flex w-full items-center gap-1.5 px-4 py-2 text-left hover:bg-slate-100/80 transition-colors"
                    >
                      <svg
                        className={`h-3.5 w-3.5 text-slate-400 transition-transform duration-200 ${isCollapsed ? '' : 'rotate-90'}`}
                        fill="none"
                        viewBox="0 0 24 24"
                        strokeWidth={2}
                        stroke="currentColor"
                      >
                        <path strokeLinecap="round" strokeLinejoin="round" d="m8.25 4.5 7.5 7.5-7.5 7.5" />
                      </svg>
                      <FolderIcon />
                      <span className="text-sm font-medium text-slate-700">{group.category}</span>
                      <span className="ml-auto rounded-full bg-slate-200/60 px-1.5 py-0.5 text-[10px] font-medium text-slate-500">
                        {group.files.length}
                      </span>
                    </button>
                    {/* Folder children */}
                    {!isCollapsed &&
                      group.files.map((file) => (
                        <TreeFileItem
                          key={file.key}
                          name={file.name}
                          selected={file.key === selectedKey}
                          indent={1}
                          hasChanges={hasDiff ? changedFiles.has(file.key) : undefined}
                          onClick={() => setSelectedKey(file.key)}
                        />
                      ))}
                  </div>
                );
              })}
            </nav>
          </div>

          {/* Right: Content viewer */}
          <div className="flex-1 flex flex-col min-w-0">
            {selectedFile ? (
              <>
                {/* File header bar with Source/Preview toggle or Split/Unified toggle */}
                <div className="flex items-center gap-2 border-b border-slate-200/60 bg-slate-50/50 px-4 py-2.5">
                  <FileIcon />
                  <span className="text-sm font-medium text-slate-700 truncate">
                    {selectedFile.category !== '_root'
                      ? `${selectedFile.category.toLowerCase()}/${selectedFile.name}`
                      : selectedFile.name}
                  </span>
                  {/* Show change indicator badge in diff mode */}
                  {hasDiff && changedFiles.has(selectedFile.key) && (
                    <span className="rounded-full bg-amber-100 px-2 py-0.5 text-[10px] font-semibold text-amber-700">modified</span>
                  )}
                  {hasDiff && !changedFiles.has(selectedFile.key) && (
                    <span className="rounded-full bg-emerald-100 px-2 py-0.5 text-[10px] font-semibold text-emerald-700">unchanged</span>
                  )}
                  <div className="ml-auto flex items-center gap-2">
                    {/* Split/Unified toggle — only in diff mode */}
                    {hasDiff && (
                      <button
                        onClick={() => setSplitView(!splitView)}
                        className={`rounded-lg px-2.5 py-1.5 text-[11px] font-semibold transition-all duration-200 ${
                          splitView
                            ? 'bg-indigo-50 text-indigo-700 hover:bg-indigo-100'
                            : 'bg-slate-100 text-slate-600 hover:bg-slate-200'
                        }`}
                      >
                        {splitView ? 'Split' : 'Unified'}
                      </button>
                    )}
                    {/* Source/Preview toggle — only for markdown files when not in diff mode */}
                    {!hasDiff && selectedIsMarkdown && (
                      <SourcePreviewToggle
                        rendered={mdRendered}
                        onToggle={setMdRendered}
                      />
                    )}
                  </div>
                </div>
                {/* File content or diff view */}
                <div className="flex-1 overflow-auto">
                  {hasDiff ? (
                    // Diff view: compare original vs new content
                    selectedFile.content === originalFileContent ? (
                      <div className="flex h-full items-center justify-center text-sm text-slate-400">
                        <div className="text-center animate-fade-in-up">
                          <div className="flex h-12 w-12 items-center justify-center rounded-xl bg-emerald-50 mx-auto mb-3">
                            <svg className="h-6 w-6 text-emerald-500" fill="none" viewBox="0 0 24 24" strokeWidth={1.5} stroke="currentColor">
                              <path strokeLinecap="round" strokeLinejoin="round" d="m4.5 12.75 6 6 9-13.5" />
                            </svg>
                          </div>
                          No changes in this file
                        </div>
                      </div>
                    ) : (
                      <ReactDiffViewer
                        oldValue={originalFileContent}
                        newValue={selectedFile.content}
                        splitView={splitView}
                        leftTitle="Before"
                        rightTitle="After"
                        useDarkTheme={false}
                        compareMethod={DiffMethod.WORDS}
                        styles={{
                          variables: {
                            light: {
                              diffViewerBackground: '#ffffff',
                              diffViewerTitleBackground: '#f8fafc',
                              addedBackground: '#dcfce7',
                              addedColor: '#166534',
                              removedBackground: '#fee2e2',
                              removedColor: '#991b1b',
                              wordAddedBackground: '#bbf7d0',
                              wordRemovedBackground: '#fecaca',
                              addedGutterBackground: '#d1fae5',
                              removedGutterBackground: '#fecaca',
                              gutterBackground: '#f8fafc',
                              gutterColor: '#94a3b8',
                              codeFoldBackground: '#f1f5f9',
                              codeFoldGutterBackground: '#f1f5f9',
                              codeFoldContentColor: '#64748b',
                              emptyLineBackground: '#f8fafc',
                            },
                          },
                          line: {
                            padding: '4px 12px',
                            fontSize: '13px',
                            lineHeight: '1.6',
                            fontFamily: 'ui-monospace, SFMono-Regular, "SF Mono", Menlo, Consolas, monospace',
                          },
                          contentText: {
                            fontFamily: 'ui-monospace, SFMono-Regular, "SF Mono", Menlo, Consolas, monospace',
                            fontSize: '13px',
                          },
                        }}
                      />
                    )
                  ) : (
                    // Normal view
                    <div className="p-4">
                      {isMarkdownFile(selectedFile.name) ? (
                        <MarkdownToggleViewer
                          content={selectedFile.content}
                          rendered={mdRendered}
                          onToggle={setMdRendered}
                          onLinkClick={makeSkillLinkHandler(displayFiles, setSelectedKey, setCollapsedGroups)}
                        />
                      ) : (
                        <CodeViewer content={selectedFile.content} filename={selectedFile.name} />
                      )}
                    </div>
                  )}
                </div>
              </>
            ) : (
              <div className="flex-1 flex items-center justify-center text-sm text-slate-400">
                Select a file to view its content
              </div>
            )}
          </div>
        </div>
      </div>


      {/* Refinement dialog */}
      <RefinementDialog
        open={showRefineDialog}
        loading={refining ?? false}
        onSubmit={handleRefineSubmit}
        onCancel={() => {
          // If a refinement is in progress, abort the HTTP request
          if (refining && onAbort) {
            onAbort();
          }
          setShowRefineDialog(false);
        }}
        skillId={skill.id}
      />

      {/* Eval Viewer modal */}
      {showEvalViewer && skill.id && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 backdrop-blur-sm animate-backdrop" onClick={() => setShowEvalViewer(false)}>
          <div
            className="mx-4 w-full max-w-4xl rounded-2xl bg-white shadow-2xl animate-scale-in"
            style={{ height: '80vh' }}
            onClick={(e) => e.stopPropagation()}
          >
            <EvalViewer
              skillId={skill.id}
              onClose={() => setShowEvalViewer(false)}
            />
          </div>
        </div>
      )}
    </div>
    </ErrorBoundary>
  );
}

/* ─── Helpers ────────────────────────────────────────────────────────── */

/** Check if a filename is a markdown file */
function isMarkdownFile(name: string): boolean {
  return name.toLowerCase().endsWith('.md');
}

/** Build a flat file list from a generic skill-shaped object (Skill or SkillWithSession). */
function buildFileListFromSkill(skill: Skill | SkillWithSession): FileEntry[] {
  const entries: FileEntry[] = [];

  entries.push({
    key: 'skill.md',
    name: 'SKILL.md',
    category: '_root',
    content: skill.skillContent,
  });

  const addItems = (items: SkillFileItem[], category: string) => {
    items.forEach((item) => {
      entries.push({
        key: `${category}/${item.name}`,
        name: item.name,
        category,
        content: item.content,
      });
    });
  };

  if (skill.references.length > 0) addItems(skill.references, 'References');
  if (skill.scripts.length > 0) addItems(skill.scripts, 'Scripts');
  if (skill.assets.length > 0) addItems(skill.assets, 'Assets');

  return entries;
}


/** Group files by category for tree rendering. */
function groupFiles(files: FileEntry[]): { category: string; files: FileEntry[] }[] {
  const map = new Map<string, FileEntry[]>();
  for (const f of files) {
    const cat = f.category;
    if (!map.has(cat)) map.set(cat, []);
    map.get(cat)!.push(f);
  }
  const groups: { category: string; files: FileEntry[] }[] = [];
  // Root first, then alphabetical categories
  if (map.has('_root')) {
    groups.push({ category: '_root', files: map.get('_root')! });
    map.delete('_root');
  }
  for (const [category, items] of [...map.entries()].sort((a, b) => a[0].localeCompare(b[0]))) {
    groups.push({ category, files: items });
  }
  return groups;
}

/* ─── Sub-components ─────────────────────────────────────────────────── */

function TreeFileItem({
  name,
  selected,
  indent,
  hasChanges,
  onClick,
}: {
  name: string;
  selected: boolean;
  indent: number;
  /** When defined (diff mode), shows a change indicator dot. */
  hasChanges?: boolean;
  onClick: () => void;
}) {
  return (
    <button
      onClick={onClick}
      className={`flex w-full items-center gap-2 py-2 pr-3 text-left text-sm transition-all duration-150 truncate
        ${indent === 0 ? 'pl-4' : 'pl-9'}
        ${
          selected
            ? 'bg-indigo-50 text-indigo-700 font-medium border-l-2 border-indigo-500'
            : 'text-slate-600 hover:bg-slate-100/80 border-l-2 border-transparent'
        }
      `}
    >
      {hasChanges !== undefined ? (
        hasChanges ? (
          <span className="h-2 w-2 shrink-0 rounded-full bg-amber-500" />
        ) : (
          <span className="h-2 w-2 shrink-0 rounded-full bg-slate-300" />
        )
      ) : (
        <FileIcon small />
      )}
      <span className="truncate">{name}</span>
    </button>
  );
}

function FileIcon({ small }: { small?: boolean }) {
  const size = small ? 'h-3.5 w-3.5' : 'h-4 w-4';
  return (
    <svg className={`${size} shrink-0 text-slate-400`} fill="none" viewBox="0 0 24 24" strokeWidth={1.5} stroke="currentColor">
      <path
        strokeLinecap="round"
        strokeLinejoin="round"
        d="M19.5 14.25v-2.625a3.375 3.375 0 0 0-3.375-3.375h-1.5A1.125 1.125 0 0 1 13.5 7.125v-1.5a3.375 3.375 0 0 0-3.375-3.375H8.25m2.25 0H5.625c-.621 0-1.125.504-1.125 1.125v17.25c0 .621.504 1.125 1.125 1.125h12.75c.621 0 1.125-.504 1.125-1.125V11.25a9 9 0 0 0-9-9Z"
      />
    </svg>
  );
}

function FolderIcon() {
  return (
    <svg className="h-4 w-4 shrink-0 text-indigo-400" fill="none" viewBox="0 0 24 24" strokeWidth={1.5} stroke="currentColor">
      <path
        strokeLinecap="round"
        strokeLinejoin="round"
        d="M2.25 12.75V12A2.25 2.25 0 0 1 4.5 9.75h15A2.25 2.25 0 0 1 21.75 12v.75m-8.69-6.44-2.12-2.12a1.5 1.5 0 0 0-1.061-.44H4.5A2.25 2.25 0 0 0 2.25 6v12a2.25 2.25 0 0 0 2.25 2.25h15A2.25 2.25 0 0 0 21.75 18V9a2.25 2.25 0 0 0-2.25-2.25h-5.379a1.5 1.5 0 0 1-1.06-.44Z"
      />
    </svg>
  );
}
