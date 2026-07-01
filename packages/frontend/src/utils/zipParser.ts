/**
 * Client-side zip extraction and validation for skill uploads.
 *
 * Security measures:
 * - Max compressed size: 100 KB
 * - Max extracted (decompressed) size: 100 KB (enforced pre-extraction via metadata)
 * - Max decompressed size: 20 MB hard cap (zip bomb guard before any content extraction)
 * - Max file count: 15
 * - Per-file size: 100 KB
 * - Path traversal rejection (no ".." segments, no absolute paths)
 * - Extension allowlist (text-only files)
 * - No nested zip extraction
 */

import JSZip from 'jszip';
import type { SkillFileItem } from '@skillspell/shared';
import {
  MAX_COMPRESSED_SIZE,
  MAX_DECOMPRESSED_SIZE,
  MAX_EXTRACTED_SIZE,
  MAX_FILE_COUNT,
  MAX_PER_FILE_SIZE,
  ALLOWED_EXTENSIONS,
  KNOWN_FLAT_FORMAT_BASENAMES,
  SKILL_DIRS,
  isIgnoredPath,
} from './zipConstants.js';

/* ─── Types ──────────────────────────────────────────────────────────── */

export interface ZipParsedSkill {
  name: string;
  description: string;
  skillContent: string;
  scripts: SkillFileItem[];
  references: SkillFileItem[];
  assets: SkillFileItem[];
}

export interface ZipParseSuccess {
  success: true;
  skill: ZipParsedSkill;
  warnings: string[];
  fileCount: number;
  totalSize: number;
}

export interface ZipParseError {
  success: false;
  error: string;
  details?: string[];
}

export type ZipParseResult = ZipParseSuccess | ZipParseError;

/* ─── Frontmatter Parser ─────────────────────────────────────────────── */

interface Frontmatter {
  name?: string;
  description?: string;
}

/**
 * Parse simple YAML frontmatter from SKILL.md content.
 * Extracts only `name` and `description`.
 */
