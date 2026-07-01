import { Injectable, Logger } from '@nestjs/common';
import { formatError } from '../../common/utils/format-error.js';
import type {
  SkillGenerationResult,
  ValidationIssue,
  ValidationSeverity,
} from '@skillspell/shared';

// ── Validation types ──────────────────────────────────────────────────

// ValidationSeverity and ValidationIssue are the canonical shared types
// (re-exported here for callers that import them from this module).
export type { ValidationIssue, ValidationSeverity };

/** Aggregate result of validating a skill — local to the validator. */
export interface ValidationResult {
  valid: boolean;
  issues: ValidationIssue[];
}

// ── Constants ─────────────────────────────────────────────────────────

/** Regex for valid skill names (kebab-case). */
const NAME_REGEX = /^[a-z][a-z0-9-]*$/;

/** Maximum characters for the `name` field. */
const NAME_MAX_LENGTH = 64;

/** Maximum characters for the JSON-level `description` field. */
const DESCRIPTION_MAX_LENGTH = 2048;

/** Maximum characters for the frontmatter `description`. */
const FRONTMATTER_DESCRIPTION_MAX_LENGTH = 1024;

/** Maximum characters for the frontmatter `compatibility` field. */
const COMPATIBILITY_MAX_LENGTH = 500;

/** Ideal maximum line count for SKILL.md body. */
const SKILL_CONTENT_MAX_LINES = 500;

/** Allowed top-level frontmatter keys. */
const ALLOWED_FRONTMATTER_KEYS = new Set([
  'name',
  'description',
  'license',
  'allowed-tools',
  'metadata',
  'compatibility',
]);

// ── Service ───────────────────────────────────────────────────────────

/**
 * Validates a generated skill against best-practice rules derived from the
 * skillspell-creator skill and the Claude skill specification.
 *
 * Returns warnings (not hard errors) so the user sees quality feedback
 * without blocking skill creation.
 *
 * TypeScript port of `.claude/skills/skill-creator/scripts/quick_validate.py`
 * with additional web-specific checks for description quality and structure.
 */
@Injectable()
export class SkillValidatorService {
  private readonly logger = new Logger(SkillValidatorService.name);

  /**
   * Run all validation checks against a generated skill result.
   */
  validate(skill: SkillGenerationResult): ValidationResult {
    const issues: ValidationIssue[] = [];

    this.validateName(skill.name, issues);
    this.validateDescription(skill.description, issues);
    this.validateSkillContent(skill.skillContent, issues);
    this.validateFileArrays(skill, issues);
    this.validateExplanation(skill.explanation, issues);
    // B3: Cross-reference validation — check that script/reference/asset
    // names mentioned in skillContent match actual files in the arrays
    this.validateCrossReferences(skill, issues);

    const hasErrors = issues.some((i) => i.severity === 'error');

    if (issues.length > 0) {
      this.logger.debug(
        `Validation for "${skill.name}": ${issues.length} issue(s) — ` +
          `${issues.filter((i) => i.severity === 'error').length} errors, ` +
          `${issues.filter((i) => i.severity === 'warning').length} warnings, ` +
          `${issues.filter((i) => i.severity === 'info').length} info`,
      );
    }

    return { valid: !hasErrors, issues };
  }

  // ── Name checks ───────────────────────────────────────────────────

  private validateName(name: string, issues: ValidationIssue[]): void {
    if (!name || name.trim().length === 0) {
      issues.push({ severity: 'error', field: 'name', message: 'Name is required' });
      return;
    }

    const trimmed = name.trim();

    if (trimmed.length > NAME_MAX_LENGTH) {
      issues.push({
        severity: 'error',
        field: 'name',
        message: `Name is ${trimmed.length} characters — maximum is ${NAME_MAX_LENGTH}`,
      });
    }

    if (!NAME_REGEX.test(trimmed)) {
      issues.push({
        severity: 'error',
        field: 'name',
        message: `Name "${trimmed}" must be kebab-case: lowercase letters, digits, and hyphens only, starting with a letter`,
      });
    }

    if (trimmed.startsWith('-') || trimmed.endsWith('-')) {
      issues.push({
        severity: 'error',
        field: 'name',
        message: `Name "${trimmed}" cannot start or end with a hyphen`,
      });
    }

    if (trimmed.includes('--')) {
      issues.push({
        severity: 'error',
        field: 'name',
        message: `Name "${trimmed}" cannot contain consecutive hyphens`,
      });
    }
  }

