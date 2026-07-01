import { Controller, Post, Body, Param, ParseUUIDPipe, Req, Res } from '@nestjs/common';
import type { Request, Response } from 'express';
import type {
  GenerateTriggerEvalsResponse,
  DescriptionOptimizationResult,
  Skill,
} from '@skillspell/shared';
import { DescriptionOptimizerService } from './description-optimizer.service.js';
import {
  GenerateTriggerEvalsDto,
  RunDescriptionOptimizationDto,
  ApplyOptimizedDescriptionDto,
} from '../dto/optimize-description.dto.js';
import { CheckOwnership } from '../../ownership/decorators/check-ownership.decorator.js';
import { onClientDisconnect } from '../../common/sse.service.js';

/**
 * Controller for the Description Optimization feature (Phase 3).
 *
 * Endpoints are nested under /api/generate/:id/optimize-description/.
 * All endpoints require skill ownership via @CheckOwnership.
 *
 * Flow:
 * 1. POST .../trigger-evals — Generate eval queries
 * 2. POST .../run — Run the optimization loop
 * 3. POST .../apply — Apply the best description
 */
@Controller('generate')
export class DescriptionOptimizerController {
  constructor(
    private readonly optimizer: DescriptionOptimizerService,
  ) {}

  /**
   * POST /api/generate/:id/optimize-description/trigger-evals
   *
   * Step 1: Generate trigger eval queries from the skill's content.
   * Returns a set of queries with expected trigger behavior for user review.
   */
  @Post(':id/optimize-description/trigger-evals')
  @CheckOwnership('id')
  async generateTriggerEvals(
    @Param('id', ParseUUIDPipe) id: string,
    @Body() dto: GenerateTriggerEvalsDto,
  ): Promise<GenerateTriggerEvalsResponse> {
    return this.optimizer.generateTriggerEvals(id, dto.count ?? 20);
  }

  /**
   * POST /api/generate/:id/optimize-description/run
   *
   * Step 3: Run the optimization loop with user-reviewed eval queries.
   * Returns all iterations with scores and the best description.
   *
   * Supports cancellation: if the client disconnects (e.g., user clicks Cancel),
   * the AbortSignal fires and the loop stops at the next iteration boundary.
   */
  @Post(':id/optimize-description/run')
  @CheckOwnership('id')
  async runOptimization(
    @Param('id', ParseUUIDPipe) id: string,
    @Body() dto: RunDescriptionOptimizationDto,
    @Req() req: Request,
    @Res({ passthrough: true }) res: Response,
  ): Promise<DescriptionOptimizationResult> {
    const ac = onClientDisconnect(req, res);
    return this.optimizer.runOptimizationLoop(
      id,
      dto.queries,
      undefined,  // maxIterations — use service default (5)
      undefined,  // runsPerQuery — use service default (1)
      ac.signal,
    );
  }

  /**
   * POST /api/generate/:id/optimize-description/apply
   *
   * Step 4: Apply the optimized description to the skill.
   * Updates the skill's description in the database.
   */
  @Post(':id/optimize-description/apply')
  @CheckOwnership('id')
  async applyDescription(
    @Param('id', ParseUUIDPipe) id: string,
    @Body() dto: ApplyOptimizedDescriptionDto,
  ): Promise<Skill> {
    return this.optimizer.applyOptimizedDescription(id, dto.description);
  }
}