function parseFrontmatter(content: string): Frontmatter {
  const match = content.match(/^---\r?\n([\s\S]*?)\r?\n---/);
  if (!match) return {};

  const fm: Frontmatter = {};
  const lines = match[1].split(/\r?\n/);

  for (let i = 0; i < lines.length; i++) {
    const nameMatch = lines[i].match(/^name:\s*(.+)$/);
    if (nameMatch) {
      fm.name = nameMatch[1].trim().replace(/^["']|["']$/g, '');
      continue;
    }

    const descMatch = lines[i].match(/^description:\s*(.*)$/);
    if (descMatch) {
      // Collect the first line value
      const firstLine = descMatch[1].trim().replace(/^["']|["']$/g, '');

      // Check for YAML block scalar indicators (> or |)
      const isBlockScalar = firstLine === '>' || firstLine === '|'
        || firstLine === '>-' || firstLine === '|-';

      if (isBlockScalar) {
        // Collect indented continuation lines
        const descLines: string[] = [];
        while (i + 1 < lines.length && /^\s+/.test(lines[i + 1])) {
          i++;
          descLines.push(lines[i].trim());
        }
        fm.description = descLines.join(' ');
      } else if (firstLine) {
        // Single-line or multi-line continuation (indented lines appended)
        const descParts = [firstLine];
        while (i + 1 < lines.length && /^\s+/.test(lines[i + 1])) {
          i++;
          descParts.push(lines[i].trim());
        }
        fm.description = descParts.join(' ');
      }
      continue;
    }
  }
  return fm;
}

/* ─── Path Helpers ───────────────────────────────────────────────────── */

function getExtension(filename: string): string {
  const lastDot = filename.lastIndexOf('.');
  return lastDot === -1 ? '' : filename.slice(lastDot).toLowerCase();
}

/** Normalize a zip entry path. Returns null if path is invalid (traversal). */
export function normalizePath(raw: string): string | null {
  if (raw.startsWith('/') || raw.startsWith('\\')) return null;
  const segments = raw.split(/[/\\]/);
  if (segments.some((s) => s === '..')) return null;
  return segments.filter(Boolean).join('/');
}

/**
 * Find the skill root by searching for SKILL.md at any depth.
 * Supports exports from Claude (.claude/skills/<name>/SKILL.md),
 * Roo (.roo/rules/<name>/SKILL.md), or plain zips.
 *
 * Returns the directory prefix to strip so that SKILL.md appears at root.
 * Returns null if no SKILL.md is found.
 */
function findSkillRoot(paths: string[]): string | null {
  // Look for SKILL.md (case-insensitive) at any depth
  const skillMdPath = paths.find((p) => {
    const basename = p.split('/').pop()?.toLowerCase();
    return basename === 'skill.md';
  });

  if (skillMdPath) {
    // Strip everything before SKILL.md to make it the root
    const idx = skillMdPath.lastIndexOf('/');
    return idx === -1 ? '' : skillMdPath.slice(0, idx + 1); // includes trailing /
  }

  // Fallback: if there's a single root folder, unwrap it
  if (paths.length > 0) {
    const topLevel = new Set(paths.map((p) => p.split('/')[0]));
    if (topLevel.size === 1) {
      const candidate = [...topLevel][0];
      if (paths.every((p) => p.startsWith(candidate + '/') || p === candidate)) {
        return candidate + '/';
      }
    }
  }

  return null;
}

/**
 * Detect if this is a flat-format export (Cursor, Windsurf, Copilot)
 * that contains a single markdown file but no SKILL.md.
 *
 * Known patterns:
 * - .cursor/rules/<name>.md
 * - .windsurfrules
 * - .github/copilot-instructions.md
 */
function detectFlatFormatFile(paths: string[]): string | null {
  // No SKILL.md anywhere
  const hasSkillMd = paths.some((p) => p.split('/').pop()?.toLowerCase() === 'skill.md');
  if (hasSkillMd) return null;

  // Check for known flat format patterns
  for (const p of paths) {
    if (p.includes('.cursor/rules/') && p.endsWith('.md')) return p;
    if (p === '.windsurfrules' || p.endsWith('/.windsurfrules')) return p;
    if (p.endsWith('copilot-instructions.md')) return p;
  }

  // If there's exactly one .md file, treat it as the skill content
  const mdFiles = paths.filter((p) => p.toLowerCase().endsWith('.md'));
  if (mdFiles.length === 1) return mdFiles[0];

  return null;
}

/* ─── Validation Steps ───────────────────────────────────────────────── */

function validateAndLoadZip(file: File): ZipParseError | null {
  if (!file.name.toLowerCase().endsWith('.zip')) {
    return { success: false, error: 'Only .zip files are accepted.' };
  }
  if (file.size > MAX_COMPRESSED_SIZE) {
    return {
      success: false,
      error: `Zip file is too large (${(file.size / 1024).toFixed(0)} KB). Maximum is 500 KB.`,
    };
  }
  return null;
}

function collectEntries(zip: JSZip): {
  entries: { path: string; zipObj: JSZip.JSZipObject }[];
  invalidPaths: string[];
} {
  const entries: { path: string; zipObj: JSZip.JSZipObject }[] = [];
  const invalidPaths: string[] = [];

  zip.forEach((relativePath, zipObj) => {
    if (zipObj.dir) return;
    // Silently skip OS/tool artifacts (__MACOSX, .DS_Store, etc.)
    if (isIgnoredPath(relativePath)) return;
    const normalized = normalizePath(relativePath);
    if (!normalized) {
      invalidPaths.push(relativePath);
    } else {
      entries.push({ path: normalized, zipObj });
    }
  });

  return { entries, invalidPaths };
}

/* ─── File Extraction ────────────────────────────────────────────────── */

async function extractFiles(
  entries: { path: string; zipObj: JSZip.JSZipObject }[],
  stripPrefix: string,
): Promise<{ files: { path: string; content: string }[]; warnings: string[] } | ZipParseError> {
  const warnings: string[] = [];
  const files: { path: string; content: string }[] = [];
  let totalSize = 0;
  let totalDecompressedBytes = 0;

  for (const entry of entries) {
    const relativePath = stripPrefix
      ? entry.path.startsWith(stripPrefix)
        ? entry.path.slice(stripPrefix.length)
        : entry.path
      : entry.path;

    if (!relativePath) continue;

    // Extension check (bypass for known flat-format filenames like .windsurfrules)
    const basename = relativePath.split('/').pop() ?? '';
    const ext = getExtension(relativePath);
    if (ext !== '' && !ALLOWED_EXTENSIONS.has(ext) && !KNOWN_FLAT_FORMAT_BASENAMES.has(basename)) {
      warnings.push(`Skipped "${relativePath}" — unsupported extension "${ext}"`);
      continue;
    }

    // Depth check (max 5 levels to support project structures like scripts/eval/Project/src/Controllers/File.cs)
    if (relativePath.split('/').length > 6) {
      warnings.push(`Skipped "${relativePath}" — nested too deeply (max 5 directory levels)`);
      continue;
    }

    // Extract as raw bytes first for accurate size accounting (zip bomb guard)
    let rawBytes: Uint8Array;
    try {
      rawBytes = await entry.zipObj.async('uint8array');
    } catch {
      warnings.push(`Skipped "${relativePath}" — could not decompress`);
      continue;
    }

    // Zip bomb guard: track cumulative decompressed bytes and abort early
    totalDecompressedBytes += rawBytes.length;
    if (totalDecompressedBytes > MAX_DECOMPRESSED_SIZE) {
      return {
        success: false,
        error: `Import file exceeds maximum decompressed size (${(MAX_DECOMPRESSED_SIZE / 1024 / 1024).toFixed(0)} MB). This may indicate a zip bomb.`,
      };
    }

    // Per-file size check
    if (rawBytes.length > MAX_PER_FILE_SIZE) {
      warnings.push(
        `Skipped "${relativePath}" — exceeds ${(MAX_PER_FILE_SIZE / 1024).toFixed(0)} KB limit (${(rawBytes.length / 1024).toFixed(0)} KB)`,
      );
      continue;
    }

    // Decode to string
    let content: string;
    try {
      content = new TextDecoder('utf-8', { fatal: true }).decode(rawBytes);
    } catch {
      warnings.push(`Skipped "${relativePath}" — could not read as text (binary file?)`);
      continue;
    }

    totalSize += rawBytes.length;
    if (totalSize > MAX_EXTRACTED_SIZE) {
      return {
        success: false,
        error: `Total extracted content exceeds ${(MAX_EXTRACTED_SIZE / 1024).toFixed(0)} KB limit.`,
      };
    }

    files.push({ path: relativePath, content });
  }

  return { files, warnings };
}

/* ─── Skill Mapping ──────────────────────────────────────────────────── */

export function mapFilesToSkill(
  extractedFiles: { path: string; content: string }[],
  warnings: string[],
): ZipParseResult {
  // Locate SKILL.md
  const skillMdEntry = extractedFiles.find(
    (f) => f.path === 'SKILL.md' || f.path === 'skill.md',
  );

  if (!skillMdEntry) {
    const details = [
      'Expected structure: SKILL.md at the root, with optional scripts/, references/, assets/ directories.',
      `Found files: ${extractedFiles.length > 0 ? extractedFiles.map((f) => f.path).join(', ') : '(none)'}`,
      ...warnings.filter((w) => w.toLowerCase().includes('skill.md') || w.toLowerCase().includes('skipped')),
    ];
    return {
      success: false,
      error: 'Zip must contain a SKILL.md file at the root level.',
      details,
    };
  }

  // Parse frontmatter
  const frontmatter = parseFrontmatter(skillMdEntry.content);
  if (!frontmatter.name) {
    warnings.push('SKILL.md frontmatter is missing "name" — please provide a skill name.');
  }
  if (!frontmatter.description) {
    warnings.push('SKILL.md frontmatter is missing "description" — please provide a skill description.');
  }

  // Categorize files
  const scripts: SkillFileItem[] = [];
  const references: SkillFileItem[] = [];
  const assets: SkillFileItem[] = [];

  for (const file of extractedFiles) {
    if (file.path === skillMdEntry.path) continue;

    const parts = file.path.split('/');
    const dir = parts[0].toLowerCase();
    const fileName = parts.slice(1).join('/');

    if (dir === 'scripts' && fileName) {
      scripts.push({ name: fileName, content: file.content });
    } else if (dir === 'references' && fileName) {
      references.push({ name: fileName, content: file.content });
    } else if (dir === 'assets' && fileName) {
      assets.push({ name: fileName, content: file.content });
    } else if (!SKILL_DIRS.has(dir) && parts.length === 1) {
      references.push({ name: file.path, content: file.content });
      warnings.push(`"${file.path}" at root level — added to references.`);
    } else {
      references.push({ name: file.path, content: file.content });
      warnings.push(`"${file.path}" in unknown directory — added to references.`);
    }
  }

  const totalSize = extractedFiles.reduce(
    (sum, f) => sum + new TextEncoder().encode(f.content).length,
    0,
  );

  return {
    success: true,
    skill: {
      name: frontmatter.name ?? '',
      description: frontmatter.description ?? '',
      skillContent: skillMdEntry.content,
      scripts,
      references,
      assets,
    },
    warnings,
    fileCount: extractedFiles.length,
    totalSize,
  };
}

/* ─── Main Entry Point ───────────────────────────────────────────────── */

export async function parseSkillZip(file: File): Promise<ZipParseResult> {
  // Validate file
  const fileError = validateAndLoadZip(file);
  if (fileError) return fileError;

  // Load zip
  let zip: JSZip;
  try {
    zip = await JSZip.loadAsync(await file.arrayBuffer());
  } catch {
    return {
      success: false,
      error: 'Failed to read the zip file. It may be corrupted or not a valid zip archive.',
    };
  }

  // Collect entries
  const { entries, invalidPaths } = collectEntries(zip);
  if (invalidPaths.length > 0) {
    return {
      success: false,
      error: 'Zip contains files with invalid paths (path traversal detected).',
      details: invalidPaths.map((p) => `Invalid path: ${p}`),
    };
  }
  if (entries.length > MAX_FILE_COUNT) {
    return {
      success: false,
      error: `Zip contains too many files (${entries.length}). Maximum is ${MAX_FILE_COUNT}.`,
    };
  }
  if (entries.length === 0) {
    return { success: false, error: 'Zip file is empty.' };
  }

  // Find the skill root (searches for SKILL.md at any depth)
  const allPaths = entries.map((e) => e.path);
  const stripPrefix = findSkillRoot(allPaths) ?? '';

  // Check for flat format exports (Cursor, Windsurf, Copilot)
  const flatFile = detectFlatFormatFile(allPaths);

  // Extract files
  const extractResult = await extractFiles(entries, stripPrefix);
  if ('success' in extractResult && !extractResult.success) return extractResult;

  const { files, warnings } = extractResult as { files: { path: string; content: string }[]; warnings: string[] };

  // If this is a flat format (no SKILL.md), wrap the single file as skillContent
  if (flatFile && !files.some((f) => f.path.toLowerCase() === 'skill.md')) {
    const flatContent = files.find((f) =>
      f.path === flatFile || flatFile.endsWith(f.path),
    );
    if (flatContent) {
      const frontmatter = parseFrontmatter(flatContent.content);
      // Extract skill name from the filename if not in frontmatter
      const basename = flatFile.split('/').pop() ?? '';
      const nameFromFile = basename.replace(/\.md$/, '').replace(/\.windsurfrules$/, '');

      warnings.push(
        `Detected flat-format export (${basename}). Converted to skill structure.`,
      );

      return {
        success: true,
        skill: {
          name: frontmatter.name ?? nameFromFile ?? '',
          description: frontmatter.description ?? '',
          skillContent: flatContent.content,
          scripts: [],
          references: [],
          assets: [],
        },
        warnings,
        fileCount: files.length,
        totalSize: files.reduce(
          (sum, f) => sum + new TextEncoder().encode(f.content).length, 0,
        ),
      };
    }
  }

  // Map to skill structure (standard SKILL.md format)
  return mapFilesToSkill(files, warnings);
}
