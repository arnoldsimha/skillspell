import { Injectable, Logger, OnModuleInit } from '@nestjs/common';
import { readFile } from 'node:fs/promises';
import { join } from 'node:path';
import { formatError } from '../../common/utils/format-error.js';

/**
 * Loads prompt templates from .md files once at application startup.
 * Templates support {{placeholder}} substitution via `render()`.
 *
 * Prompt files live in the shared package at `packages/shared/prompts/`
 * organised by category:
 * - `shared/prompts/generation/` — generation & suggestion prompts
 * - `shared/prompts/eval/` — eval grading & test generation prompts
 *
 * All templates are validated at startup — a missing file causes an immediate error
 * rather than a runtime failure when a user triggers the feature.
 */
@Injectable()
export class PromptLoaderService implements OnModuleInit {
  private readonly logger = new Logger(PromptLoaderService.name);

  /**
   * Base directory for the shared prompts folder.
   *
   * Prefers the `PROMPTS_DIR` environment variable for deployment flexibility
   * (Docker, K8s, PM2, systemd — any cwd). Falls back to the monorepo-relative
   * path which works when `process.cwd()` is `packages/backend/`.
   */
  private readonly promptsDir =
    process.env.PROMPTS_DIR || join(process.cwd(), '..', 'shared', 'prompts');

  private readonly templates = new Map<string, string>();

  /** Prompt name → category subfolder under shared/prompts/. */
  private static readonly PROMPT_REGISTRY: Record<string, string> = {
    'generate-diagram': 'generation',
    'suggest': 'generation',
    'generate-trigger-evals': 'generation',
    'simulate-trigger': 'generation',
    'batch-simulate-trigger': 'generation',
    'improve-description': 'generation',
    'suggest-test-prompts': 'eval',
    'generate-test-evals': 'eval',
    'grader': 'eval',
    'grading-request': 'eval',
    'optimize-improvement': 'eval',
    'suggest-assertion-replacements': 'eval',
    'analyze-skill-for-testing': 'eval',
    'suggest-test-case-count': 'eval',
    'suggest-gap-counts': 'eval',
    'explain-failure': 'eval',
  };

  async onModuleInit(): Promise<void> {
    await Promise.all(
      Object.entries(PromptLoaderService.PROMPT_REGISTRY).map(
        ([name, category]) => this.loadTemplate(name, category),
      ),
    );

    this.logger.log(
      `Loaded ${this.templates.size} prompt template(s) from ${this.promptsDir}`,
    );
  }

  /**
   * Return a prompt template with placeholders replaced.
   *
   * If the template was loaded at startup it is served from cache (no I/O).
   * If the template is registered in `PROMPT_REGISTRY` but hasn't been loaded
   * yet, it is loaded on-demand and cached for subsequent calls.
   *
   * @param name   Template name (without .md extension)
   * @param vars   Key-value pairs to substitute for {{key}} placeholders
   */
  async render(name: string, vars: Record<string, string>): Promise<string> {
    let template = this.templates.get(name);

    if (!template) {
      const category = PromptLoaderService.PROMPT_REGISTRY[name];
      if (!category) {
        throw new Error(
          `Prompt template "${name}" is not registered in PROMPT_REGISTRY`,
        );
      }
      await this.loadTemplate(name, category);
      template = this.templates.get(name);
    }

    return template!.replace(
      /\{\{(\w+)\}\}/g,
      (_, key: string) => {
        if (!(key in vars)) {
          this.logger.warn(
            `Prompt "${name}": placeholder {{${key}}} has no matching variable — replaced with empty string`,
          );
        }
        return vars[key] ?? '';
      },
    );
  }

  /**
   * Load a template from a category subdirectory under the shared prompts root.
   * @param name     Template name (without .md extension)
   * @param category Subdirectory under shared/prompts/ (e.g., 'generation' or 'eval')
   */
  private async loadTemplate(name: string, category: string): Promise<void> {
    const filePath = join(this.promptsDir, category, `${name}.md`);
    try {
      const content = await readFile(filePath, 'utf-8');
      this.templates.set(name, content);
      this.logger.log(`Loaded prompt template: ${name}`);
    } catch (error) {
      this.logger.error(
        `Failed to load prompt template "${name}" from ${filePath}: ${formatError(error)}`,
      );
      throw error;
    }
  }
}
