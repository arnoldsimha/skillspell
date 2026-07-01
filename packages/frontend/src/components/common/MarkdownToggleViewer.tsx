import { useState, useMemo } from 'react';
import Markdown from 'react-markdown';
import remarkGfm from 'remark-gfm';
import remarkFrontmatter from 'remark-frontmatter';
import rehypeSanitize from 'rehype-sanitize';

interface MarkdownToggleViewerProps {
  content: string;
  /** When true, start in rendered markdown view. Default: true */
  defaultRendered?: boolean;
  /** Controlled mode: if provided, the parent controls the toggle state. */
  rendered?: boolean;
  /** Callback when the user toggles between source and preview (controlled mode). */
  onToggle?: (rendered: boolean) => void;
  /** Called when a relative link is clicked in the rendered markdown, instead of navigating. */
  onLinkClick?: (href: string) => void;
}

/** Parse YAML front matter into key-value pairs, supporting multi-line block scalars. */
function parseFrontmatter(raw: string): { meta: Record<string, string>; body: string } | null {
  const match = raw.match(/^---\r?\n([\s\S]*?)\r?\n---\r?\n?([\s\S]*)$/);
  if (!match) return null;

  const yamlBlock = match[1];
  const body = match[2];
  const meta: Record<string, string> = {};

  const lines = yamlBlock.split('\n');
  let currentKey = '';
  let currentValue = '';
  let isFoldedScalar = false;

  for (let i = 0; i < lines.length; i++) {
    const line = lines[i];
    const trimmed = line.replace(/\r$/, '');

    // Check if this is a continuation line (starts with whitespace and we have a current key)
    if (currentKey && /^\s+/.test(trimmed) && (isFoldedScalar || currentValue === '')) {
      // Continuation of a multi-line value
      const continuation = trimmed.trim();
      if (currentValue) {
        // For folded scalars (>), join with space; for literal (|), join with newline
        currentValue += isFoldedScalar ? ' ' + continuation : '\n' + continuation;
      } else {
        currentValue = continuation;
      }
      continue;
    }

    // Save previous key if we have one
    if (currentKey) {
      meta[currentKey] = currentValue;
      currentKey = '';
      currentValue = '';
      isFoldedScalar = false;
    }

    // Parse new key: value pair
    const colonIdx = trimmed.indexOf(':');
    if (colonIdx === -1) continue;

    const key = trimmed.slice(0, colonIdx).trim();
    let value = trimmed.slice(colonIdx + 1).trim();

    if (!key) continue;

    // Check for block scalar indicators
    if (value === '>' || value === '|') {
      isFoldedScalar = value === '>';
      currentKey = key;
      currentValue = '';
      continue;
    }

    // Strip surrounding quotes
    if ((value.startsWith('"') && value.endsWith('"')) || (value.startsWith("'") && value.endsWith("'"))) {
      value = value.slice(1, -1);
    }

    currentKey = key;
    currentValue = value;
  }

  // Don't forget the last key
  if (currentKey) {
    meta[currentKey] = currentValue;
  }

  return { meta, body };
}

/**
 * Displays markdown content with a toggle between raw source and rendered preview.
 *
 * Supports two modes:
 * - **Uncontrolled** (default): manages its own toggle state via `defaultRendered`.
 * - **Controlled**: when `rendered` prop is provided, the parent controls the view mode.
 *   In controlled mode, the internal toggle bar is hidden — the parent renders the toggle elsewhere.
 */
