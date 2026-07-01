/**
 * Shared constants for zip skill upload validation.
 */

/** Max compressed zip file size. */
export const MAX_COMPRESSED_SIZE = 500 * 1024; // 500 KB

/** Max total extracted content size (checked during extraction). */
export const MAX_EXTRACTED_SIZE = 500 * 1024; // 500 KB

/**
 * Hard cap on total decompressed bytes (zip bomb guard).
 * Checked from zip metadata *before* any content is extracted into memory.
 * A 100 KB compressed file could in theory decompress to hundreds of MB.
 */
export const MAX_DECOMPRESSED_SIZE = 1 * 1024 * 1024; // 1 MB

/** Max number of files in the zip. */
export const MAX_FILE_COUNT = 100;

/** Max size per individual file. */
export const MAX_PER_FILE_SIZE = 500 * 1024; // 500 KB

/** Allowlisted file extensions (lowercase, with leading dot). */
export const ALLOWED_EXTENSIONS = new Set([
  '.md', '.txt', '.ts', '.tsx', '.js', '.jsx', '.py', '.json',
  '.html', '.css', '.yaml', '.yml', '.svg', '.sh', '.bash',
  '.toml', '.xml', '.csv', '.sql', '.graphql', '.gql', '.env',
  '.cfg', '.ini', '.conf', '.rb', '.rs', '.go', '.java', '.kt',
  '.swift', '.r', '.lua', '.pl', '.pm',
  '.cs', '.csproj', '.config',
]);

/** Known skill subdirectories. */
export const SKILL_DIRS = new Set(['scripts', 'references', 'assets']);

/**
 * Known flat-format filenames that bypass the extension allowlist.
 * These are tool-specific config files that don't use standard extensions.
 */
export const KNOWN_FLAT_FORMAT_BASENAMES = new Set([
  '.windsurfrules',
]);

/**
 * Path prefixes and filenames to silently skip during extraction.
 * These are OS/tool artifacts that should never be part of a skill.
 */
export const IGNORED_PREFIXES = [
  '__MACOSX/',
  '__MACOSX',
  '.DS_Store',
  'Thumbs.db',
  '.git/',
  '.git',
  '.svn/',
  '.svn',
  '.hg/',
  '.hg',
  'node_modules/',
  'node_modules',
  '.vscode/',
  '.vscode',
  '.idea/',
  '.idea',
];

/** Check if a normalized path should be silently ignored. */
export function isIgnoredPath(path: string): boolean {
  const basename = path.split('/').pop() ?? '';
  // Check exact basename matches (e.g. .DS_Store anywhere in the tree)
  if (basename === '.DS_Store' || basename === 'Thumbs.db' || basename === '.gitignore') {
    return true;
  }
  // Check prefix matches (e.g. __MACOSX/ at any level)
  for (const prefix of IGNORED_PREFIXES) {
    if (path === prefix || path.startsWith(prefix.endsWith('/') ? prefix : prefix + '/')) {
      return true;
    }
    // Also check within subdirectories (e.g. my-skill/__MACOSX/)
    if (path.includes('/' + prefix)) {
      return true;
    }
  }
  return false;
}
