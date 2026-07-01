import { useState } from 'react';
import Markdown from 'react-markdown';
import remarkGfm from 'remark-gfm';
import remarkFrontmatter from 'remark-frontmatter';
import type { EvalOutputFile as OutputFileType } from '@skillspell/shared';
import MarkdownToggleViewer from '../common/MarkdownToggleViewer.js';
import CodeViewer from '../common/CodeViewer.js';

interface EvalOutputFileProps {
  file: OutputFileType;
}

/** Check if a filename is a markdown file */
function isMarkdownFile(name: string): boolean {
  return name.toLowerCase().endsWith('.md');
}

/** Check if a filename is a YAML file */
function isYamlFile(name: string): boolean {
  const lower = name.toLowerCase();
  return lower.endsWith('.yaml') || lower.endsWith('.yml');
}

/** Check if a filename is a known code/text file */
function isCodeFile(name: string): boolean {
  const codeExts = [
    '.js', '.jsx', '.ts', '.tsx', '.py', '.rb', '.go', '.rs', '.java',
    '.kt', '.swift', '.c', '.cpp', '.h', '.cs', '.php', '.sh', '.bash',
    '.zsh', '.ps1', '.bat', '.cmd', '.html', '.htm', '.css', '.scss',
    '.sass', '.less', '.json', '.xml', '.toml', '.ini', '.sql',
    '.graphql', '.gql', '.tf', '.hcl', '.lua', '.r', '.dart',
    '.ex', '.exs', '.erl', '.hs', '.zig',
  ];
  const lower = name.toLowerCase();
  return codeExts.some(ext => lower.endsWith(ext)) || isYamlFile(name);
}

/**
 * Renders an eval output file inline based on its type.
 * Supports markdown (with toggle), code (with syntax highlighting),
 * text, images, PDFs, and binary downloads.
 */
export function EvalOutputFile({ file }: EvalOutputFileProps) {
  switch (file.type) {
    case 'text':
      return (
        <div className="rounded-xl border border-slate-200 bg-white overflow-hidden">
          <div className="flex items-center gap-2 border-b border-slate-200/60 bg-slate-50/80 px-4 py-2.5">
            <FileTypeIcon type="text" />
            <span className="text-sm font-medium text-slate-600 truncate">{file.filename}</span>
            <span className="ml-auto rounded-full bg-slate-100 px-2 py-0.5 text-[10px] font-medium text-slate-500">
              {formatFileSize(file.size)}
            </span>
          </div>
          <div className="p-4">
            {isMarkdownFile(file.filename) ? (
              <MarkdownToggleViewer content={file.content ?? ''} />
            ) : isCodeFile(file.filename) ? (
              <CodeViewer content={file.content ?? ''} filename={file.filename} />
            ) : (
              <TextContentViewer content={file.content ?? ''} />
            )}
          </div>
        </div>
      );

    case 'image':
      return (
        <div className="rounded-xl border border-slate-200 bg-white overflow-hidden">
          <div className="flex items-center gap-2 border-b border-slate-200/60 bg-slate-50/80 px-4 py-2.5">
            <FileTypeIcon type="image" />
            <span className="text-sm font-medium text-slate-600 truncate">{file.filename}</span>
            <span className="ml-auto rounded-full bg-slate-100 px-2 py-0.5 text-[10px] font-medium text-slate-500">
              {formatFileSize(file.size)}
            </span>
          </div>
          <div className="p-4">
            <img
              src={`data:${file.mimeType};base64,${file.base64}`}
              alt={file.filename}
              className="max-w-full rounded-xl border border-slate-200"
            />
          </div>
        </div>
      );

    case 'pdf':
      return (
        <div className="rounded-xl border border-slate-200 bg-white overflow-hidden">
          <div className="flex items-center gap-2 border-b border-slate-200/60 bg-slate-50/80 px-4 py-2.5">
            <FileTypeIcon type="pdf" />
            <span className="text-sm font-medium text-slate-600 truncate">{file.filename}</span>
            <span className="ml-auto rounded-full bg-slate-100 px-2 py-0.5 text-[10px] font-medium text-slate-500">
              {formatFileSize(file.size)}
            </span>
          </div>
          <div className="p-4">
            <iframe
              src={`data:${file.mimeType};base64,${file.base64}`}
              className="w-full h-96 rounded-xl border border-slate-200"
              title={file.filename}
            />
          </div>
        </div>
      );

    case 'binary':
    default:
      return (
        <div className="rounded-xl border border-slate-200 bg-white p-4 flex items-center justify-between">
          <div className="flex items-center gap-3">
            <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-slate-100">
              <FileTypeIcon type="binary" />
            </div>
            <div>
              <div className="text-sm font-medium text-slate-700">{file.filename}</div>
              <div className="text-xs text-slate-500">{formatFileSize(file.size)}</div>
            </div>
          </div>
          <button
            onClick={() => downloadFile(file)}
            className="flex items-center gap-1.5 rounded-xl bg-gradient-to-r from-indigo-600 to-purple-600 px-3.5 py-2 text-sm font-semibold text-white shadow-lg shadow-indigo-500/20 hover:shadow-xl hover:brightness-110 transition-all duration-200"
            aria-label={`Download ${file.filename}`}
          >
            <svg className="h-4 w-4" fill="none" viewBox="0 0 24 24" strokeWidth={2} stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" d="M3 16.5v2.25A2.25 2.25 0 0 0 5.25 21h13.5A2.25 2.25 0 0 0 21 18.75V16.5M16.5 12 12 16.5m0 0L7.5 12m4.5 4.5V3" />
            </svg>
            Download
          </button>
        </div>
      );
  }
}

