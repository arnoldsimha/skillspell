import { Injectable, Logger, OnModuleInit } from '@nestjs/common';
import { readFile } from 'node:fs/promises';
import { join } from 'node:path';
import { formatError } from '../common/utils/format-error.js';

/**
 * Loads email templates from files once at application startup.
 * Templates support {{placeholder}} substitution via `render()`.
 *
 * Email template files live in the shared package at
 * `packages/shared/templates/email/` — completely separate from
 * the LLM prompt templates in `packages/shared/prompts/`.
 *
 * Each registered template name (e.g. `invite`) maps to:
 * - A required HTML file: `invite.html`
 * - An optional plain-text file: `invite.txt` (loaded if present, skipped otherwise)
 *
 * Callers use `render(name, vars)` for the HTML version and
 * `renderText(name, vars)` for the optional plain-text version.
 */
@Injectable()
export class EmailTemplateLoaderService implements OnModuleInit {
  private readonly logger = new Logger(EmailTemplateLoaderService.name);

  /**
   * Base directory for the shared templates folder.
   *
   * `process.cwd()` is `packages/backend/` both when running via npm
   * workspaces and when running tests. From there, `../shared/templates/email`
   * reaches the email templates directory.
   */
  private readonly templatesDir = join(
    process.cwd(),
    '..',
    'shared',
    'templates',
    'email',
  );

  /** Cache: key is `name:html` or `name:txt`. */
  private readonly templates = new Map<string, string>();

  /**
   * Registry of email template names.
   * For each name, the loader expects `<name>.html` (required)
   * and optionally `<name>.txt` (plain-text fallback).
   */
  private static readonly TEMPLATE_NAMES: string[] = ['invite'];

  async onModuleInit(): Promise<void> {
    const loadOps: Promise<void>[] = [];

    for (const name of EmailTemplateLoaderService.TEMPLATE_NAMES) {
      // HTML is required
      loadOps.push(this.loadFile(name, 'html', false));
      // TXT is optional
      loadOps.push(this.loadFile(name, 'txt', true));
    }

    await Promise.all(loadOps);

    this.logger.log(
      `Loaded ${this.templates.size} email template file(s) from ${this.templatesDir}`,
    );
  }

  /**
   * Render the HTML version of an email template with placeholders replaced.
   *
   * @param name   Template name (e.g. 'invite')
   * @param vars   Key-value pairs to substitute for {{key}} placeholders
   * @throws Error if template is not registered or the HTML file is missing
   */
  async render(
    name: string,
    vars: Record<string, string>,
  ): Promise<string> {
    const cacheKey = `${name}:html`;
    let template = this.templates.get(cacheKey);

    if (!template) {
      if (!EmailTemplateLoaderService.TEMPLATE_NAMES.includes(name)) {
        throw new Error(
          `Email template "${name}" is not registered in TEMPLATE_NAMES`,
        );
      }
      await this.loadFile(name, 'html', false);
      template = this.templates.get(cacheKey);
    }

    if (!template) {
      throw new Error(`Email template "${name}.html" could not be loaded`);
    }

    return this.substitute(name, template, vars);
  }

  /**
   * Try to render the plain-text version of an email template.
   * Returns `undefined` if no `.txt` file exists for this template —
   * callers can skip the text part gracefully.
   *
   * @param name   Template name (e.g. 'invite')
   * @param vars   Key-value pairs to substitute for {{key}} placeholders
   */
  async renderText(
    name: string,
    vars: Record<string, string>,
  ): Promise<string | undefined> {
    const template = this.templates.get(`${name}:txt`);
    if (!template) return undefined;
    return this.substitute(name, template, vars);
  }

  // ─── Private helpers ────────────────────────────────────────────────

  /** Replace {{key}} placeholders in a template string. */
  private substitute(
    name: string,
    template: string,
    vars: Record<string, string>,
  ): string {
    return template.replace(/\{\{(\w+)\}\}/g, (_, key: string) => {
      if (!(key in vars)) {
        this.logger.warn(
          `Email template "${name}": placeholder {{${key}}} has no matching variable — replaced with empty string`,
        );
      }
      return vars[key] ?? '';
    });
  }

  /**
   * Load a template file from the email templates directory.
   * @param name     Template name (e.g. 'invite')
   * @param format   File format / extension without dot ('html' or 'txt')
   * @param optional If true, a missing file is silently skipped
   */
  private async loadFile(
    name: string,
    format: string,
    optional: boolean,
  ): Promise<void> {
    const filePath = join(this.templatesDir, `${name}.${format}`);
    try {
      const content = await readFile(filePath, 'utf-8');
      this.templates.set(`${name}:${format}`, content);
      this.logger.log(`Loaded email template: ${name}.${format}`);
    } catch (error: unknown) {
      if (optional && this.isFileNotFound(error)) {
        this.logger.log(
          `Optional email template "${name}.${format}" not found — skipped`,
        );
        return;
      }
      this.logger.error(
        `Failed to load email template "${name}.${format}" from ${filePath}: ${formatError(error)}`,
      );
      throw error;
    }
  }

  /** Check if an error is a file-not-found (ENOENT) error. */
  private isFileNotFound(error: unknown): boolean {
    return (
      error !== null &&
      typeof error === 'object' &&
      'code' in error &&
      (error as { code: string }).code === 'ENOENT'
    );
  }
}
