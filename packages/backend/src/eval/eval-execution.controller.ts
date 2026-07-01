import {
  Controller,
  Get,
  Post,
  Delete,
  Body,
  Param,
  Query,
  Req,
  Res,
  HttpCode,
  HttpStatus,
  ParseUUIDPipe,
} from '@nestjs/common';
import type { Request, Response } from 'express';
import { ParseVersionPipe } from '../common/pipes/parse-version.pipe.js';
import { EvalExecutionService } from './eval-execution.service.js';
import { ExplainFailureService } from './explain-failure.service.js';
import { SseService } from '../common/sse.service.js';
import { RunEvalsDto } from './dto/index.js';
import type { EvalRun, EvalBenchmark, FailureExplanation } from '@skillspell/shared';
import { CheckOwnership } from '../ownership/decorators/check-ownership.decorator.js';

@Controller('skills/:skillId/evals')
@CheckOwnership('skillId')
export class EvalExecutionController {
  constructor(
    private readonly evalExecutionService: EvalExecutionService,
    private readonly explainFailureService: ExplainFailureService,
    private readonly sseService: SseService,
  ) {}

  /** POST /api/skills/:skillId/evals/run — Run eval cases. */
  @Post('run')
  @HttpCode(HttpStatus.ACCEPTED)
  async runEvals(
    @Param('skillId', ParseUUIDPipe) skillId: string,
    @Body() dto: RunEvalsDto,
  ): Promise<EvalRun[]> {
    return this.evalExecutionService.runEvals(skillId, dto);
  }

  /** POST /api/skills/:skillId/evals/run/stream — Run eval cases with SSE progress streaming. */
  @Post('run/stream')
  async runEvalsStreamed(
    @Param('skillId', ParseUUIDPipe) skillId: string,
    @Body() dto: RunEvalsDto,
    @Req() req: Request,
    @Res() res: Response,
  ): Promise<void> {
    const { subject, ac, cleanup } = this.sseService.setup(req, res);

    try {
      await this.evalExecutionService.runEvalsStreamed(skillId, dto, subject, ac);
    } finally {
      subject.complete();
      cleanup();
    }
  }

  /** GET /api/skills/:skillId/evals/runs — Get all eval runs for a skill. */
  @Get('runs')
  async getEvalRuns(
    @Param('skillId', ParseUUIDPipe) skillId: string,
    @Query('version', ParseVersionPipe) version?: number,
  ): Promise<EvalRun[]> {
    return this.evalExecutionService.getEvalRuns(skillId, version);
  }

  /** DELETE /api/skills/:skillId/evals/runs/:runId — Delete an eval run. */
  @Delete('runs/:runId')
  @HttpCode(HttpStatus.NO_CONTENT)
  async deleteEvalRun(
    @Param('skillId', ParseUUIDPipe) skillId: string,
    @Param('runId', ParseUUIDPipe) runId: string,
  ): Promise<void> {
    return this.evalExecutionService.deleteEvalRun(skillId, runId);
  }

  /** GET /api/skills/:skillId/evals/benchmark[/v:version] — Aggregated benchmark stats. */
  @Get(['benchmark', 'benchmark/v:version'])
  async getBenchmark(
    @Param('skillId', ParseUUIDPipe) skillId: string,
    @Param('version', ParseVersionPipe) version?: number,
  ): Promise<EvalBenchmark> {
    return this.evalExecutionService.getBenchmark(skillId, version);
  }

  /** GET /api/skills/:skillId/evals/runs/:runId/explain — Explain why an eval run failed. */
  @Get('runs/:runId/explain')
  async explainFailure(
    @Param('skillId', ParseUUIDPipe) skillId: string,
    @Param('runId', ParseUUIDPipe) runId: string,
  ): Promise<FailureExplanation> {
    return this.explainFailureService.explainFailure(skillId, runId);
  }
}
