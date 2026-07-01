import { Injectable, Logger, OnModuleInit } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { readFile } from 'node:fs/promises';
import { join } from 'node:path';
import type { AppConfig } from '../../config/configuration.js';
import { formatError } from '../../common/utils/format-error.js';
import type { Skill, SkillGenerationResult, SuggestionItem, ValidationIssue } from '@skillspell/shared';
import { LlmService } from '../llm/llm.service.js';
import { PromptLoaderService } from '../prompts/prompt-loader.service.js';
import { parseSkillOutput, extractSuggestionsJson } from '../prompts/llm-response-parser.js';
import { extractSectionHeadings } from './skill-section-parser.js';
import { SUGGESTIONS_TOOL_SCHEMA } from './skill-generation.schemas.js';

/** Number of recent turns to keep verbatim in the history window. */
const VERBATIM_WINDOW_SIZE = 3;

/** Only compress when history exceeds this many items. */
const COMPRESSION_THRESHOLD = 5;

/**
 * Handles all skill generation and refinement logic:
 * - Generate a new skill from a user prompt
 * - Refine an existing skill via structured context blocks + the Strands LlmService
 * - Generate smart prompt suggestions for the builder/optimizer
 *
 * Both generation and refinement use the same Strands LlmService path (runAgentQuery).
 * The skillspell-creator skill handles all guidance; this service supplies context.
 */
@Injectable()
export class SkillGenerationService implements OnModuleInit {
  private readonly logger = new Logger(SkillGenerationService.name);
  private readonly maxHistoryTokens: number;
  private generationSystemPrompt = '';

  constructor(
    private readonly llm: LlmService,
    private readonly promptLoaderService: PromptLoaderService,
    private readonly configService: ConfigService<AppConfig, true>,
  ) {
    const sessionConfig = this.configService.get('session', { infer: true });
    this.maxHistoryTokens = sessionConfig.maxHistoryTokens || 2000;
    this.logger.log(
      `SkillGenerationService initialized — maxHistoryTokens: ${this.maxHistoryTokens}`,
    );
  }

  async onModuleInit(): Promise<void> {
    const refsDir = join(
      this.llm.skillsWorkspace,
      'skills', 'skillspell-creator', 'references',
    );
    try {
      const [fewShots, contract] = await Promise.all([
        readFile(join(refsDir, 'few-shot-examples.md'), 'utf8'),
        readFile(join(refsDir, 'output-contract.md'), 'utf8'),
      ]);
      this.generationSystemPrompt = [
        'The following reference files are already loaded in context. Do not read them from disk.',
        fewShots,
        contract,
      ].join('\n\n');
      this.logger.log('Generation system prompt preloaded from skillspell-creator references');
    } catch (err) {
      throw new Error(
        `SkillGenerationService: failed to preload reference files from ${refsDir}: ${formatError(err)}`,
      );
    }
  }

  // ── Skill generation ────────────────────────────────────────────────

  async generateSkill(prompt: string, signal?: AbortSignal): Promise<SkillGenerationResult> {
    const { content, stats } = await this.llm.runAgentQuery(
      this.generationSystemPrompt,
      prompt,
      { maxTurns: 5 },
      signal,
    );

    const result = parseSkillOutput(content);
    result.stats = stats;
    return result;
  }

  // ── Skill refinement ────────────────────────────────────────────────

  /**
   * Refine an existing skill via the Strands LlmService.
   *
   * Builds a structured user message with three XML blocks:
   *   <existing_skill>  — current skill JSON
   *   <optimization_history>  — prior refinement turns (compressed)
   *   <user_request>  — the user's refinement instruction
   *
   * The skillspell-creator skill reads improving-existing-skill.md to apply
   * surgical minimal-change rules. Same Strands LlmService path as generateSkill().
   */
  async refineSkill(
    existingSkill: Skill,
    refinementPrompt: string,
    conversationHistory?: Array<{ role: 'user' | 'assistant'; content: string }>,
    signal?: AbortSignal,
  ): Promise<SkillGenerationResult> {
    this.logger.log(
      `Refining skill "${existingSkill.name}" ${
        conversationHistory?.length
          ? `with ${conversationHistory.length} history message(s)`
          : 'without history'
      }`,
    );

    const userMessage = this.buildRefineUserMessage(
      existingSkill,
      refinementPrompt,
      conversationHistory,
    );

    const { content, stats } = await this.llm.runAgentQuery(
      this.generationSystemPrompt,
      userMessage,
      { maxTurns: 5 },
      signal,
    );

    const result = parseSkillOutput(content);
    result.stats = stats;

    const preservationIssues = [
      ...this.validateSectionPreservation(existingSkill.skillContent, result.skillContent),
      ...this.validateFilePreservation(existingSkill, result),
    ];
    if (preservationIssues.length > 0) {
      result.validationIssues = [...(result.validationIssues ?? []), ...preservationIssues];
    }

    return result;
  }

