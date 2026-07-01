import { useState, useEffect } from 'react';
import type { SkillVersionSnapshot, SkillFileItem } from '@skillspell/shared';
import { groupFiles, TreeFileItem, FileIcon, FolderIcon, type FileEntry } from '../common/FileTree.js';
import MarkdownToggleViewer, { SourcePreviewToggle } from '../common/MarkdownToggleViewer.js';
import CodeViewer from '../common/CodeViewer.js';
import { makeSkillLinkHandler } from '../../utils/skillFileUtils.js';

interface SkillFileBrowserProps {
  snapshot: SkillVersionSnapshot;
}

function isMarkdownFile(name: string): boolean {
  return name.toLowerCase().endsWith('.md');
}

function buildFileListFromSnapshot(snapshot: SkillVersionSnapshot): FileEntry[] {
  const entries: FileEntry[] = [];
  entries.push({ key: 'skill.md', name: 'SKILL.md', category: '_root', content: snapshot.skillContent });
  const addItems = (items: SkillFileItem[], category: string) => {
    items.forEach((item) => {
      entries.push({ key: `${category}/${item.name}`, name: item.name, category, content: item.content });
    });
  };
  if (snapshot.references.length > 0) addItems(snapshot.references, 'References');
  if (snapshot.scripts.length > 0) addItems(snapshot.scripts, 'Scripts');
  if (snapshot.assets.length > 0) addItems(snapshot.assets, 'Assets');
  return entries;
}

export default function SkillFileBrowser({ snapshot }: SkillFileBrowserProps) {
  const [selectedKey, setSelectedKey] = useState<string>('skill.md');
  const [collapsedGroups, setCollapsedGroups] = useState<Set<string>>(new Set());
  const [mdRendered, setMdRendered] = useState(true);

  // Reset to SKILL.md when the snapshot changes (e.g. user switches to a different version)
  useEffect(() => {
    setSelectedKey('skill.md');
  }, [snapshot]);

  const files = buildFileListFromSnapshot(snapshot);
  const groups = groupFiles(files);
  const selectedFile = files.find((f) => f.key === selectedKey) ?? files[0];
  const selectedIsMarkdown = selectedFile ? isMarkdownFile(selectedFile.name) : false;

  const toggleGroup = (group: string) => {
    setCollapsedGroups((prev) => {
      const next = new Set(prev);
      if (next.has(group)) next.delete(group);
      else next.add(group);
      return next;
    });
  };

  return (
    <div className="flex h-full overflow-hidden">
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
                  type="button"
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
              {selectedIsMarkdown && (
                <div className="ml-auto">
                  <SourcePreviewToggle rendered={mdRendered} onToggle={setMdRendered} />
                </div>
              )}
            </div>
            <div className="flex-1 overflow-auto p-4">
              {isMarkdownFile(selectedFile.name) ? (
                <MarkdownToggleViewer
                  content={selectedFile.content}
                  rendered={mdRendered}
                  onToggle={setMdRendered}
                  onLinkClick={makeSkillLinkHandler(files, setSelectedKey, setCollapsedGroups)}
                />
              ) : (
                <CodeViewer content={selectedFile.content} filename={selectedFile.name} />
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
  );
}
