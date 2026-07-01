/**
 * Client-side folder extraction and validation for skill imports.
 *
 * Supports two input modes:
 * 1. FileSystemDirectoryEntry — from DataTransfer items API (drag & drop folder)
 * 2. FileList with webkitRelativePath — from <input webkitdirectory>
 *
 * Applies the same security limits as zipParser.ts:
 * - Max file count: 15
 * - Max per-file size: 100 KB
 * - Max total extracted size: 100 KB
 * - Path traversal rejection
 * - Extension allowlist
 */

import type { ZipParseResult } from './zipParser.js';
import { normalizePath, mapFilesToSkill } from './zipParser.js';
import {
  MAX_EXTRACTED_SIZE,
  MAX_FILE_COUNT,
  MAX_PER_FILE_SIZE,
  ALLOWED_EXTENSIONS,
  KNOWN_FLAT_FORMAT_BASENAMES,
  isIgnoredPath,
} from './zipConstants.js';

type ExtractedFile = { path: string; content: string };

function getExtension(filename: string): string {
  const lastDot = filename.lastIndexOf('.');
  return lastDot === -1 ? '' : filename.slice(lastDot).toLowerCase();
}

function isAllowedFile(path: string): boolean {
  const basename = path.split('/').pop() ?? '';
  if (KNOWN_FLAT_FORMAT_BASENAMES.has(basename)) return true;
  return ALLOWED_EXTENSIONS.has(getExtension(basename));
}

async function readFileAsText(file: File): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(reader.result as string);
    reader.onerror = () => reject(new Error(`Failed to read file: ${file.name}`));
    reader.readAsText(file, 'utf-8');
  });
}

/* ─── FileSystemDirectoryEntry traversal ────────────────────────────── */

function readDirEntries(reader: FileSystemDirectoryReader): Promise<FileSystemEntry[]> {
  return new Promise((resolve, reject) => {
    reader.readEntries(resolve, reject);
  });
}

async function collectEntries(
  dirEntry: FileSystemDirectoryEntry,
  prefix: string,
  collected: Array<{ path: string; fileEntry: FileSystemFileEntry }>,
  maxCount: number,
): Promise<void> {
  const reader = dirEntry.createReader();
  let batch: FileSystemEntry[];

  // readEntries may return results in multiple batches
  do {
    batch = await readDirEntries(reader);
    for (const entry of batch) {
      if (collected.length >= maxCount) return;
      const entryPath = prefix ? `${prefix}/${entry.name}` : entry.name;

      if (entry.isDirectory) {
        await collectEntries(entry as FileSystemDirectoryEntry, entryPath, collected, maxCount);
      } else if (entry.isFile) {
        collected.push({ path: entryPath, fileEntry: entry as FileSystemFileEntry });
      }
    }
  } while (batch.length > 0);
}

function getFileFromEntry(entry: FileSystemFileEntry): Promise<File> {
  return new Promise((resolve, reject) => entry.file(resolve, reject));
}

async function extractFromDirectoryEntry(
  dirEntry: FileSystemDirectoryEntry,
): Promise<{ files: ExtractedFile[]; errors: string[] }> {
  const collected: Array<{ path: string; fileEntry: FileSystemFileEntry }> = [];
  await collectEntries(dirEntry, '', collected, MAX_FILE_COUNT + 1);

  if (collected.length > MAX_FILE_COUNT) {
    return {
      files: [],
      errors: [`Folder contains more than ${MAX_FILE_COUNT} files. Please reduce the file count.`],
    };
  }

  const files: ExtractedFile[] = [];
  const errors: string[] = [];
  let totalSize = 0;

  for (const { path, fileEntry } of collected) {
    const normalized = normalizePath(path);
    if (!normalized) {
      errors.push(`Skipped unsafe path: ${path}`);
      continue;
    }
    if (isIgnoredPath(normalized)) continue;
    if (!isAllowedFile(normalized)) {
      errors.push(`Skipped disallowed file type: ${normalized}`);
      continue;
    }

    const file = await getFileFromEntry(fileEntry);
    if (file.size > MAX_PER_FILE_SIZE) {
      errors.push(`"${normalized}" exceeds the 100 KB per-file limit (${Math.round(file.size / 1024)} KB).`);
      continue;
    }

    const content = await readFileAsText(file);
    const byteSize = new TextEncoder().encode(content).length;
    totalSize += byteSize;

    if (totalSize > MAX_EXTRACTED_SIZE) {
      return {
        files: [],
        errors: ['Total folder contents exceed the 100 KB limit. Please reduce the folder size.'],
      };
    }

    files.push({ path: normalized, content });
  }

  return { files, errors };
}

/* ─── FileList traversal (webkitdirectory input) ─────────────────────── */

async function extractFromFileList(
  fileList: FileList,
): Promise<{ files: ExtractedFile[]; errors: string[] }> {
  const items = Array.from(fileList);

  if (items.length > MAX_FILE_COUNT) {
    return {
      files: [],
      errors: [`Folder contains more than ${MAX_FILE_COUNT} files. Please reduce the file count.`],
    };
  }

  const files: ExtractedFile[] = [];
  const errors: string[] = [];
  let totalSize = 0;

  for (const file of items) {
    // webkitRelativePath: "foldername/subdir/file.md" — strip the top-level folder name
    const rawPath = file.webkitRelativePath || file.name;
    const pathParts = rawPath.split('/');
    // Strip top-level directory (it's the folder name the user selected)
    const relativePath = pathParts.length > 1 ? pathParts.slice(1).join('/') : rawPath;

    if (!relativePath) continue;

    const normalized = normalizePath(relativePath);
    if (!normalized) {
      errors.push(`Skipped unsafe path: ${relativePath}`);
      continue;
    }
    if (isIgnoredPath(normalized)) continue;
    if (!isAllowedFile(normalized)) {
      errors.push(`Skipped disallowed file type: ${normalized}`);
      continue;
    }

    if (file.size > MAX_PER_FILE_SIZE) {
      errors.push(`"${normalized}" exceeds the 100 KB per-file limit (${Math.round(file.size / 1024)} KB).`);
      continue;
    }

    const content = await readFileAsText(file);
    const byteSize = new TextEncoder().encode(content).length;
    totalSize += byteSize;

    if (totalSize > MAX_EXTRACTED_SIZE) {
      return {
        files: [],
        errors: ['Total folder contents exceed the 100 KB limit. Please reduce the folder size.'],
      };
    }

    files.push({ path: normalized, content });
  }

  return { files, errors };
}

/* ─── Main Entry Point ───────────────────────────────────────────────── */

export async function parseSkillFolder(
  source: FileSystemDirectoryEntry | FileList,
): Promise<ZipParseResult> {
  let extractResult: { files: ExtractedFile[]; errors: string[] };

  if (source instanceof FileList) {
    if (source.length === 0) {
      return { success: false, error: 'No files found in the selected folder.' };
    }
    extractResult = await extractFromFileList(source);
  } else {
    extractResult = await extractFromDirectoryEntry(source);
  }

  if (extractResult.errors.length > 0 && extractResult.files.length === 0) {
    return {
      success: false,
      error: 'Could not import folder.',
      details: extractResult.errors,
    };
  }

  if (extractResult.files.length === 0) {
    return {
      success: false,
      error: 'No valid files found in the folder.',
      details: ['The folder appears to be empty or contains only unsupported file types.'],
    };
  }

  const warnings: string[] = [...extractResult.errors];
  return mapFilesToSkill(extractResult.files, warnings);
}
