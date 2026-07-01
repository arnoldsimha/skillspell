import { useState, useEffect, useMemo } from 'react';
import ReactDiffViewer, { DiffMethod } from 'react-diff-viewer-continued';
import type { SkillVersionSnapshot, SkillVersionSummary, SkillFileItem } from '@skillspell/shared';
import { fetchVersionHistory, fetchVersionSnapshot } from '../../services/api/index.js';
import { formatDateWithPrefs } from '../../utils/formatDate.js';
import { useUserPreferences } from '../../hooks/useUserPreferences.js';

interface VersionDiffViewerProps {
  skillId: string;
  currentVersion?: number;
  /** Version pinned from the URL — pre-select as left side of comparison. */
  pinnedVersion?: number;
  /**
   * When true, versions are fixed to pinnedVersion→currentVersion and dropdowns are hidden.
   * Used by the admin review flow where the comparison pair is always determined by the caller.
   */
  locked?: boolean;
}

/** Represents a diffable file entry. */
interface DiffFileEntry {
  key: string;
  name: string;
  category: string;
}

/** Build a flat list of file keys from a snapshot. */
function getFileKeys(snapshot: SkillVersionSnapshot): DiffFileEntry[] {
  const entries: DiffFileEntry[] = [];
  entries.push({ key: 'skill.md', name: 'SKILL.md', category: '_root' });

  const addItems = (items: SkillFileItem[], category: string) => {
    items.forEach((item) => {
      entries.push({
        key: `${category}/${item.name}`,
        name: item.name,
        category,
      });
    });
  };

  if (snapshot.references.length > 0) addItems(snapshot.references, 'References');
  if (snapshot.scripts.length > 0) addItems(snapshot.scripts, 'Scripts');
  if (snapshot.assets.length > 0) addItems(snapshot.assets, 'Assets');

  return entries;
}

/** Get file content from a snapshot by key. */
function getFileContent(snapshot: SkillVersionSnapshot, key: string): string {
  if (key === 'skill.md') return snapshot.skillContent;

  const [category, ...nameParts] = key.split('/');
  const name = nameParts.join('/');

  let items: SkillFileItem[] = [];
  if (category === 'References') items = snapshot.references;
  else if (category === 'Scripts') items = snapshot.scripts;
  else if (category === 'Assets') items = snapshot.assets;

  return items.find((i) => i.name === name)?.content ?? '';
}

/** Merge file lists from two snapshots, preserving order. */
function mergeFileKeys(
  leftSnap: SkillVersionSnapshot | null,
  rightSnap: SkillVersionSnapshot | null,
): DiffFileEntry[] {
  const seen = new Set<string>();
  const result: DiffFileEntry[] = [];

  const addUnique = (entries: DiffFileEntry[]) => {
    for (const entry of entries) {
      if (!seen.has(entry.key)) {
        seen.add(entry.key);
        result.push(entry);
      }
    }
  };

  if (leftSnap) addUnique(getFileKeys(leftSnap));
  if (rightSnap) addUnique(getFileKeys(rightSnap));

  return result;
}