  // ── Prompt suggestions ───────────────────────────────────────────────

  async suggestPrompts(
    mode: 'create' | 'optimize',
    partialInput?: string,
    skillContext?: {
      name: string;
      description: string;
      skillContent: string;
      version: number;
    },
    skillName?: string,
  ): Promise<SuggestionItem[]> {
    const systemInstruction = await this.promptLoaderService.render('suggest', {});

    const payload = JSON.stringify({
      mode,
      partialInput: partialInput || '',
      ...(skillName ? { skillName } : {}),
      ...(skillContext ? { skillContext } : {}),
    });

    const maxTokens = mode === 'optimize' ? 2048 : 1280;

    const { content } = await this.llm.runLightQuery(
      systemInstruction,
      payload,
      { maxTokens, toolSchema: SUGGESTIONS_TOOL_SCHEMA },
    );

    try {
      const parsed = JSON.parse(content) as { suggestions?: SuggestionItem[] };
      if (Array.isArray(parsed.suggestions)) {
        return parsed.suggestions.filter(
          (s) => typeof s.label === 'string' && typeof s.prompt === 'string',
        );
      }
      return extractSuggestionsJson(content);
    } catch {
      try {
        return extractSuggestionsJson(content);
      } catch (error) {
        this.logger.error(`Failed to parse suggestions: ${formatError(error)}`);
        return [];
      }
    }
  }

  // ── Private helpers ─────────────────────────────────────────────────

  /**
   * Build the structured user message for LlmService refinement.
   * Three XML blocks: existing skill JSON, optimization history, user request.
   */
  private buildRefineUserMessage(
    existingSkill: Skill,
    refinementPrompt: string,
    conversationHistory?: Array<{ role: 'user' | 'assistant'; content: string }>,
  ): string {
    const existingSkillData = JSON.stringify({
      name: existingSkill.name,
      description: existingSkill.description,
      skillContent: existingSkill.skillContent,
      ...(existingSkill.scripts?.length && { scripts: existingSkill.scripts }),
      ...(existingSkill.references?.length && { references: existingSkill.references }),
      ...(existingSkill.assets?.length && { assets: existingSkill.assets }),
    });

    const optimizationHistory = this.buildOptimizationHistory(conversationHistory);
    const sanitizedPrompt = this.sanitizeForXml(refinementPrompt);

    return [
      `<existing_skill>\n${existingSkillData}\n</existing_skill>`,
      `<optimization_history>\n${optimizationHistory}\n</optimization_history>`,
      `<user_request>\n${sanitizedPrompt}\n</user_request>`,
    ].join('\n\n');
  }

  private validateSectionPreservation(
    originalContent: string,
    refinedContent?: string,
  ): ValidationIssue[] {
    if (!refinedContent) return [];

    const originalHeadings = extractSectionHeadings(originalContent);
    if (originalHeadings.length === 0) return [];

    const refinedHeadings = extractSectionHeadings(refinedContent);
    const missing = originalHeadings.filter((h) => !refinedHeadings.includes(h));

    if (missing.length === 0) return [];

    const removalRatio = missing.length / originalHeadings.length;
    const severity: ValidationIssue['severity'] = removalRatio > 0.3 ? 'error' : 'warning';

    this.logger.warn(
      `Refinement removed ${missing.length}/${originalHeadings.length} section(s) ` +
        `(${(removalRatio * 100).toFixed(0)}%): ${missing.join(', ')}`,
    );

    return [{
      severity,
      field: 'skillContent',
      message: `Refinement removed ${missing.length} of ${originalHeadings.length} section(s): ${missing.slice(0, 5).join(', ')}${missing.length > 5 ? '…' : ''}`,
    }];
  }

