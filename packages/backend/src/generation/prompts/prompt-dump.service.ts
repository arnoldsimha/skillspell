import { Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import type { AppConfig } from '../../config/configuration.js';
import { formatError } from '../../common/utils/format-error.js';
import { randomUUID } from 'node:crypto';
import { resolve, join } from 'node:path';
import { mkdir, writeFile } from 'node:fs/promises';
import { existsSync } from 'node:fs';

/**
 * Debug service that dumps full prompts to disk before they are sent to the
 * LLM provider. Only active when:
 *   1. NODE_ENV !== 'production'
 *   2. DEBUG_DUMP_PROMPTS=true
 *
 * Usage pattern (two-step):
 *   1. `const dumpId = this.promptDump.generateId()` — early, for logging
 *   2. `this.promptDump.write(dumpId, 'sendMessage', createParams)` — right before the API call
 *
 * Each dump is written as a JSON file under `debug-prompts/` (relative to cwd).
 * File naming: `debug-prompts/<timestamp>_<id>.json`
 *
 * Writes are fire-and-forget — they never block the actual API call.
 */
@Injectable()
export class PromptDumpService {
  private readonly logger = new Logger(PromptDumpService.name);
  private readonly enabled: boolean;
  private readonly dumpDir: string;
  private dirReady: Promise<void> | undefined;

  constructor(
    private readonly configService: ConfigService<AppConfig, true>,
  ) {
    this.enabled = this.configService.get('debug.dumpPrompts', { infer: true });
    this.dumpDir = resolve(process.cwd(), 'debug-prompts');

    if (this.enabled) {
      // Ensure dump directory exists at startup (async, but we track the promise)
      this.dirReady = this.ensureDir();
      this.logger.warn(
        `🔍 Prompt dumping ENABLED — writing to ${this.dumpDir}. ` +
          `This is a dev-only debug feature. Set DEBUG_DUMP_PROMPTS=false to disable.`,
      );
    }
  }

  /** Whether prompt dumping is currently active. */
  get isEnabled(): boolean {
    return this.enabled;
  }

  /**
   * Generate a dump ID upfront (UUID v4) for use in log lines.
   * Returns `undefined` if dumping is disabled — callers use this to
   * conditionally append `dumpId` to their logs.
   */
  generateId(): string | undefined {
    if (!this.enabled) {
      return undefined;
    }
    return randomUUID();
  }

  /**
   * Write the raw params to disk (fire-and-forget).
   * Call this right before the actual API call with the fully-built params.
   * Never blocks the caller — errors are caught and logged.
   *
   * @param id - The dump ID from `generateId()`
   * @param method - Which SDK method: 'sendMessage' | 'runAgentQuery' | 'runLightQuery'
   * @param params - The raw params object (createParams, agent query args, etc.)
   */
  write(id: string | undefined, method: string, params: unknown): void {
    if (!this.enabled || !id) {
      return;
    }

    this.writeToDisk(id, method, params).catch((error) => {
      this.logger.error(`Failed to dump prompt [${id}]: ${formatError(error)}`);
    });
  }

  // ── Private helpers ─────────────────────────────────────────────────

  private async ensureDir(): Promise<void> {
    if (!existsSync(this.dumpDir)) {
      await mkdir(this.dumpDir, { recursive: true });
    }
  }

  private async writeToDisk(id: string, method: string, params: unknown): Promise<void> {
    // Wait for directory creation if it hasn't completed yet
    if (this.dirReady) {
      await this.dirReady;
    }

    const timestamp = new Date().toISOString().replace(/[:.]/g, '-');
    const filename = `${timestamp}_${id}.json`;
    const filepath = join(this.dumpDir, filename);

    const dumpContent = {
      id,
      timestamp: new Date().toISOString(),
      method,
      params,
    };

    await writeFile(filepath, JSON.stringify(dumpContent, null, 2), 'utf-8');

    this.logger.log(`📝 Prompt dumped [${id}] → ${filename} (method: ${method})`);
  }
}