  // ── Description checks ────────────────────────────────────────────

  private validateDescription(description: string, issues: ValidationIssue[]): void {
    if (!description || description.trim().length === 0) {
      issues.push({
        severity: 'error',
        field: 'description',
        message: 'Description is required',
      });
      return;
    }

    const trimmed = description.trim();

    if (trimmed.length > DESCRIPTION_MAX_LENGTH) {
      issues.push({
        severity: 'warning',
        field: 'description',
        message: `Description is ${trimmed.length} characters — maximum is ${DESCRIPTION_MAX_LENGTH}. It will be truncated.`,
      });
    }

    // Check for angle brackets (breaks YAML parsing)
    if (trimmed.includes('<') || trimmed.includes('>')) {
      issues.push({
        severity: 'warning',
        field: 'description',
        message: 'Description contains angle brackets (< or >) which can break YAML frontmatter parsing',
      });
    }

    // Trigger optimization hints
    const lowerDesc = trimmed.toLowerCase();
    const hasTriggerGuidance =
      lowerDesc.includes('use this') ||
      lowerDesc.includes('use when') ||
      lowerDesc.includes('whenever') ||
      lowerDesc.includes('should be used');

    if (!hasTriggerGuidance) {
      issues.push({
        severity: 'info',
        field: 'description',
        message:
          'Description lacks trigger guidance. Consider adding "Use this skill when..." or "Use whenever..." to improve skill discovery.',
      });
    }
  }

  // ── skillContent / SKILL.md checks ────────────────────────────────

