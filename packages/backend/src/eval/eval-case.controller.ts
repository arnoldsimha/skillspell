import {
  Controller,
  Get,
  Post,
  Put,
  Delete,
  Body,
  Param,
  HttpCode,
  HttpStatus,
  ParseUUIDPipe,
} from '@nestjs/common';
import { EvalCaseService } from './eval-case.service.js';
import { CreateEvalCaseDto, UpdateEvalCaseDto, BulkCreateEvalCasesDto } from './dto/index.js';
import type { EvalCase } from '@skillspell/shared';
import { CheckOwnership } from '../ownership/decorators/check-ownership.decorator.js';

@Controller('skills/:skillId/evals')
@CheckOwnership('skillId')
export class EvalCaseController {
  constructor(private readonly evalCaseService: EvalCaseService) {}

  /** POST /api/skills/:skillId/evals — Create a new eval case. */
  @Post()
  @HttpCode(HttpStatus.CREATED)
  async createEvalCase(
    @Param('skillId', ParseUUIDPipe) skillId: string,
    @Body() dto: CreateEvalCaseDto,
  ): Promise<EvalCase> {
    return this.evalCaseService.createEvalCase(skillId, dto);
  }

  /** GET /api/skills/:skillId/evals — List all eval cases for a skill. */
  @Get()
  async getEvalCases(@Param('skillId', ParseUUIDPipe) skillId: string): Promise<EvalCase[]> {
    return this.evalCaseService.getEvalCases(skillId);
  }

  /** PUT /api/skills/:skillId/evals/:evalId — Update an eval case. */
  @Put(':evalId')
  async updateEvalCase(
    @Param('skillId', ParseUUIDPipe) skillId: string,
    @Param('evalId', ParseUUIDPipe) evalId: string,
    @Body() dto: UpdateEvalCaseDto,
  ): Promise<EvalCase> {
    return this.evalCaseService.updateEvalCase(skillId, evalId, dto);
  }

  /** DELETE /api/skills/:skillId/evals/:evalId — Delete an eval case. */
  @Delete(':evalId')
  @HttpCode(HttpStatus.NO_CONTENT)
  async deleteEvalCase(
    @Param('skillId', ParseUUIDPipe) skillId: string,
    @Param('evalId', ParseUUIDPipe) evalId: string,
  ): Promise<void> {
    return this.evalCaseService.deleteEvalCase(skillId, evalId);
  }

  /** POST /api/skills/:skillId/evals/bulk — Bulk-create eval cases. */
  @Post('bulk')
  @HttpCode(HttpStatus.CREATED)
  async bulkCreateEvalCases(
    @Param('skillId', ParseUUIDPipe) skillId: string,
    @Body() dto: BulkCreateEvalCasesDto,
  ): Promise<EvalCase[]> {
    return this.evalCaseService.bulkCreateEvalCases(skillId, dto.cases);
  }
}
