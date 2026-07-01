/**
 * LLM Response Parser — Pure parsing utilities for extracting structured data
 * from Claude's text responses. All functions are stateless and can be unit-tested
 * with simple input/output assertions.
 *
 * LLM response parsing utilities.
 */
import { Logger } from '@nestjs/common';
import { join } from 'node:path';
import { writeFile } from 'node:fs/promises';
import type { SkillGenerationResult, SuggestionItem } from '@skillspell/shared';
import type { TestPromptSuggestion } from '../types.js';

const logger = new Logger('LlmResponseParser');

// ── Skill output parsing ──────────────────────────────────────────────

/**
 * Parse the JSON output from the LLM response into a SkillGenerationResult.
 *
 * B2: When tool_use structured output is active (Messages API path), the
 * response is guaranteed valid JSON from the `tool_use` content block.
 * The fast path (direct JSON.parse) handles this case with zero fallbacks.
 *
 * The full extraction + sanitization pipeline remains for the agent path
 * (initial generation, heavy refinement) where output may contain preamble,
 * code fences, or other non-JSON content.
 */
export function parseSkillOutput(response: string): SkillGenerationResult {
  // B2 fast path: try direct JSON.parse first — works when tool_use
  // guarantees clean JSON (Messages API structured output mode).
  try {
    const parsed = JSON.parse(response) as Record<string, unknown>;
    if (parsed.name && parsed.skillContent) {
      logger.debug('Parsed skill output via direct JSON.parse (structured output fast path)');
      return buildSkillResult(parsed);
    }
  } catch {
    // Not clean JSON — fall through to extraction pipeline
  }

  // Agent / fallback path: extract JSON from potentially messy response
  const cleaned = extractJson(response);

  logger.debug(
    `Extracted JSON length: ${cleaned.length}, starts: ${cleaned.substring(0, 80)}…, ends: …${cleaned.substring(Math.max(0, cleaned.length - 80))}`,
  );

  // Attempt parse with progressively more aggressive sanitization:
  // 1. Raw extracted JSON
  // 2. Sanitized JSON (fix invalid escape sequences from AI output)
  const candidates = [cleaned, sanitizeJsonEscapes(cleaned)];

  for (const candidate of candidates) {
    try {
      const parsed = JSON.parse(candidate) as Record<string, unknown>;

      if (candidate !== cleaned) {
        logger.warn('JSON parsed successfully after sanitizing invalid escape sequences');
      }

      return buildSkillResult(parsed);
    } catch (error) {
      if (!(error instanceof SyntaxError)) throw error;
      // Try next candidate
    }
  }

  // All candidates failed — save debug info and throw
  const timestamp = new Date().toISOString().replace(/[:.]/g, '-');
  const debugDir = process.env.SKILL_OUTPUT_BASE_DIR || '/tmp';
  const debugFilePath = join(debugDir, `debug-response-${timestamp}.txt`);
  // Fire-and-forget async write to avoid blocking the event loop
  writeFile(debugFilePath, response, 'utf-8')
    .then(() => logger.error(`Raw response saved to: ${debugFilePath}`))
    .catch((writeErr) => logger.error(`Failed to save debug response: ${writeErr}`));

  // Re-parse to get the exact error message
  let parseErrorMsg = 'Unknown JSON parse error';
  try {
    JSON.parse(sanitizeJsonEscapes(cleaned));
  } catch (e) {
    parseErrorMsg = e instanceof Error ? e.message : String(e);
  }

  logger.error(`JSON parse error: ${parseErrorMsg}`);
  logger.error(
    `Response length: ${response.length}, cleaned length: ${cleaned.length}`,
  );
  logger.error(
    `First 500 chars of cleaned: ${cleaned.substring(0, 500)}`,
  );
  logger.error(
    `Last 500 chars of cleaned: ${cleaned.substring(Math.max(0, cleaned.length - 500))}`,
  );
  throw new Error(
    `Failed to parse skill generation output: ${parseErrorMsg}`,
  );
}

/**
 * Build a SkillGenerationResult from a parsed JSON object.
 * Shared by both the structured output fast path and the extraction pipeline.
 */