  private validateSkillContent(skillContent: string, issues: ValidationIssue[]): void {
    if (!skillContent || skillContent.trim().length === 0) {
      issues.push({
        severity: 'error',
        field: 'skillContent',
        message: 'skillContent is required',
      });
      return;
    }

    const content = skillContent.trim();

    // ── Frontmatter presence ──
    if (!content.startsWith('---')) {
      issues.push({
        severity: 'error',
        field: 'skillContent',
        message: 'SKILL.md must start with YAML frontmatter (---)',
      });
      return;
    }

    // ── Extract and parse frontmatter ──
    const fmMatch = content.match(/^---\n([\s\S]*?)\n---/);
    if (!fmMatch) {
      issues.push({
        severity: 'error',
        field: 'skillContent',
        message: 'Invalid YAML frontmatter format — missing closing ---',
      });
      return;
    }

    const frontmatterText = fmMatch[1];
    const frontmatter = this.parseYamlFrontmatter(frontmatterText, issues);
    if (!frontmatter) return; // parsing errors already pushed

    // ── Allowed keys check ──
    const unexpectedKeys = Object.keys(frontmatter).filter(
      (k) => !ALLOWED_FRONTMATTER_KEYS.has(k),
    );
    if (unexpectedKeys.length > 0) {
      issues.push({
        severity: 'warning',
        field: 'skillContent',
        message: `Unexpected frontmatter key(s): ${unexpectedKeys.join(', ')}. Allowed: ${[...ALLOWED_FRONTMATTER_KEYS].join(', ')}`,
      });
    }

    // ── Required frontmatter fields ──
    if (!frontmatter.name) {
      issues.push({
        severity: 'error',
        field: 'skillContent',
        message: 'YAML frontmatter must include "name"',
      });
    }
    if (!frontmatter.description) {
      issues.push({
        severity: 'error',
        field: 'skillContent',
        message: 'YAML frontmatter must include "description"',
      });
    }

    // ── Frontmatter description length ──
    const fmDescription = String(frontmatter.description ?? '');
    if (fmDescription.length > FRONTMATTER_DESCRIPTION_MAX_LENGTH) {
      issues.push({
        severity: 'warning',
        field: 'skillContent',
        message: `Frontmatter description is ${fmDescription.length} characters — SDK truncates at ${FRONTMATTER_DESCRIPTION_MAX_LENGTH}`,
      });
    }

    // ── Frontmatter description angle brackets ──
    if (fmDescription.includes('<') || fmDescription.includes('>')) {
      issues.push({
        severity: 'warning',
        field: 'skillContent',
        message: 'Frontmatter description contains angle brackets (< or >) — may break YAML parsing',
      });
    }

    // ── Compatibility length ──
    if (frontmatter.compatibility) {
      const compat = String(frontmatter.compatibility);
      if (compat.length > COMPATIBILITY_MAX_LENGTH) {
        issues.push({
          severity: 'warning',
          field: 'skillContent',
          message: `Compatibility field is ${compat.length} characters — maximum is ${COMPATIBILITY_MAX_LENGTH}`,
        });
      }
    }

    // ── Body structure checks ──
    const bodyStartIdx = content.indexOf('---', 3);
    const body = bodyStartIdx >= 0 ? content.substring(bodyStartIdx + 3).trim() : '';

    // Title heading
    if (body && !body.startsWith('#')) {
      issues.push({
        severity: 'warning',
        field: 'skillContent',
        message: 'SKILL.md body should start with a title heading (#)',
      });
    }

    // Line count
    const lineCount = content.split('\n').length;
    if (lineCount > SKILL_CONTENT_MAX_LINES) {
      issues.push({
        severity: 'warning',
        field: 'skillContent',
        message: `SKILL.md is ${lineCount} lines — recommended maximum is ${SKILL_CONTENT_MAX_LINES}. Consider moving detail to reference files.`,
      });
    }

    // Check for placeholders
    const placeholderPatterns = [/\bTODO\b/i, /\bTBD\b/i, /\bFIXME\b/i, /\bXXX\b/];
    for (const pattern of placeholderPatterns) {
      if (pattern.test(body)) {
        issues.push({
          severity: 'warning',
          field: 'skillContent',
          message: `SKILL.md body contains placeholder: ${pattern.source}. Skills should be production-ready.`,
        });
      }
    }
  }

  // ── File array checks ─────────────────────────────────────────────

  private validateFileArrays(skill: SkillGenerationResult, issues: ValidationIssue[]): void {
    for (const field of ['scripts', 'references', 'assets'] as const) {
      const items = skill[field];
      if (!Array.isArray(items)) {
        issues.push({
          severity: 'error',
          field,
          message: `${field} must be an array (use [] if empty)`,
        });
        continue;
      }

      for (let i = 0; i < items.length; i++) {
        const item = items[i];
        if (!item || typeof item !== 'object') {
          issues.push({
            severity: 'error',
            field,
            message: `${field}[${i}] must be an object with {name, content}`,
          });
          continue;
        }

        if (!item.name || typeof item.name !== 'string') {
          issues.push({
            severity: 'error',
            field,
            message: `${field}[${i}].name is missing or not a string`,
          });
        }

        if (item.content === undefined || item.content === null) {
          issues.push({
            severity: 'warning',
            field,
            message: `${field}[${i}].content is missing — file "${item.name}" will be empty`,
          });
        }
      }
    }
  }

  // ── B3: Cross-reference validation ─────────────────────────────────

