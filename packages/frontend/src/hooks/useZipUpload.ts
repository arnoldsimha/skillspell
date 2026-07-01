import { useState, useRef, useCallback } from 'react';
import type { ZipParseResult, ZipParsedSkill } from '../utils/zipParser.js';
import { parseSkillZip } from '../utils/zipParser.js';
import { parseSkillFolder } from '../utils/folderParser.js';
import { detectSecrets } from '../utils/secretScanner.js';
import type { SecretFinding } from '../utils/secretScanner.js';

export interface UseZipUploadReturn {
  /** Current parsing state. */
  parsing: boolean;
  /** Parse error message (null when no error). */
  error: string | null;
  /** Error details (e.g. list of invalid files). */
  errorDetails: string[];
  /** Parsed skill data (null until successful parse). */
  parsedSkill: ZipParsedSkill | null;
  /** Warnings from the parser (skipped files, missing frontmatter, etc.). */
  warnings: string[];
  /** File count from the zip. */
  fileCount: number;
  /** Total extracted size in bytes. */
  totalSize: number;
  /** Secret/API key findings detected in the parsed skill content. Empty array when none found. */
  secretFindings: SecretFinding[];
  /** Handle a file input change or drop event. */
  handleFile: (file: File) => Promise<void>;
  /** Handle a folder drop (FileSystemDirectoryEntry) or folder input (FileList). */
  handleFolder: (source: FileSystemDirectoryEntry | FileList) => Promise<void>;
  /** Reset the upload state (e.g. to re-upload). */
  reset: () => void;
}

export function useZipUpload(): UseZipUploadReturn {
  const [parsing, setParsing] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [errorDetails, setErrorDetails] = useState<string[]>([]);
  const [parsedSkill, setParsedSkill] = useState<ZipParsedSkill | null>(null);
  const [warnings, setWarnings] = useState<string[]>([]);
  const [fileCount, setFileCount] = useState(0);
  const [totalSize, setTotalSize] = useState(0);
  const [secretFindings, setSecretFindings] = useState<SecretFinding[]>([]);

  // Prevent double-parsing if the user drops a file while one is processing
  const parsingRef = useRef(false);

  const handleFile = useCallback(async (file: File) => {
    if (parsingRef.current) return;
    parsingRef.current = true;

    setParsing(true);
    setError(null);
    setErrorDetails([]);
    setParsedSkill(null);
    setWarnings([]);
    setFileCount(0);
    setTotalSize(0);
    setSecretFindings([]);

    try {
      const result: ZipParseResult = await parseSkillZip(file);

      if (result.success) {
        setParsedSkill(result.skill);
        setWarnings(result.warnings);
        setFileCount(result.fileCount);
        setTotalSize(result.totalSize);
        setSecretFindings(detectSecrets(result.skill));
      } else {
        setError(result.error);
        setErrorDetails(result.details ?? []);
      }
    } catch (err) {
      setError(
        err instanceof Error ? err.message : 'An unexpected error occurred while parsing the zip file.',
      );
    } finally {
      setParsing(false);
      parsingRef.current = false;
    }
  }, []);

  const handleFolder = useCallback(async (source: FileSystemDirectoryEntry | FileList) => {
    if (parsingRef.current) return;
    parsingRef.current = true;

    setParsing(true);
    setError(null);
    setErrorDetails([]);
    setParsedSkill(null);
    setWarnings([]);
    setFileCount(0);
    setTotalSize(0);
    setSecretFindings([]);

    try {
      const result: ZipParseResult = await parseSkillFolder(source);

      if (result.success) {
        setParsedSkill(result.skill);
        setWarnings(result.warnings);
        setFileCount(result.fileCount);
        setTotalSize(result.totalSize);
        setSecretFindings(detectSecrets(result.skill));
      } else {
        setError(result.error);
        setErrorDetails(result.details ?? []);
      }
    } catch (err) {
      setError(
        err instanceof Error ? err.message : 'An unexpected error occurred while reading the folder.',
      );
    } finally {
      setParsing(false);
      parsingRef.current = false;
    }
  }, []);

  const reset = useCallback(() => {
    setParsing(false);
    setError(null);
    setErrorDetails([]);
    setParsedSkill(null);
    setWarnings([]);
    setFileCount(0);
    setTotalSize(0);
    setSecretFindings([]);
    parsingRef.current = false;
  }, []);

  return {
    parsing,
    error,
    errorDetails,
    parsedSkill,
    warnings,
    fileCount,
    totalSize,
    secretFindings,
    handleFile,
    handleFolder,
    reset,
  };
}