function buildSkillResult(parsed: Record<string, unknown>): SkillGenerationResult {
  // Enforce field length limits that the AI sometimes exceeds
  const name = validateString(parsed.name, 'name').slice(0, 64);
  const description = validateString(parsed.description, 'description').slice(0, 2048);

  // Fix literal \n sequences that the LLM sometimes produces in skillContent.
  // After JSON.parse, a properly escaped "\n" becomes a real newline, but if
  // the LLM double-escapes ("\\n") it becomes a literal two-char "\n" string.
  // Normalize these to actual newlines so the skill renders correctly.
  const rawSkillContent = validateString(parsed.skillContent, 'skillContent');
  const skillContent = repairMarkdownTables(normalizeLiteralNewlines(rawSkillContent));

  return {
    name,
    description,
    skillContent,
    scripts: validateFileItems(parsed.scripts, 'scripts'),
    references: validateFileItems(parsed.references, 'references'),
    assets: validateFileItems(parsed.assets, 'assets'),
    explanation: validateString(
      parsed.explanation,
      'explanation',
      'Skill generated successfully.',
    ),
  };
}

// ── JSON extraction ───────────────────────────────────────────────────

/**
 * Extract a JSON object from the LLM response, handling:
 * - Markdown code fencing with nested code blocks (```json ... ```)
 * - Preamble text before the JSON object
 * - Trailing text after the JSON object
 * - Non-JSON curly braces in markdown content
 */