  /**
   * B3: Validate that file names referenced in skillContent (`backtick-wrapped`)
   * match actual scripts, references, or assets in the skill.
   *
   * Catches broken references like: skillContent says `run setup.sh` but the
   * script is actually named `install.sh`.
   *
   * Zero AI cost — pure string matching. Only matches common script/reference
   * file extensions to avoid false positives on non-file words.
   */
  private validateCrossReferences(
    skill: SkillGenerationResult,
    issues: ValidationIssue[],
  ): void {
    if (!skill.skillContent) return;

    // Collect all known file names across scripts, references, and assets
    const allFileNames = new Map<string, string>(); // name → category
    for (const [category, items] of [
      ['scripts', skill.scripts],
      ['references', skill.references],
      ['assets', skill.assets],
    ] as const) {
      if (!Array.isArray(items)) continue;
      for (const item of items) {
        if (item?.name) allFileNames.set(item.name, category);
      }
    }

    // Skip if no files to cross-reference
    if (allFileNames.size === 0) return;

    // Find backtick-wrapped file references in skillContent
    // Only match common file extensions to avoid false positives
    const FILE_REF_REGEX =
      /`([a-zA-Z0-9_.-]+\.(py|sh|js|ts|bash|ps1|md|json|yaml|yml|txt|html|css|xml|csv|toml))`/g;
    let match;
    while ((match = FILE_REF_REGEX.exec(skill.skillContent)) !== null) {
      const referencedName = match[1];

      // Skip if the name matches any known file
      if (allFileNames.has(referencedName)) continue;

      // Find close matches (potential typos)
      const available = [...allFileNames.keys()];
      const suggestion = available.length > 0
        ? ` Available: ${available.join(', ')}`
        : '';

      issues.push({
        severity: 'warning',
        field: 'skillContent',
        message: `File "${referencedName}" referenced in skillContent but not found in scripts/references/assets.${suggestion}`,
      });
    }

    // Also check: names in file arrays but never referenced in skillContent
    // (informational only — some files may be used implicitly)
    for (const [name, category] of allFileNames) {
      // Check if the file name appears anywhere in skillContent
      // (not just in backticks — could be in prose or code blocks)
      if (!skill.skillContent.includes(name)) {
        issues.push({
          severity: 'info',
          field: category,
          message: `File "${name}" in ${category} is not referenced anywhere in skillContent. Is it needed?`,
        });
      }
    }
  }

  // ── Explanation checks ────────────────────────────────────────────

  private validateExplanation(explanation: string, issues: ValidationIssue[]): void {
    if (!explanation || explanation.trim().length === 0) {
      issues.push({
        severity: 'info',
        field: 'explanation',
        message: 'Explanation is empty — consider adding bullet points describing what was generated',
      });
    }
  }

  // ── YAML frontmatter parser (simple, no external deps) ────────────

  /**
   * Minimal YAML frontmatter parser. Handles the simple key: value pairs
   * that skill frontmatter uses. Does NOT handle complex YAML features
   * (nested objects, multi-line strings, anchors, etc.) — those are not
   * expected in skill frontmatter.
   *
   * Falls back gracefully: parse errors are pushed as issues and null is returned.
   */
  private parseYamlFrontmatter(
    text: string,
    issues: ValidationIssue[],
  ): Record<string, string> | null {
    try {
      const result: Record<string, string> = {};

      // Handle multi-line description values (indented continuation lines)
      let currentKey = '';
      let currentValue = '';

      for (const line of text.split('\n')) {
        // Skip empty lines and comments
        if (line.trim() === '' || line.trim().startsWith('#')) continue;

        // Check if this is a key: value line
        const kvMatch = line.match(/^(\S[^:]*?):\s*(.*)/);
        if (kvMatch) {
          // Save previous key-value pair
          if (currentKey) {
            result[currentKey] = currentValue.trim();
          }
          currentKey = kvMatch[1].trim();
          currentValue = kvMatch[2];
        } else if (currentKey && (line.startsWith('  ') || line.startsWith('\t'))) {
          // Continuation of previous multi-line value
          currentValue += ' ' + line.trim();
        }
      }

      // Save final key-value
      if (currentKey) {
        result[currentKey] = currentValue.trim();
      }

      return result;
    } catch (error) {
      issues.push({
        severity: 'error',
        field: 'skillContent',
        message: `Failed to parse YAML frontmatter: ${formatError(error)}`,
      });
      return null;
    }
  }
}