  private validateFilePreservation(
    originalSkill: Pick<Skill, 'scripts' | 'references' | 'assets'>,
    refinedResult: Pick<SkillGenerationResult, 'scripts' | 'references' | 'assets'>,
  ): ValidationIssue[] {
    const categories = ['scripts', 'references', 'assets'] as const;
    const issues: ValidationIssue[] = [];

    for (const category of categories) {
      const originalNames = (originalSkill[category] ?? []).map((f) => f.name);
      if (originalNames.length === 0) continue;

      const refinedNames = new Set((refinedResult[category] ?? []).map((f) => f.name));
      const missing = originalNames.filter((name) => !refinedNames.has(name));

      if (missing.length > 0) {
        const severity: ValidationIssue['severity'] =
          missing.length === originalNames.length ? 'error' : 'warning';

        this.logger.warn(
          `Refinement dropped ${missing.length}/${originalNames.length} ${category} file(s): ${missing.join(', ')}`,
        );

        issues.push({
          severity,
          field: category,
          message: `Refinement dropped ${missing.length} of ${originalNames.length} ${category} file(s): ${missing.join(', ')}`,
        });
      }
    }

    return issues;
  }

  private sanitizeForXml(content: string): string {
    return content.replace(/</g, '&lt;').replace(/>/g, '&gt;');
  }

  private buildOptimizationHistory(
    conversationHistory?: Array<{ role: 'user' | 'assistant'; content: string }>,
  ): string {
    if (!conversationHistory || conversationHistory.length === 0) {
      return '(none — this is the first optimization pass)';
    }

    const totalTurns = conversationHistory.length;

    if (totalTurns <= COMPRESSION_THRESHOLD) {
      const turns = conversationHistory.map(
        (msg, i) => `${i + 1}. ${this.sanitizeForXml(msg.content)}`,
      );
      this.logger.debug(
        `History: ${totalTurns} turns (below threshold ${COMPRESSION_THRESHOLD}), all verbatim`,
      );
      return turns.join('\n');
    }

    const verbatimStartIndex = totalTurns - VERBATIM_WINDOW_SIZE;
    const oldTurns = conversationHistory.slice(0, verbatimStartIndex);
    const recentTurns = conversationHistory.slice(verbatimStartIndex);

    let summaryBullets = oldTurns.map((msg, i) => {
      const bullet = this.compressTurnToBullet(msg.content);
      return `${i + 1}. ${bullet}`;
    });

    const verbatimLines = recentTurns.map(
      (msg, i) => `${verbatimStartIndex + i + 1}. ${this.sanitizeForXml(msg.content)}`,
    );

    const verbatimText = verbatimLines.join('\n');
    const verbatimTokens = this.estimateTokens(verbatimText);
    const maxSummaryTokens = Math.max(0, this.maxHistoryTokens - verbatimTokens);

    let summaryText = summaryBullets.join('\n');
    while (summaryBullets.length > 0 && this.estimateTokens(summaryText) > maxSummaryTokens) {
      summaryBullets = summaryBullets.slice(1);
      summaryText = summaryBullets.join('\n');
    }

    const totalTokens = this.estimateTokens(summaryText) + verbatimTokens;
    this.logger.log(
      `History compressed: ${totalTurns} turns → ${summaryBullets.length} summary bullets + ` +
        `${recentTurns.length} verbatim turns (~${totalTokens} estimated tokens)`,
    );

    const parts: string[] = [];
    if (summaryBullets.length > 0) {
      parts.push(`Previously applied:\n${summaryText}`);
    }
    parts.push(`Recent turns (verbatim):\n${verbatimText}`);

    return parts.join('\n\n');
  }

  private compressTurnToBullet(content: string): string {
    const sanitized = this.sanitizeForXml(content);
    const firstSentenceMatch = sanitized.match(/^[^.!?\n]+[.!?]?/);
    const firstSentence = firstSentenceMatch ? firstSentenceMatch[0] : sanitized;

    if (firstSentence.length <= 100) {
      return firstSentence.trim();
    }

    const truncated = firstSentence.substring(0, 100).replace(/\s+\S*$/, '');
    return `${truncated.trim()}…`;
  }

  private estimateTokens(text: string): number {
    return Math.ceil(text.length / 3.5);
  }
}
