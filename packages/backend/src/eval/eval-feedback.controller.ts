import {
  Controller,
  Get,
  Post,
  Body,
  Param,
  Req,
  Res,
  HttpCode,
  HttpStatus,
  ParseUUIDPipe,
} from '@nestjs/common';
import type { Request, Response } from 'express';
import { EvalFeedbackService } from './eval-feedback.service.js';
import { SkillOptimizationService } from './optimization/skill-optimization.service.js';
import { SseService, onClientDisconnect } from '../common/sse.service.js';
import {
  SaveFeedbackDto,
  SuggestTestPromptsDto,
  GenerateTestEvalsDto,
  SuggestAssertionReplacementsDto,
  OptimizeSkillDto,
  SuggestGapCountsDto,
} from './dto/index.js';
import type {
  EvalFeedback,
  AssertionReplacementSuggestion,
  SkillOptimizationConfig,
} from '@skillspell/shared';
import type { TestPromptSuggestion } from '../generation/types.js';
import { CheckOwnership } from '../ownership/decorators/check-ownership.decorator.js';

@Controller('skills/:skillId/evals')
@CheckOwnership('skillId')
export class EvalFeedbackController {
  constructor(
    private readonly evalFeedbackService: EvalFeedbackService,
    private readonly skillOptimizationService: SkillOptimizationService,
    private readonly sseService: SseService,
  ) {}

  /** GET /api/skills/:skillId/evals/feedback — Get all feedback for a skill. */
  @Get('feedback')
  async getFeedbackBySkill(
    @Param('skillId', ParseUUIDPipe) skillId: string,
  ): Promise<EvalFeedback[]> {
    return this.evalFeedbackService.getFeedbackBySkill(skillId);
  }

  /** POST /api/skills/:skillId/evals/feedback — Save feedback on an eval run. */
  @Post('feedback')
  @HttpCode(HttpStatus.CREATED)
  async saveFeedback(
    @Param('skillId', ParseUUIDPipe) skillId: string,
    @Body() dto: SaveFeedbackDto,
  ): Promise<EvalFeedback> {
    return this.evalFeedbackService.saveFeedback(skillId, dto);
  }

  /** POST /api/skills/:skillId/evals/suggest-prompts — AI-generated test prompt suggestions. */
  @Post('suggest-prompts')
  async suggestTestPrompts(
    @Param('skillId', ParseUUIDPipe) skillId: string,
    @Body() dto: SuggestTestPromptsDto,
    @Req() req: Request,
    @Res({ passthrough: true }) res: Response,
  ): Promise<{ suggestions: TestPromptSuggestion[] }> {
    const { signal } = onClientDisconnect(req, res);
    const suggestions = await this.evalFeedbackService.suggestTestPrompts(
      skillId,
      dto.existingPrompt,
      signal,
      dto.testCaseName,
    );
    return { suggestions };
  }

  /** POST /api/skills/:skillId/evals/generate — AI-generate test eval cases (SSE). */
  @Post('generate')
  async generateTestEvals(
    @Param('skillId', ParseUUIDPipe) skillId: string,
    @Body() dto: GenerateTestEvalsDto,
    @Req() req: Request,
    @Res() res: Response,
  ): Promise<void> {
    const { subject, ac, cleanup } = this.sseService.setup(req, res);

    try {
      const cases = await this.evalFeedbackService.generateTestEvals(
        skillId,
        dto.count,
        ac.signal,
        (phase, current, total) => {
          subject.next(new MessageEvent('message', {
            data: JSON.stringify({ type: 'generate-progress', data: { phase, current, total } }),
          }));
        },
        dto.coverageHint,
      );
      subject.next(new MessageEvent('message', {
        data: JSON.stringify({ type: 'generate-complete', data: { cases } }),
      }));
    } catch (err) {
      if (!ac.signal.aborted) {
        const message = err instanceof Error ? err.message : 'Test case generation failed';
        subject.next(new MessageEvent('message', {
          data: JSON.stringify({ type: 'generate-error', data: { message } }),
        }));
      }
    } finally {
      subject.complete();
      cleanup();
    }
  }

  /** POST /api/skills/:skillId/evals/suggest-count — AI-suggest test case count + reasoning. */
  @Post('suggest-count')
  async suggestTestCaseCount(
    @Param('skillId', ParseUUIDPipe) skillId: string,
    @Req() req: Request,
    @Res({ passthrough: true }) res: Response,
  ): Promise<{ count: number; reasoning: string }> {
    const { signal } = onClientDisconnect(req, res);
    return this.evalFeedbackService.suggestTestCaseCount(skillId, signal);
  }

  /** POST /api/skills/:skillId/evals/suggest-assertions — AI-suggest assertion replacements. */
  @Post('suggest-assertions')
  async suggestAssertionReplacements(
    @Param('skillId', ParseUUIDPipe) skillId: string,
    @Body() dto: SuggestAssertionReplacementsDto,
    @Req() req: Request,
    @Res({ passthrough: true }) res: Response,
  ): Promise<{ suggestions: AssertionReplacementSuggestion[] }> {
    const { signal } = onClientDisconnect(req, res);
    const suggestions = await this.evalFeedbackService.suggestAssertionReplacements(
      skillId,
      dto.assertions,
      signal,
    );
    return { suggestions };
  }

  /** POST /api/skills/:skillId/evals/suggest-gap-counts — AI-suggest test case counts per coverage gap. */
  @Post('suggest-gap-counts')
  async suggestGapCounts(
    @Param('skillId', ParseUUIDPipe) skillId: string,
    @Body() dto: SuggestGapCountsDto,
    @Req() req: Request,
    @Res({ passthrough: true }) res: Response,
  ): Promise<{ counts: Record<string, number> }> {
    const { signal } = onClientDisconnect(req, res);
    const counts = await this.evalFeedbackService.suggestGapCounts(skillId, dto.gaps, signal);
    return { counts };
  }

  /** POST /api/skills/:skillId/evals/optimize — Start automated skill optimization (SSE). */
  @Post('optimize')
  async optimizeSkill(
    @Param('skillId', ParseUUIDPipe) skillId: string,
    @Body() config: OptimizeSkillDto,
    @Req() req: Request,
    @Res() res: Response,
  ): Promise<void> {
    const { subject, ac, cleanup } = this.sseService.setup(req, res);

    const optimizationConfig: SkillOptimizationConfig = {
      maxIterations: config.maxIterations ?? 3,
      targetPassRate: config.targetPassRate,
      includeFeedback: config.includeFeedback,
      evalModel: config.evalModel,
    };

    try {
      await this.skillOptimizationService.runLoop(skillId, optimizationConfig, subject, ac);
    } finally {
      subject.complete();
      cleanup();
    }
  }
}