export default function MarkdownToggleViewer({
  content,
  defaultRendered = true,
  rendered: controlledRendered,
  onToggle,
  onLinkClick,
}: MarkdownToggleViewerProps) {
  const [internalRendered, setInternalRendered] = useState(defaultRendered);

  const isControlled = controlledRendered !== undefined;
  const rendered = isControlled ? controlledRendered : internalRendered;

  const handleToggle = (value: boolean) => {
    if (isControlled) {
      onToggle?.(value);
    } else {
      setInternalRendered(value);
    }
  };

  const parsed = useMemo(() => parseFrontmatter(content), [content]);

  return (
    <div className="flex h-full flex-col">
      {/* Toggle bar — only shown in uncontrolled mode */}
      {!isControlled && (
        <div className="flex items-center justify-end gap-1 pb-3">
          <SourcePreviewToggle rendered={rendered} onToggle={handleToggle} />
        </div>
      )}

      {/* Content */}
      {rendered ? (
        <div className="markdown-body flex-1 overflow-auto rounded-xl border border-slate-200 bg-white p-5">
          {/* Render YAML front matter as a table like GitHub */}
          {parsed && Object.keys(parsed.meta).length > 0 && (
            <table className="frontmatter-table">
              <tbody>
                {Object.entries(parsed.meta).map(([key, value]) => (
                  <tr key={key}>
                    <td className="font-semibold text-slate-600">{key}</td>
                    <td>{value}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
          <Markdown
            remarkPlugins={[remarkGfm, remarkFrontmatter]}
            rehypePlugins={[rehypeSanitize]}
            components={onLinkClick ? {
              // eslint-disable-next-line @typescript-eslint/no-unused-vars
              a: ({ href, children, node: _node }) => {
                const isRelative = href && !href.startsWith('http') && !href.startsWith('#') && !href.startsWith('//') && !href.startsWith('mailto:');
                if (isRelative && href) {
                  return (
                    <a href={href} onClick={(e) => { e.preventDefault(); onLinkClick(href); }}>
                      {children}
                    </a>
                  );
                }
                return <a href={href}>{children}</a>;
              },
              // eslint-disable-next-line @typescript-eslint/no-unused-vars
              code: ({ children, className, node: _node }) => {
                const text = String(children);
                // Intercept inline code (no language class, single-line) that looks like a relative file path
                if (!className && !text.includes('\n') && /^[a-z][a-z0-9_-]*\/[a-zA-Z0-9._-][a-zA-Z0-9._/-]*$/.test(text)) {
                  return (
                    <code
                      className="cursor-pointer underline decoration-dotted"
                      title={`Open ${text}`}
                      onClick={() => onLinkClick(text)}
                    >
                      {children}
                    </code>
                  );
                }
                return <code className={className}>{children}</code>;
              },
            } : undefined}
          >
            {parsed ? parsed.body : content}
          </Markdown>
        </div>
      ) : (
        <pre className="flex-1 overflow-auto whitespace-pre-wrap rounded-xl border border-slate-200 bg-slate-50/80 p-5 font-mono text-sm text-slate-700 leading-relaxed">
          {content}
        </pre>
      )}
    </div>
  );
}

/**
 * Reusable Source/Preview segmented toggle control.
 * Can be rendered standalone (e.g., in a file title bar) or inside the viewer.
 */
export function SourcePreviewToggle({
  rendered,
  onToggle,
}: {
  rendered: boolean;
  onToggle: (rendered: boolean) => void;
}) {
  return (
    <div className="inline-flex rounded-lg border border-slate-200 bg-slate-50 p-0.5">
      <button
        onClick={() => onToggle(false)}
        className={`flex items-center gap-1.5 rounded-md px-3 py-1.5 text-xs font-medium transition-all duration-200 ${
          !rendered
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
        onClick={() => onToggle(true)}
        className={`flex items-center gap-1.5 rounded-md px-3 py-1.5 text-xs font-medium transition-all duration-200 ${
          rendered
            ? 'bg-white text-slate-800 shadow-sm'
            : 'text-slate-500 hover:text-slate-700'
        }`}
        aria-label="View rendered markdown"
        title="View rendered markdown"
      >
        <svg className="h-3.5 w-3.5" fill="none" viewBox="0 0 24 24" strokeWidth={2} stroke="currentColor">
          <path strokeLinecap="round" strokeLinejoin="round" d="M2.036 12.322a1.012 1.012 0 0 1 0-.639C3.423 7.51 7.36 4.5 12 4.5c4.638 0 8.573 3.007 9.963 7.178.07.207.07.431 0 .639C20.577 16.49 16.64 19.5 12 19.5c-4.638 0-8.573-3.007-9.963-7.178Z" />
          <path strokeLinecap="round" strokeLinejoin="round" d="M15 12a3 3 0 1 1-6 0 3 3 0 0 1 6 0Z" />
        </svg>
        Preview
      </button>
    </div>
  );
}
