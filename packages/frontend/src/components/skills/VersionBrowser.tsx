import { useState, useEffect } from 'react';
import type { SkillVersionSnapshot, SkillVersionSummary, SkillFileItem } from '@skillspell/shared';
import { fetchVersionHistory, fetchVersionSnapshot } from '../../services/api/index.js';
import SkillEditor from '../builder/SkillEditor.js';
import { formatDateWithPrefs } from '../../utils/formatDate.js';
import { useUserPreferences } from '../../hooks/useUserPreferences.js';
import { formatExplanation } from '../../utils/formatExplanation.js';

interface VersionBrowserProps {
  skillId: string;
  currentVersion: number;
  /** Version pinned from the URL — auto-select and highlight it. */
  pinnedVersion?: number;
}

/** Represents a selectable file entry in the tree. */
interface FileEntry {
  key: string;
  name: string;
  category: string;
  content: string;
}

export default function VersionBrowser({
  skillId,
  currentVersion,
  pinnedVersion,
}: VersionBrowserProps) {
  const { prefs } = useUserPreferences();
  const [versions, setVersions] = useState<SkillVersionSummary[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const [selectedVersion, setSelectedVersion] = useState<number | null>(null);
  const [snapshot, setSnapshot] = useState<SkillVersionSnapshot | null>(null);
  const [snapshotLoading, setSnapshotLoading] = useState(false);

  const [selectedKey, setSelectedKey] = useState<string>('skill.md');
  const [collapsedGroups, setCollapsedGroups] = useState<Set<string>>(new Set());
  const [explanationCollapsed, setExplanationCollapsed] = useState(true);

  // Load version history
  useEffect(() => {
    let cancelled = false;
    setLoading(true);
    setError(null);

    fetchVersionHistory(skillId)
      .then((data) => {
        if (cancelled) return;
        setVersions(data);
        // Default to the pinned version (from URL) or the latest version
        if (pinnedVersion != null && data.some((v) => v.version === pinnedVersion)) {
          setSelectedVersion(pinnedVersion);
        } else if (data.length > 0) {
          setSelectedVersion(data[data.length - 1].version);
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
  }, [skillId]);

  // Load snapshot when selected version changes
  useEffect(() => {
    if (selectedVersion === null) return;

    let cancelled = false;
    setSnapshotLoading(true);

    fetchVersionSnapshot(skillId, selectedVersion)
      .then((data) => {
        if (!cancelled) setSnapshot(data);
      })
      .catch((err) => {
        if (!cancelled) {
          setError(err instanceof Error ? err.message : 'Failed to load version snapshot');
        }
      })
      .finally(() => {
        if (!cancelled) setSnapshotLoading(false);
      });

    return () => { cancelled = true; };
  }, [skillId, selectedVersion]);

  const files = snapshot ? buildFileList(snapshot) : [];
  const groups = groupFiles(files);
  const selectedFile = files.find((f) => f.key === selectedKey) ?? files[0] ?? null;

  const toggleGroup = (group: string) => {
    setCollapsedGroups((prev) => {
      const next = new Set(prev);
      if (next.has(group)) next.delete(group);
      else next.add(group);
      return next;
    });
  };

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

  if (versions.length === 0) {
    return (
      <div className="flex h-full flex-col items-center justify-center gap-5 p-6 animate-fade-in-up">
        <div className="flex h-16 w-16 items-center justify-center rounded-2xl bg-slate-100">
          <svg className="h-8 w-8 text-slate-400" fill="none" viewBox="0 0 24 24" strokeWidth={1.5} stroke="currentColor">
            <path strokeLinecap="round" strokeLinejoin="round" d="M12 6v6h4.5m4.5 0a9 9 0 1 1-18 0 9 9 0 0 1 18 0Z" />
          </svg>
        </div>
        <h4 className="text-base font-bold text-slate-700">No version history yet</h4>
        <p className="text-sm text-slate-500 text-center max-w-md leading-relaxed">
          Version snapshots are created automatically when you optimize or refine a skill.
        </p>
      </div>
    );
  }

  const currentVersionSummary = versions.find((v) => v.version === selectedVersion);

  return (
    <div className="flex h-full flex-col">
      {/* Header bar */}
      <div className="shrink-0 border-b border-slate-200/80 bg-white px-6 py-5">
        <div className="flex items-center gap-3 mb-4">
          <div className="flex h-9 w-9 items-center justify-center rounded-xl bg-indigo-50">
            <svg className="h-5 w-5 text-indigo-600" fill="none" viewBox="0 0 24 24" strokeWidth={2} stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" d="M12 6v6h4.5m4.5 0a9 9 0 1 1-18 0 9 9 0 0 1 18 0Z" />
            </svg>
          </div>
          <h3 className="text-lg font-bold text-slate-800">Version History</h3>
        </div>

        {/* Version selector */}
        <div className="flex items-center gap-3">
          <label className="text-[10px] font-bold text-slate-400 uppercase tracking-widest">Version</label>
          <select
            aria-label="Select version"
            value={selectedVersion ?? ''}
            onChange={(e) => setSelectedVersion(Number(e.target.value))}
            className="rounded-xl border border-slate-200 bg-white px-3 py-2 text-sm font-medium text-slate-700 focus:border-indigo-400 focus:outline-none focus:ring-1 focus:ring-indigo-500/30 transition-all duration-200"
          >
            {versions.map((v) => (
              <option key={v.version} value={v.version}>
                v{v.version} — {v.explanation ? v.explanation.slice(0, 50) : 'Initial version'} ({formatDateWithPrefs(v.createdAt, prefs)})
                {v.version === currentVersion ? ' (current)' : ''}
              </option>
            ))}
          </select>

          {currentVersionSummary && (
            <div className="ml-3 flex items-center gap-2">
              <span className={`rounded-full px-2.5 py-1 text-xs font-semibold ${
                selectedVersion === currentVersion
                  ? 'bg-emerald-50 text-emerald-700'
                  : 'bg-amber-50 text-amber-700'
              }`}>
                {selectedVersion === currentVersion ? 'Current' : 'Historical'}
              </span>
            </div>
          )}
        </div>

        {/* Version timeline */}
        <div className="mt-4 flex items-center gap-1.5 overflow-x-auto py-1">
          {versions.map((v) => (
            <button
              key={v.version}
              onClick={() => setSelectedVersion(v.version)}
              className={`shrink-0 rounded-full px-3 py-1.5 text-xs font-semibold transition-all duration-200 ${
                v.version === selectedVersion
                  ? 'bg-indigo-600 text-white shadow-lg shadow-indigo-500/20'
                  : v.version === pinnedVersion
                    ? 'bg-amber-100 text-amber-800 ring-1 ring-amber-300 hover:bg-amber-200'
                    : v.version === currentVersion
                      ? 'bg-emerald-50 text-emerald-700 hover:bg-emerald-100'
                      : 'bg-slate-100 text-slate-600 hover:bg-slate-200'
              }`}
              title={`v${v.version}${v.version === pinnedVersion ? ' (viewing)' : ''} — ${v.explanation ? v.explanation.slice(0, 50) : 'Initial version'}`}
            >
              v{v.version}{v.version === pinnedVersion && v.version !== selectedVersion ? ' ◆' : ''}
            </button>
          ))}
        </div>

        {/* Version metadata */}
        {currentVersionSummary && (
          <div className="mt-2.5 text-xs text-slate-400 leading-relaxed">
            <span>{currentVersionSummary.description.substring(0, 120)}{currentVersionSummary.description.length > 120 ? '…' : ''}</span>
          </div>
        )}

        {/* Optimization explanation — collapsible */}
        {currentVersionSummary?.explanation && (
          <div className="mt-3 rounded-xl border border-indigo-100 bg-indigo-50/50">
            <button
              onClick={() => setExplanationCollapsed(!explanationCollapsed)}
              className="flex w-full items-center gap-2 p-3 text-left hover:bg-indigo-50/80 transition-colors rounded-xl"
            >
              <svg className="h-4 w-4 shrink-0 text-indigo-500" fill="none" viewBox="0 0 24 24" strokeWidth={1.5} stroke="currentColor">
                <path strokeLinecap="round" strokeLinejoin="round" d="M9.813 15.904 9 18.75l-.813-2.846a4.5 4.5 0 0 0-3.09-3.09L2.25 12l2.846-.813a4.5 4.5 0 0 0 3.09-3.09L9 5.25l.813 2.846a4.5 4.5 0 0 0 3.09 3.09L15.75 12l-2.846.813a4.5 4.5 0 0 0-3.09 3.09Z" />
              </svg>
              <span className="text-[10px] font-bold text-indigo-500 uppercase tracking-widest">What changed</span>
              <svg className={`ml-auto h-3.5 w-3.5 shrink-0 text-indigo-400 transition-transform duration-200 ${explanationCollapsed ? '' : 'rotate-180'}`} fill="none" viewBox="0 0 24 24" strokeWidth={2.5} stroke="currentColor">
                <path strokeLinecap="round" strokeLinejoin="round" d="m19.5 8.25-7.5 7.5-7.5-7.5" />
              </svg>
            </button>
            {!explanationCollapsed && (
              <div className="px-3.5 pb-3.5 pt-0">
                <p className="text-sm text-slate-700 leading-relaxed whitespace-pre-wrap">{formatExplanation(currentVersionSummary.explanation)}</p>
              </div>
            )}
          </div>
        )}
      </div>

      {/* File browser */}
      {snapshotLoading ? (
        <div className="flex flex-1 items-center justify-center">
          <div className="h-10 w-10 animate-spin-ease rounded-full border-[3px] border-indigo-200 border-t-indigo-600" />
        </div>
      ) : (
        <div className="flex flex-1 overflow-hidden">
          {/* Left: File tree */}
          <div className="w-60 shrink-0 border-r border-slate-200/80 bg-slate-50/50 overflow-y-auto">
            <div className="px-4 py-2.5 border-b border-slate-200/60">
              <span className="text-[10px] font-bold text-slate-400 uppercase tracking-widest">Files</span>
            </div>
            <nav className="py-1">
              {groups.map((group) => {
                if (group.category === '_root') {
                  return group.files.map((file) => (
                    <TreeFileItem
                      key={file.key}
                      name={file.name}
                      selected={file.key === (selectedFile?.key ?? '')}
                      indent={0}
                      onClick={() => setSelectedKey(file.key)}
                    />
                  ));
                }

                const isCollapsed = collapsedGroups.has(group.category);
                return (
                  <div key={group.category}>
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
                    {!isCollapsed &&
                      group.files.map((file) => (
                        <TreeFileItem
                          key={file.key}
                          name={file.name}
                          selected={file.key === (selectedFile?.key ?? '')}
                          indent={1}
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
                <div className="flex items-center gap-2 border-b border-slate-200/60 bg-slate-50/50 px-4 py-2.5">
                  <FileIcon />
                  <span className="text-sm font-medium text-slate-700 truncate">
                    {selectedFile.category !== '_root'
                      ? `${selectedFile.category.toLowerCase()}/${selectedFile.name}`
                      : selectedFile.name}
                  </span>
                  <span className="ml-auto text-xs font-medium text-slate-400">v{selectedVersion}</span>
                </div>
                <div className="flex-1 overflow-auto p-4">
                  {selectedFile.key === 'skill.md' ? (
                    <SkillEditor value={selectedFile.content} readOnly />
                  ) : (
                    <pre className="whitespace-pre-wrap text-sm text-slate-700 font-mono leading-relaxed">
                      {selectedFile.content}
                    </pre>
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
      )}
    </div>
  );
}

/* ─── Helpers ────────────────────────────────────────────────────────── */

function buildFileList(snapshot: SkillVersionSnapshot): FileEntry[] {
  const entries: FileEntry[] = [];

  entries.push({
    key: 'skill.md',
    name: 'SKILL.md',
    category: '_root',
    content: snapshot.skillContent,
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

  if (snapshot.references.length > 0) addItems(snapshot.references, 'References');
  if (snapshot.scripts.length > 0) addItems(snapshot.scripts, 'Scripts');
  if (snapshot.assets.length > 0) addItems(snapshot.assets, 'Assets');

  return entries;
}

function groupFiles(files: FileEntry[]): { category: string; files: FileEntry[] }[] {
  const map = new Map<string, FileEntry[]>();
  for (const f of files) {
    const cat = f.category;
    if (!map.has(cat)) map.set(cat, []);
    map.get(cat)!.push(f);
  }
  const groups: { category: string; files: FileEntry[] }[] = [];
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
  onClick,
}: {
  name: string;
  selected: boolean;
  indent: number;
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
      <FileIcon small />
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
