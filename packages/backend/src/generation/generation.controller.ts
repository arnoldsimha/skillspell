import { Controller, Post, Get, Body, Param, ParseUUIDPipe, Req, Res, Logger, HttpException } from '@nestjs/common';
import type { Request, Response } from 'express';
import type { SuggestionItem } from '@skillspell/shared';
import { GenerationService } from './generation.service.js';
import { LlmService } from './llm/llm.service.js';
import { SseService } from '../common/sse.service.js';
import { GenerateSkillDto } from './dto/generate-skill.dto.js';
import { RefineSkillDto } from './dto/refine-skill.dto.js';
import { OptimizeDraftDto } from './dto/optimize-draft.dto.js';
import { SuggestDto } from './dto/suggest.dto.js';
import { CheckOwnership } from '../ownership/decorators/check-ownership.decorator.js';

@Controller('generate')
export class GenerationController {
  private readonly logger = new Logger(GenerationController.name);

  constructor(
    private readonly generationService: GenerationService,
    private readonly llm: LlmService,
    private readonly sseService: SseService,
  ) {}

  /** Forward domain errors (HttpException) verbatim; sanitize everything else. */
  private sseErrorMessage(err: unknown, context: string): string {
    if (err instanceof HttpException) return err.message;
    this.logger.error(`${context}: ${(err as Error)?.message ?? String(err)}`, (err as Error)?.stack);
    return `${context} failed. Please try again.`;
  }

  /**
   * POST /api/generate — Generate a new skill, streamed via SSE.
   * Sends headers immediately to prevent gateway timeouts during long LLM calls.
   * Events: generate-started → generate-complete (with SkillWithSession) | generate-error
   */
  @Post()
  async generate(
    @Body() dto: GenerateSkillDto,
    @Req() req: Request,
    @Res() res: Response,
  ): Promise<void> {
    const { subject, ac, cleanup } = this.sseService.setup(req, res);
    subject.next(new MessageEvent('message', {
      data: JSON.stringify({ type: 'generate-started' }),
    }));
    try {
      const result = await this.generationService.generateSkill({
        prompt: dto.prompt,
        skillName: dto.skillName,
        signal: ac.signal,
      });
      subject.next(new MessageEvent('message', {
        data: JSON.stringify({ type: 'generate-complete', data: result }),
      }));
    } catch (err) {
      if (!ac.signal.aborted) {
        subject.next(new MessageEvent('message', {
          data: JSON.stringify({ type: 'generate-error', data: { message: this.sseErrorMessage(err, 'Skill generation') } }),
        }));
      }
    } finally {
      subject.complete();
      cleanup();
    }
  }

  /**
   * POST /api/generate/:id/refine — Refine an existing skill, streamed via SSE.
   * Sends headers immediately to prevent gateway timeouts during long LLM calls.
   * Events: refine-started → refine-complete (with SkillWithSession) | refine-error
   */
  @Post(':id/refine')
  @CheckOwnership('id')
  async refine(
    @Param('id', ParseUUIDPipe) id: string,
    @Body() dto: RefineSkillDto,
    @Req() req: Request,
    @Res() res: Response,
  ): Promise<void> {
    const { subject, ac, cleanup } = this.sseService.setup(req, res);
    subject.next(new MessageEvent('message', {
      data: JSON.stringify({ type: 'refine-started' }),
    }));
    try {
      const result = await this.generationService.refineSkill(id, dto.refinement, ac.signal);
      subject.next(new MessageEvent('message', {
        data: JSON.stringify({ type: 'refine-complete', data: result }),
      }));
    } catch (err) {
      if (!ac.signal.aborted) {
        subject.next(new MessageEvent('message', {
          data: JSON.stringify({ type: 'refine-error', data: { message: this.sseErrorMessage(err, 'Skill refinement') } }),
        }));
      }
    } finally {
      subject.complete();
      cleanup();
    }
  }

  /**
   * POST /api/generate/:id/optimize-draft — Generate an optimization draft, streamed via SSE.
   * Sends headers immediately to prevent gateway timeouts during long LLM calls.
   * Does NOT save the result to the database — frontend holds the draft until approval.
   * Events: optimize-draft-started → optimize-draft-complete (with OptimizeDraftResponse) | optimize-draft-error
   */
  @Post(':id/optimize-draft')
  @CheckOwnership('id')
  async optimizeDraft(
    @Param('id', ParseUUIDPipe) id: string,
    @Body() dto: OptimizeDraftDto,
    @Req() req: Request,
    @Res() res: Response,
  ): Promise<void> {
    const { subject, ac, cleanup } = this.sseService.setup(req, res);
    subject.next(new MessageEvent('message', {
      data: JSON.stringify({ type: 'optimize-draft-started' }),
    }));
    try {
      const result = await this.generationService.optimizeDraft(
        id,
        dto.refinement,
        dto.draftContext,
        ac.signal,
      );
      subject.next(new MessageEvent('message', {
        data: JSON.stringify({ type: 'optimize-draft-complete', data: result }),
      }));
    } catch (err) {
      if (!ac.signal.aborted) {
        subject.next(new MessageEvent('message', {
          data: JSON.stringify({ type: 'optimize-draft-error', data: { message: this.sseErrorMessage(err, 'Optimize draft') } }),
        }));
      }
    } finally {
      subject.complete();
      cleanup();
    }
  }

  /**
   * POST /api/generate/suggestions — Get smart context-aware suggestions.
   * Returns AI-generated suggestion chips for the builder or optimizer.
   */
  @Post('suggestions')
  async suggest(
    @Body() dto: SuggestDto,
  ): Promise<{ suggestions: SuggestionItem[] }> {
    const suggestions = await this.generationService.suggestPrompts(
      dto.mode,
      dto.partialInput,
      dto.skillId,
      dto.skillName,
    );
    return { suggestions };
  }

  /**
   * GET /api/generate/validate-skills — Validate that skills are loaded.
   * Queries the agent to check which skills are discoverable.
   */
  @Get('validate-skills')
  async validateSkills(): Promise<{ status: string; response: string }> {
    const response = await this.llm.validateSkillsLoaded();
    return { status: 'ok', response };
  }
}
