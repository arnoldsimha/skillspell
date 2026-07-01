/**
 * Shared file-tree components and utilities used across
 * SkillPreview, SkillDetail, and VersionBrowser.
 */

/* ─── Types ──────────────────────────────────────────────────────────── */

export interface FileEntry {
  key: string;
  name: string;
  category: string;
  content: string;
}

export interface FileGroup {
  category: string;
  files: FileEntry[];
}

/* ─── Utilities ──────────────────────────────────────────────────────── */

/**
 * Group a flat list of FileEntry items by category.
 * Root entries ('_root') come first, then alphabetical.
 */
// eslint-disable-next-line react-refresh/only-export-components
export function groupFiles(files: FileEntry[]): FileGroup[] {
  const map = new Map<string, FileEntry[]>();
  for (const f of files) {
    const cat = f.category;
    if (!map.has(cat)) map.set(cat, []);
    map.get(cat)!.push(f);
  }
  const groups: FileGroup[] = [];
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

export function TreeFileItem({
  name,
  selected,
  indent,
  hasChanges,
  onClick,
}: {
  name: string;
  selected: boolean;
  indent: number;
  /** When defined (diff mode), shows a change indicator dot instead of file icon. */
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

export function FileIcon({ small }: { small?: boolean }) {
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

export function FolderIcon() {
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