/* ─── Text Content Viewer with Source/Preview Toggle ──────────────────── */

function TextContentViewer({ content }: { content: string }) {
  const [viewMode, setViewMode] = useState<'source' | 'rendered'>('source');

  // Check if content has markdown-like formatting
  const hasMarkdownContent = /[#*`\-[\]|>]/.test(content);

  if (!hasMarkdownContent) {
    return (
      <pre className="whitespace-pre-wrap text-sm font-mono text-slate-700 leading-relaxed">
        {content}
      </pre>
    );
  }

  return (
    <div className="flex flex-col">
      {/* Toggle bar */}
      <div className="flex items-center justify-end gap-1 pb-3">
        <div className="inline-flex rounded-lg border border-slate-200 bg-slate-50 p-0.5">
          <button
            onClick={() => setViewMode('source')}
            className={`flex items-center gap-1.5 rounded-md px-3 py-1.5 text-xs font-medium transition-all duration-200 ${
              viewMode === 'source'
                ? 'bg-white text-slate-800 shadow-sm'
                : 'text-slate-500 hover:text-slate-700'
            }`}
            aria-label="View raw source"
            title="View raw source"
          >
            <svg className="h-3.5 w-3.5" fill="none" viewBox="0 0 24 24" strokeWidth={2} stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" d="M17.25 6.75 22.5 12l-5.25 5.25m-10.5 0L1.5 12l5.25-5.25m7.5-3-4.5 16.5" />
            </svg>
            Source
          </button>
          <button
            onClick={() => setViewMode('rendered')}
            className={`flex items-center gap-1.5 rounded-md px-3 py-1.5 text-xs font-medium transition-all duration-200 ${
              viewMode === 'rendered'
                ? 'bg-white text-slate-800 shadow-sm'
                : 'text-slate-500 hover:text-slate-700'
            }`}
            aria-label="View rendered preview"
            title="View rendered preview"
          >
            <svg className="h-3.5 w-3.5" fill="none" viewBox="0 0 24 24" strokeWidth={2} stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" d="M2.036 12.322a1.012 1.012 0 0 1 0-.639C3.423 7.51 7.36 4.5 12 4.5c4.638 0 8.573 3.007 9.963 7.178.07.207.07.431 0 .639C20.577 16.49 16.64 19.5 12 19.5c-4.638 0-8.573-3.007-9.963-7.178Z" />
              <path strokeLinecap="round" strokeLinejoin="round" d="M15 12a3 3 0 1 1-6 0 3 3 0 0 1 6 0Z" />
            </svg>
            Preview
          </button>
        </div>
      </div>

      {viewMode === 'rendered' ? (
        <div className="markdown-body overflow-auto rounded-xl border border-slate-200 bg-white p-5">
          <Markdown remarkPlugins={[remarkGfm, remarkFrontmatter]}>
            {content}
          </Markdown>
        </div>
      ) : (
        <pre className="overflow-auto whitespace-pre-wrap rounded-xl border border-slate-200 bg-slate-50/80 p-5 font-mono text-sm text-slate-700 leading-relaxed">
          {content}
        </pre>
      )}
    </div>
  );
}

/* ─── Helpers ────────────────────────────────────────────────────────── */

function formatFileSize(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}

function downloadFile(file: OutputFileType) {
  const link = document.createElement('a');
  link.href = `data:${file.mimeType};base64,${file.base64}`;
  link.download = file.filename;
  document.body.appendChild(link);
  link.click();
  document.body.removeChild(link);
}

/* ─── Sub-components ─────────────────────────────────────────────────── */

function FileTypeIcon({ type }: { type: 'text' | 'image' | 'pdf' | 'binary' }) {
  const iconClass = 'h-4 w-4 shrink-0 text-slate-400';

  switch (type) {
    case 'text':
      return (
        <svg className={iconClass} fill="none" viewBox="0 0 24 24" strokeWidth={1.5} stroke="currentColor">
          <path strokeLinecap="round" strokeLinejoin="round" d="M19.5 14.25v-2.625a3.375 3.375 0 0 0-3.375-3.375h-1.5A1.125 1.125 0 0 1 13.5 7.125v-1.5a3.375 3.375 0 0 0-3.375-3.375H8.25m2.25 0H5.625c-.621 0-1.125.504-1.125 1.125v17.25c0 .621.504 1.125 1.125 1.125h12.75c.621 0 1.125-.504 1.125-1.125V11.25a9 9 0 0 0-9-9Z" />
        </svg>
      );
    case 'image':
      return (
        <svg className={iconClass} fill="none" viewBox="0 0 24 24" strokeWidth={1.5} stroke="currentColor">
          <path strokeLinecap="round" strokeLinejoin="round" d="m2.25 15.75 5.159-5.159a2.25 2.25 0 0 1 3.182 0l5.159 5.159m-1.5-1.5 1.409-1.409a2.25 2.25 0 0 1 3.182 0l2.909 2.909M3.75 21h16.5A2.25 2.25 0 0 0 22.5 18.75V5.25A2.25 2.25 0 0 0 20.25 3H3.75A2.25 2.25 0 0 0 1.5 5.25v13.5A2.25 2.25 0 0 0 3.75 21Z" />
        </svg>
      );
    case 'pdf':
      return (
        <svg className={iconClass} fill="none" viewBox="0 0 24 24" strokeWidth={1.5} stroke="currentColor">
          <path strokeLinecap="round" strokeLinejoin="round" d="M19.5 14.25v-2.625a3.375 3.375 0 0 0-3.375-3.375h-1.5A1.125 1.125 0 0 1 13.5 7.125v-1.5a3.375 3.375 0 0 0-3.375-3.375H8.25m.75 12 3 3m0 0 3-3m-3 3v-6m-1.5-9H5.625c-.621 0-1.125.504-1.125 1.125v17.25c0 .621.504 1.125 1.125 1.125h12.75c.621 0 1.125-.504 1.125-1.125V11.25a9 9 0 0 0-9-9Z" />
        </svg>
      );
    case 'binary':
    default:
      return (
        <svg className={iconClass} fill="none" viewBox="0 0 24 24" strokeWidth={1.5} stroke="currentColor">
          <path strokeLinecap="round" strokeLinejoin="round" d="M20.25 7.5l-.625 10.632a2.25 2.25 0 0 1-2.247 2.118H6.622a2.25 2.25 0 0 1-2.247-2.118L3.75 7.5m8.25 3v6.75m0 0-3-3m3 3 3-3M3.375 7.5h17.25c.621 0 1.125-.504 1.125-1.125v-1.5c0-.621-.504-1.125-1.125-1.125H3.375c-.621 0-1.125.504-1.125 1.125v1.5c0 .621.504 1.125 1.125 1.125Z" />
        </svg>
      );
  }
}