export function extractJson(response: string): string {
  const text = response.trim();

  // Strategy 0: Strip markdown code fences (```json ... ``` or ``` ... ```)
  // The LLM sometimes wraps JSON in code fences despite being told not to.
  // Extract fenced content first and try to parse it directly.
  // Also handles unclosed fences (e.g. when response is truncated or max_tokens hit).
  const fencePattern =
    /```(?:json)?\s*\n([\s\S]*?)\n\s*```|```(?:json)?\s*\n([\s\S]+)$/g;
  let fenceMatch: RegExpExecArray | null;
  while ((fenceMatch = fencePattern.exec(text)) !== null) {
    const fenceContent = (fenceMatch[1] ?? fenceMatch[2]).trim();
    if (fenceContent.startsWith('{') && fenceContent.length > 100) {
      try {
        const test = JSON.parse(fenceContent) as Record<string, unknown>;
        if (test.name && test.skillContent) {
          logger.debug(
            `Extracted JSON from markdown code fence (${fenceContent.length} chars)`,
          );
          return fenceContent;
        }
      } catch {
        // Fence content wasn't valid JSON, continue to other strategies
      }
    }
  }

  // Strategy 1: Look for '{' followed by optional whitespace then '"' in the raw text,
  // extract balanced JSON, and validate. This handles both '{"key"' and '{\n  "key"' forms.
  // First pass prefers a candidate with expected fields (name + skillContent).
  // Second pass falls back to the largest balanced JSON object found.
  let bestCandidate: string | null = null;
  const jsonStartPattern = /\{\s*"/g;
  let jsonStartMatch: RegExpExecArray | null;
  while ((jsonStartMatch = jsonStartPattern.exec(text)) !== null) {
    const jsonStart = jsonStartMatch.index;
    const candidate = text.substring(jsonStart);
    const extracted = extractBalancedJson(candidate);
    if (!extracted) continue;

    // Prefer a candidate with expected fields
    if (extracted.length > 100) {
      try {
        const test = JSON.parse(extracted) as Record<string, unknown>;
        if (test.name && test.skillContent) {
          if (jsonStart > 0) {
            logger.debug(
              `Extracted JSON from response (skipped ${jsonStart} chars of preamble)`,
            );
          }
          return extracted;
        }
      } catch {
        // Not valid JSON or missing fields, track as fallback
      }
    }

    // Track largest candidate as fallback
    if (!bestCandidate || extracted.length > bestCandidate.length) {
      bestCandidate = extracted;
    }
  }
  if (bestCandidate) {
    logger.debug(
      `Extracted largest JSON candidate (${bestCandidate.length} chars)`,
    );
    return bestCandidate;
  }

  // Final fallback: return as-is, JSON.parse will fail with a clear error
  logger.warn(
    `Could not locate JSON object in response (length: ${text.length})`,
  );
  return text;
}

/**
 * Extract a balanced JSON object string from text that starts with '{'.
 * Handles nested braces and strings with escaped characters.
 */
export function extractBalancedJson(text: string): string | null {
  if (!text.startsWith('{')) return null;

  let depth = 0;
  let inString = false;
  let escape = false;

  for (let i = 0; i < text.length; i++) {
    const ch = text[i];

    if (escape) {
      escape = false;
      continue;
    }

    if (ch === '\\' && inString) {
      escape = true;
      continue;
    }

    if (ch === '"') {
      inString = !inString;
      continue;
    }

    if (inString) continue;

    if (ch === '{') depth++;
    else if (ch === '}') {
      depth--;
      if (depth === 0) {
        return text.substring(0, i + 1);
      }
    }
  }

  // Unbalanced — return null
  logger.warn(
    `extractBalancedJson: unbalanced braces (final depth=${depth}, inString=${inString}). Text length: ${text.length}`,
  );
  return null;
}

/**
 * Extract a balanced JSON array string ("[ ... ]") from text that may contain
 * preamble, prose, or markdown code fences. Scans for the first '[' and walks
 * brackets (string-aware, escape-aware) to its matching ']'.
 *
 * More robust than a greedy `/\[[\s\S]*\]/` match, which over-captures up to
 * the LAST ']' anywhere in the text (e.g. brackets in trailing prose).
 * Returns null when no balanced array is found.
 */
export function extractBalancedArray(text: string): string | null {
  const start = text.indexOf('[');
  if (start === -1) return null;

  let depth = 0;
  let inString = false;
  let escape = false;

  for (let i = start; i < text.length; i++) {
    const ch = text[i];

    if (escape) {
      escape = false;
      continue;
    }
    if (ch === '\\' && inString) {
      escape = true;
      continue;
    }
    if (ch === '"') {
      inString = !inString;
      continue;
    }
    if (inString) continue;

    if (ch === '[') depth++;
    else if (ch === ']') {
      depth--;
      if (depth === 0) return text.substring(start, i + 1);
    }
  }

  return null;
}

/**
 * Strip a single wrapping markdown code fence (```json ... ```), returning the
 * inner content. Returns the trimmed input unchanged when there is no fence.
 */
function stripWrappingCodeFence(text: string): string {
  const trimmed = text.trim();
  const fence = trimmed.match(/^```(?:json)?\s*\n?([\s\S]*?)\n?```$/);
  return fence ? fence[1].trim() : trimmed;
}

/**
 * Parse a JSON object from an arbitrary LLM response. Provider-neutral and NOT
 * skill-biased (unlike {@link extractJson}, which prefers skill name/content).
 *
 * Strategy ladder, returning the first that yields a parseable object:
 *   1. direct JSON.parse of the trimmed content
 *   2. strip a wrapping code fence and parse
 *   3. extract the first balanced `{ ... }` and parse
 *
 * Returns null when no strategy yields a JSON object. This is the single
 * structured-object extractor; callers add their own domain defaults on null.
 */
export function parseJsonObject<T = unknown>(content: string): T | null {
  const trimmed = content.trim();
  const unfenced = stripWrappingCodeFence(trimmed);

  const candidates = [trimmed];
  if (unfenced !== trimmed) candidates.push(unfenced);

  const braceStart = unfenced.indexOf('{');
  if (braceStart !== -1) {
    const balanced = extractBalancedJson(unfenced.slice(braceStart));
    if (balanced) candidates.push(balanced);
  }

  for (const candidate of candidates) {
    try {
      const parsed = JSON.parse(candidate) as unknown;
      if (parsed && typeof parsed === 'object' && !Array.isArray(parsed)) {
        return parsed as T;
      }
    } catch {
      // try next candidate
    }
  }
  return null;
}

/**
 * Parse a JSON array from an arbitrary LLM response. Array counterpart of
 * {@link parseJsonObject}: tries direct parse, fence-stripped parse, then the
 * first balanced `[ ... ]`. Returns null when none parse to an array.
 */
export function parseJsonArray<T = unknown>(content: string): T[] | null {
  const trimmed = content.trim();
  const unfenced = stripWrappingCodeFence(trimmed);

  for (const candidate of unfenced !== trimmed ? [trimmed, unfenced] : [trimmed]) {
    try {
      const parsed = JSON.parse(candidate) as unknown;
      if (Array.isArray(parsed)) return parsed as T[];
    } catch {
      // try next candidate
    }
  }

  const balanced = extractBalancedArray(unfenced);
  if (balanced) {
    try {
      const parsed = JSON.parse(balanced) as unknown;
      if (Array.isArray(parsed)) return parsed as T[];
    } catch {
      // fall through to null
    }
  }
  return null;
}

// ── Content normalization ─────────────────────────────────────────────

/**
 * Replace literal two-character "\n" sequences with real newlines.
 *
 * When the LLM double-escapes newlines inside a JSON string value
 * (e.g. `"---\\nname: foo\\n..."`) , `JSON.parse` converts `\\n` into
 * the literal characters `\` + `n` instead of a real line break.
 *
 * Valid skill markdown content should never contain literal backslash-n
 * sequences. This function unconditionally replaces them with real
 * newlines whenever they are detected.
 *
 * It also normalizes literal `\r\n` → real `\r\n` and literal `\t` → real tab.
 */
export function normalizeLiteralNewlines(text: string): string {
  // Check for literal \n sequences (backslash + n as two characters).
  // Valid markdown never contains these — they are always a sign of
  // double-escaping from the LLM.
  if (!text.includes('\\n')) {
    return text;
  }

  const literalCount = (text.match(/\\n/g) ?? []).length;
  logger.warn(
    `Normalizing ${literalCount} literal \\n sequence(s) in skillContent`,
  );

  return text
    .replace(/\\r\\n/g, '\r\n')
    .replace(/\\n/g, '\n')
    .replace(/\\t/g, '\t');
}

/**
 * Repair malformed markdown tables where the separator row has a different
 * column count than the header row.
 *
 * The LLM sometimes adds or drops pipe-delimited cells in the separator
 * row (e.g., 8 header columns but 9 separator cells). This function
 * detects such mismatches and adjusts the separator to match the header.
 * Data rows with extra columns are also trimmed, and rows with fewer
 * columns are padded.
 */
export function repairMarkdownTables(text: string): string {
  const lines = text.split('\n');
  const result: string[] = [];
  let repaired = false;

  for (let i = 0; i < lines.length; i++) {
    const line = lines[i];

    // Detect a table: current line is header (has |), next line is separator (has |---).
    if (
      i + 1 < lines.length &&
      line.includes('|') &&
      /^\s*\|[\s-:|]+\|/.test(lines[i + 1])
    ) {
      const headerCols = countTableColumns(line);
      const sepCols = countTableColumns(lines[i + 1]);

      if (headerCols > 0 && sepCols !== headerCols) {
        // Fix separator row to match header column count
        const sep = '|' + ' --- |'.repeat(headerCols);
        result.push(line);
        result.push(sep);
        repaired = true;
        i++; // skip original separator

        // Fix subsequent data rows
        while (i + 1 < lines.length && lines[i + 1].includes('|') && !/^\s*$/.test(lines[i + 1])) {
          i++;
          const dataCols = countTableColumns(lines[i]);
          if (dataCols > headerCols) {
            // Trim extra columns
            result.push(trimTableRow(lines[i], headerCols));
          } else if (dataCols < headerCols) {
            // Pad missing columns
            result.push(padTableRow(lines[i], headerCols));
          } else {
            result.push(lines[i]);
          }
        }
        continue;
      }
    }

    result.push(line);
  }

  if (repaired) {
    logger.warn('Repaired malformed markdown table(s) in skillContent');
  }

  return result.join('\n');
}

/** Count the number of columns in a pipe-delimited table row. */
function countTableColumns(row: string): number {
  const trimmed = row.trim();
  // Split by | and filter empty strings from leading/trailing pipes
  const cells = trimmed.split('|').filter((_, idx, arr) =>
    idx > 0 && idx < arr.length - 1,
  );
  return cells.length;
}

/** Trim a table row to the specified number of columns. */
function trimTableRow(row: string, targetCols: number): string {
  const trimmed = row.trim();
  const parts = trimmed.split('|');
  // parts[0] is empty (before first |), then cells, parts[last] is empty or after last |
  const cells = parts.slice(1, 1 + targetCols);
  return '|' + cells.join('|') + '|';
}

/** Pad a table row to the specified number of columns. */
function padTableRow(row: string, targetCols: number): string {
  const trimmed = row.trim();
  const parts = trimmed.split('|');
  const cells = parts.slice(1, -1); // exclude leading/trailing empty
  while (cells.length < targetCols) {
    cells.push(' ');
  }
  return '|' + cells.join('|') + '|';
}

// ── JSON sanitization ─────────────────────────────────────────────────

/**
 * Fix invalid JSON escape sequences that AI models sometimes produce.
 * JSON only allows: \", \\, \/, \b, \f, \n, \r, \t, \uXXXX.
 * AI models commonly produce \' (escaped single quote) or other invalid
 * backslash sequences. This replaces invalid escapes with their literal
 * character (dropping the backslash).
 */
export function sanitizeJsonEscapes(json: string): string {
  // Match backslash followed by a character that is NOT a valid JSON escape
  // Valid: " \ / b f n r t u
  return json.replace(/\\([^"\\/bfnrtu])/g, (_, char) => {
    // For single quote, just return the quote without backslash
    if (char === "'") return "'";
    // For other invalid escapes, return the character as-is
    return char;
  });
}

// ── Suggestion extraction ─────────────────────────────────────────────

/**
 * Extract suggestions JSON from the LLM response.
 */
/**
 * Generic helper: search response text for a JSON object containing `key` as an array,
 * filter with `predicate`, and optionally cap the result count.
 */
function extractArrayFromJson<T>(
  response: string,
  key: string,
  predicate: (item: unknown) => item is T,
  limit?: number,
): T[] {
  const text = response.trim();
  let searchFrom = 0;
  while (searchFrom < text.length) {
    const jsonStart = text.indexOf('{', searchFrom);
    if (jsonStart === -1) break;

    const extracted = extractBalancedJson(text.substring(jsonStart));
    if (extracted) {
      try {
        const parsed = JSON.parse(extracted) as Record<string, unknown>;
        const arr = parsed[key];
        if (Array.isArray(arr)) {
          const filtered = arr.filter(predicate);
          return limit ? filtered.slice(0, limit) : filtered;
        }
      } catch {
        // Try next candidate
      }
    }
    searchFrom = jsonStart + 1;
  }
  return [];
}

export function extractSuggestionsJson(response: string): SuggestionItem[] {
  return extractArrayFromJson<SuggestionItem>(
    response,
    'suggestions',
    (s): s is SuggestionItem =>
      typeof (s as Record<string, unknown>).label === 'string' &&
      typeof (s as Record<string, unknown>).prompt === 'string',
  );
}

export function extractTestSuggestionsJson(response: string): TestPromptSuggestion[] {
  return extractArrayFromJson<TestPromptSuggestion>(
    response,
    'suggestions',
    (s): s is TestPromptSuggestion =>
      typeof (s as Record<string, unknown>).label === 'string' &&
      typeof (s as Record<string, unknown>).prompt === 'string' &&
      typeof (s as Record<string, unknown>).name === 'string',
    5, // Cap at 5 suggestions
  );
}

/**
 * Extract generated test eval cases from the LLM response.
 * Expects a JSON array (not wrapped in an object).
 */
export function extractGeneratedTestEvalsJson(response: string): TestPromptSuggestion[] {
  const text = response.trim();

  // Strategy 1: Try to parse as a direct JSON array
  if (text.startsWith('[')) {
    try {
      const parsed = JSON.parse(text) as TestPromptSuggestion[];
      if (Array.isArray(parsed)) {
        return parsed.filter(
          (s) =>
            typeof s.name === 'string' &&
            typeof s.prompt === 'string',
        );
      }
    } catch {
      // Not a clean array, try extraction strategies
    }
  }

  // Strategy 2: Find a JSON array in the response (strip preamble/postamble)
  const arrayStart = text.indexOf('[');
  const arrayEnd = text.lastIndexOf(']');
  if (arrayStart !== -1 && arrayEnd > arrayStart) {
    const candidate = text.substring(arrayStart, arrayEnd + 1);
    try {
      const parsed = JSON.parse(candidate) as TestPromptSuggestion[];
      if (Array.isArray(parsed)) {
        return parsed.filter(
          (s) =>
            typeof s.name === 'string' &&
            typeof s.prompt === 'string',
        );
      }
    } catch {
      // Fall through
    }
  }

  // Strategy 3: Try extracting from a wrapper object with a "suggestions" or "cases" key
  let searchFrom = 0;
  while (searchFrom < text.length) {
    const jsonStart = text.indexOf('{', searchFrom);
    if (jsonStart === -1) break;

    const candidate = text.substring(jsonStart);
    const extracted = extractBalancedJson(candidate);
    if (extracted) {
      try {
        const parsed = JSON.parse(extracted) as Record<string, unknown>;
        const arr = (parsed.suggestions ?? parsed.cases ?? parsed.testCases) as TestPromptSuggestion[] | undefined;
        if (Array.isArray(arr)) {
          return arr.filter(
            (s) =>
              typeof s.name === 'string' &&
              typeof s.prompt === 'string',
          );
        }
      } catch {
        // Try next candidate
      }
    }
    searchFrom = jsonStart + 1;
  }

  logger.warn('Could not parse generated test evals from response');
  return [];
}

// ── Validation helpers ────────────────────────────────────────────────

export function validateString(
  value: unknown,
  field: string,
  fallback?: string,
): string {
  if (typeof value === 'string' && value.length > 0) {
    return value;
  }
  if (fallback !== undefined) {
    return fallback;
  }
  throw new Error(`Invalid or missing field "${field}" in LLM output`);
}

export function validateFileItems(
  value: unknown,
  field: string,
): Array<{ name: string; content: string }> {
  if (!Array.isArray(value)) {
    logger.warn(`Field "${field}" is not an array, defaulting to empty`);
    return [];
  }
  return value
    .filter(
      (item): item is { name: string; content: string } =>
        typeof item === 'object' &&
        item !== null &&
        typeof item.name === 'string' &&
        typeof item.content === 'string',
    )
    .map((item) => ({ name: item.name, content: item.content }));
}