export default function VersionDiffViewer({
  skillId,
  pinnedVersion,
  currentVersion,
  locked = false,
}: VersionDiffViewerProps) {
  const { prefs } = useUserPreferences();
  const [versions, setVersions] = useState<SkillVersionSummary[]>([]);
  const [loading, setLoading] = useState(!locked);
  const [error, setError] = useState<string | null>(null);

  const [leftVersion, setLeftVersion] = useState<number | null>(locked && pinnedVersion != null ? pinnedVersion : null);
  const [rightVersion, setRightVersion] = useState<number | null>(locked && currentVersion != null ? currentVersion : null);

  const [leftSnapshot, setLeftSnapshot] = useState<SkillVersionSnapshot | null>(null);
  const [rightSnapshot, setRightSnapshot] = useState<SkillVersionSnapshot | null>(null);
  const [snapshotLoading, setSnapshotLoading] = useState(false);

  const [selectedFile, setSelectedFile] = useState<string>('skill.md');
  const [splitView, setSplitView] = useState(true);

  // Load version history (skipped in locked mode — versions are fixed)
  useEffect(() => {
    if (locked) return;

    let cancelled = false;
    setLoading(true);
    setError(null);

    fetchVersionHistory(skillId)
      .then((data) => {
        if (cancelled) return;
        setVersions(data);
        // Default: if pinned version set, compare pinned vs latest; otherwise last two
        if (pinnedVersion != null && data.some((v) => v.version === pinnedVersion)) {
          setLeftVersion(pinnedVersion);
          setRightVersion(data[data.length - 1].version);
        } else if (data.length >= 2) {
          setLeftVersion(data[data.length - 2].version);
          setRightVersion(data[data.length - 1].version);
        } else if (data.length === 1) {
          setLeftVersion(data[0].version);
          setRightVersion(data[0].version);
        }
      })
      .catch((err) => {
        if (!cancelled) {
          setError(err instanceof Error ? err.message : 'Failed to load version history');
        }
      })
      .finally(() => {
        if (!cancelled) setLoading(false);
      });

    return () => { cancelled = true; };
  }, [skillId, locked]);

  // Load snapshots when versions change
  useEffect(() => {
    if (leftVersion === null || rightVersion === null) return;

    let cancelled = false;
    setSnapshotLoading(true);

    Promise.all([
      fetchVersionSnapshot(skillId, leftVersion),
      fetchVersionSnapshot(skillId, rightVersion),
    ])
      .then(([left, right]) => {
        if (cancelled) return;
        setLeftSnapshot(left);
        setRightSnapshot(right);
      })
      .catch((err) => {
        if (!cancelled) {
          setError(err instanceof Error ? err.message : 'Failed to load version snapshots');
        }
      })
      .finally(() => {
        if (!cancelled) setSnapshotLoading(false);
      });

    return () => { cancelled = true; };
  }, [skillId, leftVersion, rightVersion]);

  // Merged file list from both snapshots
  const fileEntries = useMemo(
    () => mergeFileKeys(leftSnapshot, rightSnapshot),
    [leftSnapshot, rightSnapshot],
  );

  // Auto-select first file if selected file doesn't exist
  useEffect(() => {
    if (fileEntries.length > 0 && !fileEntries.find((f) => f.key === selectedFile)) {
      setSelectedFile(fileEntries[0].key);
    }
  }, [fileEntries, selectedFile]);

  const leftContent = leftSnapshot ? getFileContent(leftSnapshot, selectedFile) : '';
  const rightContent = rightSnapshot ? getFileContent(rightSnapshot, selectedFile) : '';

  // Determine which files have changes
  const changedFiles = useMemo(() => {
    if (!leftSnapshot || !rightSnapshot) return new Set<string>();
    const changed = new Set<string>();
    for (const entry of fileEntries) {
      const l = getFileContent(leftSnapshot, entry.key);
      const r = getFileContent(rightSnapshot, entry.key);
      if (l !== r) changed.add(entry.key);
    }
    return changed;
  }, [leftSnapshot, rightSnapshot, fileEntries]);

  if (loading) {
    return (
      <div className="flex h-full items-center justify-center">
        <div className="h-10 w-10 animate-spin-ease rounded-full border-[3px] border-indigo-200 border-t-indigo-600" />
      </div>
    );
  }

  if (error) {
    return (
      <div className="flex h-full flex-col items-center justify-center gap-4 p-6">
        <div className="flex h-12 w-12 items-center justify-center rounded-xl bg-red-50">
          <svg className="h-6 w-6 text-red-500" fill="none" viewBox="0 0 24 24" strokeWidth={1.5} stroke="currentColor">
            <path strokeLinecap="round" strokeLinejoin="round" d="M12 9v3.75m9-.75a9 9 0 1 1-18 0 9 9 0 0 1 18 0Zm-9 3.75h.008v.008H12v-.008Z" />
          </svg>
        </div>
        <p className="text-red-600 text-sm">{error}</p>
      </div>
    );
  }

  if (locked && (leftVersion === null || rightVersion === null)) {
    return (
      <div className="flex h-full items-center justify-center text-sm text-red-500">
        Version information unavailable for diff
      </div>
    );
  }

  if (!locked && versions.length < 2) {
    return (
      <div className="flex h-full flex-col items-center justify-center gap-5 p-6 animate-fade-in-up">
        <div className="flex h-16 w-16 items-center justify-center rounded-2xl bg-slate-100">
          <svg className="h-8 w-8 text-slate-400" fill="none" viewBox="0 0 24 24" strokeWidth={1.5} stroke="currentColor">
            <path strokeLinecap="round" strokeLinejoin="round" d="M12 6v6h4.5m4.5 0a9 9 0 1 1-18 0 9 9 0 0 1 18 0Z" />
          </svg>
        </div>
        <h4 className="text-base font-bold text-slate-700">
          {versions.length === 0 ? 'No version history yet' : 'Only one version recorded'}
        </h4>
        <p className="text-sm text-slate-500 text-center max-w-md leading-relaxed">
          {versions.length === 0
            ? 'Version snapshots are created automatically when you optimize or refine a skill. Optimize this skill to start tracking changes.'
            : `Only version ${versions[0].version} has been recorded so far. Optimize or refine the skill one more time to create a second snapshot — then you can compare them side-by-side.`
          }
        </p>
      </div>
    );
  }

  return (
    <div className="flex h-full flex-col">
      {/* Header bar */}
      <div className="border-b border-slate-200/80 bg-white px-5 py-4">
        <div className="flex items-center gap-3">
          <div className="flex h-9 w-9 items-center justify-center rounded-xl bg-purple-50">
            <svg className="h-5 w-5 text-purple-600" fill="none" viewBox="0 0 24 24" strokeWidth={2} stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" d="M7.5 21 3 16.5m0 0L7.5 12M3 16.5h13.5m0-13.5L21 7.5m0 0L16.5 12M21 7.5H7.5" />
            </svg>
          </div>
          <h3 className="text-lg font-bold text-slate-800">Compare Versions</h3>
        </div>

        {/* Version selectors or locked label */}
        <div className="mt-4 flex flex-wrap items-center gap-3">
          {locked ? (
            <div className="flex items-center gap-2">
              <span className="rounded-lg bg-slate-100 px-3 py-1.5 text-sm font-semibold text-slate-600">
                v{leftVersion}
              </span>
              <div className="flex h-8 w-8 items-center justify-center rounded-lg bg-slate-100">
                <svg className="h-4 w-4 text-slate-400" fill="none" viewBox="0 0 24 24" strokeWidth={2} stroke="currentColor">
                  <path strokeLinecap="round" strokeLinejoin="round" d="M13.5 4.5 21 12m0 0-7.5 7.5M21 12H3" />
                </svg>
              </div>
              <span className="rounded-lg bg-indigo-50 px-3 py-1.5 text-sm font-semibold text-indigo-700">
                v{rightVersion} <span className="font-normal text-indigo-400">(pending)</span>
              </span>
            </div>
          ) : (
            <>
              <div className="flex items-center gap-2">
                <label className="text-[10px] font-bold text-slate-400 uppercase tracking-widest">From</label>
                <select
                  aria-label="From version"
                  value={leftVersion ?? ''}
                  onChange={(e) => setLeftVersion(Number(e.target.value))}
                  className="rounded-xl border border-slate-200 bg-white px-3 py-2 text-sm font-medium text-slate-700 focus:border-indigo-400 focus:outline-none focus:ring-1 focus:ring-indigo-500/30 transition-all duration-200"
                >
                  {versions.map((v) => (
                    <option key={v.version} value={v.version}>
                      v{v.version} — {v.explanation ? v.explanation.slice(0, 50) : 'Initial version'} ({formatDateWithPrefs(v.createdAt, prefs)})
                    </option>
                  ))}
                </select>
              </div>

              <div className="flex h-8 w-8 items-center justify-center rounded-lg bg-slate-100">
                <svg className="h-4 w-4 text-slate-400" fill="none" viewBox="0 0 24 24" strokeWidth={2} stroke="currentColor">
                  <path strokeLinecap="round" strokeLinejoin="round" d="M13.5 4.5 21 12m0 0-7.5 7.5M21 12H3" />
                </svg>
              </div>

              <div className="flex items-center gap-2">
                <label className="text-[10px] font-bold text-slate-400 uppercase tracking-widest">To</label>
                <select
                  aria-label="To version"
                  value={rightVersion ?? ''}
                  onChange={(e) => setRightVersion(Number(e.target.value))}
                  className="rounded-xl border border-slate-200 bg-white px-3 py-2 text-sm font-medium text-slate-700 focus:border-indigo-400 focus:outline-none focus:ring-1 focus:ring-indigo-500/30 transition-all duration-200"
                >
                  {versions.map((v) => (
                    <option key={v.version} value={v.version}>
                      v{v.version} — {v.explanation ? v.explanation.slice(0, 50) : 'Initial version'} ({formatDateWithPrefs(v.createdAt, prefs)})
                    </option>
                  ))}
                </select>
              </div>
            </>
          )}

          <div className="ml-auto flex items-center gap-2">
            <button
              type="button"
              onClick={() => setSplitView(!splitView)}
              className={`rounded-xl px-3.5 py-2 text-xs font-semibold transition-all duration-200 ${
                splitView
                  ? 'bg-indigo-50 text-indigo-700 hover:bg-indigo-100'
                  : 'bg-slate-100 text-slate-600 hover:bg-slate-200'
              }`}
            >
              {splitView ? 'Split View' : 'Unified View'}
            </button>
          </div>
        </div>
      </div>

      {/* Content area */}
      {snapshotLoading ? (
        <div className="flex flex-1 items-center justify-center">
          <div className="h-10 w-10 animate-spin-ease rounded-full border-[3px] border-indigo-200 border-t-indigo-600" />
        </div>
      ) : (
        <div className="flex flex-1 overflow-hidden">
          {/* File list sidebar */}
          <div className="w-56 shrink-0 border-r border-slate-200/80 bg-slate-50/50 overflow-y-auto">
            <div className="px-4 py-2.5 border-b border-slate-200/60">
              <span className="text-[10px] font-bold text-slate-400 uppercase tracking-widest">
                Files
              </span>
              {changedFiles.size > 0 && (
                <span className="ml-2 rounded-full bg-amber-100/80 px-2 py-0.5 text-[10px] font-semibold text-amber-700">
                  {changedFiles.size} changed
                </span>
              )}
            </div>
            <nav className="py-1">
              {fileEntries.map((entry) => {
                const hasChanges = changedFiles.has(entry.key);
                const isSelected = entry.key === selectedFile;

                return (
                  <button
                    type="button"
                    key={entry.key}
                    onClick={() => setSelectedFile(entry.key)}
                    className={`flex w-full items-center gap-2 px-4 py-2 text-left text-sm transition-all duration-150 truncate
                      ${isSelected
                        ? 'bg-indigo-50 text-indigo-700 font-medium border-l-2 border-indigo-500'
                        : 'text-slate-600 hover:bg-slate-100/80 border-l-2 border-transparent'
                      }`}
                  >
                    {hasChanges ? (
                      <span className="h-2 w-2 shrink-0 rounded-full bg-amber-500" />
                    ) : (
                      <span className="h-2 w-2 shrink-0 rounded-full bg-slate-300" />
                    )}
                    <span className="truncate">
                      {entry.category !== '_root' ? `${entry.category.toLowerCase()}/` : ''}
                      {entry.name}
                    </span>
                  </button>
                );
              })}
            </nav>
          </div>

          {/* Diff viewer */}
          <div className="flex-1 overflow-auto">
            {leftContent === rightContent ? (
              <div className="flex h-full items-center justify-center text-sm text-slate-400">
                <div className="text-center animate-fade-in-up">
                  <div className="flex h-12 w-12 items-center justify-center rounded-xl bg-emerald-50 mx-auto mb-3">
                    <svg className="h-6 w-6 text-emerald-500" fill="none" viewBox="0 0 24 24" strokeWidth={1.5} stroke="currentColor">
                      <path strokeLinecap="round" strokeLinejoin="round" d="m4.5 12.75 6 6 9-13.5" />
                    </svg>
                  </div>
                  No changes in this file between the selected versions
                </div>
              </div>
            ) : (
              <ReactDiffViewer
                oldValue={leftContent}
                newValue={rightContent}
                splitView={splitView}
                leftTitle={`v${leftVersion}`}
                rightTitle={`v${rightVersion}`}
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
            )}
          </div>
        </div>
      )}
    </div>
  );
}
