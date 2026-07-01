import { Prism as SyntaxHighlighter } from 'react-syntax-highlighter';
import { oneLight } from 'react-syntax-highlighter/dist/esm/styles/prism';

/**
 * Map of file extensions to Prism language identifiers.
 * Covers the most common script / config languages likely to appear in skills.
 */
const EXT_TO_LANGUAGE: Record<string, string> = {
  // Python
  py: 'python',
  pyw: 'python',

  // JavaScript / TypeScript
  js: 'javascript',
  jsx: 'jsx',
  mjs: 'javascript',
  cjs: 'javascript',
  ts: 'typescript',
  tsx: 'tsx',

  // Shell
  sh: 'bash',
  bash: 'bash',
  zsh: 'bash',
  fish: 'bash',
  ps1: 'powershell',
  psm1: 'powershell',
  bat: 'batch',
  cmd: 'batch',

  // Web
  html: 'html',
  htm: 'html',
  css: 'css',
  scss: 'scss',
  sass: 'sass',
  less: 'less',

  // Data / Config
  json: 'json',
  yaml: 'yaml',
  yml: 'yaml',
  toml: 'toml',
  xml: 'xml',
  ini: 'ini',
  env: 'bash',

  // Ruby
  rb: 'ruby',
  rake: 'ruby',
  gemspec: 'ruby',

  // Go
  go: 'go',

  // Rust
  rs: 'rust',

  // Java / Kotlin / Scala
  java: 'java',
  kt: 'kotlin',
  kts: 'kotlin',
  scala: 'scala',

  // C / C++ / C#
  c: 'c',
  h: 'c',
  cpp: 'cpp',
  cxx: 'cpp',
  hpp: 'cpp',
  cc: 'cpp',
  cs: 'csharp',

  // PHP
  php: 'php',

  // Swift / Objective-C
  swift: 'swift',
  m: 'objectivec',

  // Lua
  lua: 'lua',

  // R
  r: 'r',

  // SQL
  sql: 'sql',

  // Dockerfile
  dockerfile: 'docker',

  // Markdown (fallback; normally handled by MarkdownToggleViewer)
  md: 'markdown',
  mdx: 'markdown',

  // Makefile
  makefile: 'makefile',
  mk: 'makefile',

  // GraphQL
  graphql: 'graphql',
  gql: 'graphql',

  // Terraform
  tf: 'hcl',
  hcl: 'hcl',

  // Perl
  pl: 'perl',
  pm: 'perl',

  // Dart
  dart: 'dart',

  // Elixir / Erlang
  ex: 'elixir',
  exs: 'elixir',
  erl: 'erlang',

  // Haskell
  hs: 'haskell',

  // Zig
  zig: 'zig',
};

/**
 * Detect the Prism language string from a filename.
 * Falls back to 'text' if the extension is unrecognized.
 */
// eslint-disable-next-line react-refresh/only-export-components
export function detectLanguage(filename: string): string {
  // Handle special filenames without extensions
  const lowerName = filename.toLowerCase();
  if (lowerName === 'dockerfile') return 'docker';
  if (lowerName === 'makefile') return 'makefile';
  if (lowerName === '.gitignore' || lowerName === '.env') return 'bash';

  const dotIdx = filename.lastIndexOf('.');
  if (dotIdx === -1) return 'text';

  const ext = filename.slice(dotIdx + 1).toLowerCase();
  return EXT_TO_LANGUAGE[ext] ?? 'text';
}

interface CodeViewerProps {
  /** The source code / file content to display */
  content: string;
  /** Filename used to auto-detect the language (e.g. "setup.py", "index.ts") */
  filename: string;
  /** Override the auto-detected language */
  language?: string;
  /** Show line numbers. Default: true */
  showLineNumbers?: boolean;
}

/**
 * Syntax-highlighted code viewer that automatically detects the language
 * from the file extension.
 */
export default function CodeViewer({
  content,
  filename,
  language,
  showLineNumbers = true,
}: CodeViewerProps) {
  const lang = language ?? detectLanguage(filename);

  return (
    <div className="code-viewer overflow-auto rounded-xl border border-slate-200">
      {/* Language badge */}
      <div className="flex items-center justify-between border-b border-slate-200/60 bg-slate-50/80 px-4 py-1.5">
        <span className="rounded-md bg-slate-200/60 px-2 py-0.5 text-[10px] font-semibold uppercase tracking-wider text-slate-500">
          {lang === 'text' ? 'Plain Text' : lang}
        </span>
      </div>
      <SyntaxHighlighter
        language={lang}
        style={oneLight}
        showLineNumbers={showLineNumbers}
        wrapLongLines
        customStyle={{
          margin: 0,
          borderRadius: 0,
          fontSize: '0.8125rem',
          lineHeight: '1.6',
          background: 'transparent',
        }}
        lineNumberStyle={{
          minWidth: '2.5em',
          paddingRight: '1em',
          color: '#94a3b8',
          fontSize: '0.75rem',
        }}
      >
        {content}
      </SyntaxHighlighter>
    </div>
  );
}
