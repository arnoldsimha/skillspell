import { Injectable, Logger } from '@nestjs/common';
import { LlmService } from '../llm/llm.service.js';
import { PromptLoaderService } from '../prompts/prompt-loader.service.js';

/**
 * Generates Mermaid flowchart diagrams from skill content.
 *
 * Uses the Messages API (via LlmService.runLightQuery) with the light
 * model for fast, cost-effective diagram generation. Includes a retry
 * mechanism for invalid Mermaid syntax and basic bracket-balance validation.
 *
 * Extracted as part of the decomposition plan.
 */
@Injectable()
export class DiagramService {
  private readonly logger = new Logger(DiagramService.name);

  constructor(
    private readonly llm: LlmService,
    private readonly promptLoaderService: PromptLoaderService,
  ) {}

  /**
   * Generate a Mermaid flowchart diagram from a skill's content.
   *
   * Uses the Messages API (runLightQuery) with the light model for fast,
   * cost-effective diagram generation. The diagram instructions, Mermaid
   * syntax rules, and example output are all inlined in the prompt template
   * (`packages/shared/prompts/generation/generate-diagram.md`).
   *
   * @returns Object with the Mermaid diagram code and a brief summary
   */
  async generateDiagram(skillContext: {
    name: string;
    description: string;
    skillContent: string;
  }): Promise<{ mermaid: string; summary: string }> {
    const maxAttempts = 2;

    // Load prompt template as system instruction (matches pattern of suggest, grader, etc.)
    const systemInstruction = await this.promptLoaderService.render(
      'generate-diagram',
      {},
    );

    const userPrompt = [
      `Skill Name: ${skillContext.name}`,
      `Description: ${skillContext.description}`,
      '',
      '--- Skill Content ---',
      skillContext.skillContent,
    ].join('\n');

    for (let attempt = 1; attempt <= maxAttempts; attempt++) {
      const prompt =
        attempt === 1
          ? userPrompt
          : [
              userPrompt,
              '',
              '⚠️ IMPORTANT: The previous attempt produced invalid Mermaid syntax.',
              'Pay close attention to bracket/parenthesis balancing in node definitions.',
              'Every [ must have a matching ], every [[ must have a matching ]], etc.',
            ].join('\n');

      const { content } = await this.llm.runLightQuery(
        systemInstruction,
        prompt,
        { maxTokens: 2048 },
      );

      const result = this.extractDiagramFromResponse(content);
      const syntaxError = this.validateMermaidSyntax(result.mermaid);

      if (!syntaxError) {
        return result;
      }

      this.logger.warn(
        `Diagram attempt ${attempt}/${maxAttempts} has invalid Mermaid syntax: ${syntaxError}`,
      );

      if (attempt === maxAttempts) {
        // Last attempt failed — return it anyway; the frontend renderer
        // will show the error, but at least the user gets something.
        this.logger.warn('Returning diagram despite syntax issues after all retries exhausted');
        return result;
      }
    }

    // Unreachable, but TypeScript needs it
    throw new Error('Diagram generation failed unexpectedly');
  }

  /**
   * Extract the Mermaid diagram and summary from the LLM's markdown response.
   *
   * The generate-diagram prompt returns output in the format:
   * 1. Brief summary (2-3 sentences)
   * 2. Mermaid diagram in a fenced code block
   */
  private extractDiagramFromResponse(response: string): {
    mermaid: string;
    summary: string;
  } {
    const text = response.trim();

    // Extract the mermaid code block
    const mermaidMatch = text.match(/```mermaid\s*\n([\s\S]*?)\n\s*```/);
    if (!mermaidMatch) {
      this.logger.error(
        `No mermaid code block found in diagram response (${text.length} chars)`,
      );
      throw new Error(
        'Failed to generate diagram: no Mermaid code block in response',
      );
    }

    const mermaid = mermaidMatch[1].trim();

    // Extract summary: everything before the mermaid block, cleaned up
    const beforeMermaid = text.substring(0, text.indexOf('```mermaid')).trim();
    // Remove markdown headers (## Summary, etc.) and clean up
    const summary = beforeMermaid
      .replace(/^#{1,3}\s+.*$/gm, '') // Remove markdown headers
      .replace(/\*\*/g, '') // Remove bold markers
      .trim()
      .split('\n')
      .filter((line) => line.trim().length > 0)
      .join(' ')
      .trim();

    this.logger.log(
      `Extracted diagram (${mermaid.length} chars) and summary (${summary.length} chars)`,
    );

    return { mermaid, summary: summary || 'Skill workflow diagram' };
  }

  /**
   * Basic Mermaid syntax validation — checks bracket/paren balancing.
   * Returns `null` if valid, or a description of the first error found.
   */
  private validateMermaidSyntax(mermaid: string): string | null {
    const pairs: Record<string, string> = {
      '[': ']',
      '(': ')',
      '{': '}',
    };
    const openers = new Set(Object.keys(pairs));
    const closers = new Map(Object.entries(pairs).map(([o, c]) => [c, o]));

    // Check each line independently — Mermaid nodes don't span lines
    const lines = mermaid.split('\n');
    for (let i = 0; i < lines.length; i++) {
      const line = lines[i];
      // Skip comment lines and classDef/class/style lines
      if (/^\s*%%/.test(line) || /^\s*(classDef|class |style )/.test(line)) {
        continue;
      }

      // Strip quoted strings so brackets inside quotes don't confuse us
      const stripped = line.replace(/"[^"]*"/g, '').replace(/'[^']*'/g, '');

      const stack: string[] = [];
      for (const ch of stripped) {
        if (openers.has(ch)) {
          stack.push(ch);
        } else if (closers.has(ch)) {
          const expectedOpener = closers.get(ch)!;
          if (stack.length === 0 || stack[stack.length - 1] !== expectedOpener) {
            return `Line ${i + 1}: unmatched '${ch}' — "${line.trim()}"`;
          }
          stack.pop();
        }
      }

      if (stack.length > 0) {
        return `Line ${i + 1}: unclosed '${stack[stack.length - 1]}' — "${line.trim()}"`;
      }
    }

    return null;
  }
}
