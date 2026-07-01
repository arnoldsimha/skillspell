import { Module } from '@nestjs/common';
import { GenerationModule } from '../generation/generation.module.js';
import { SkillsModule } from '../skills/skills.module.js';
import { EvalCaseService } from './eval-case.service.js';
import { SseService } from '../common/sse.service.js';
import { EvalExecutionService } from './eval-execution.service.js';
import { EvalFeedbackService } from './eval-feedback.service.js';
import { EvalSuggestionService } from './eval-suggestion.service.js';
import { EvalRunnerService } from './eval-runner.service.js';
import { GradingService } from './grading.service.js';
import { BenchmarkService } from './benchmark.service.js';
import { EvalCaseController } from './eval-case.controller.js';
import { EvalExecutionController } from './eval-execution.controller.js';
import { EvalFeedbackController } from './eval-feedback.controller.js';
import { ExplainFailureService } from './explain-failure.service.js';
import { SkillOptimizationService } from './optimization/skill-optimization.service.js';
import { RedisDraftStore } from './optimization/redis-draft-store.js';
import { DRAFT_STORE } from './optimization/draft-store.interface.js';

/**
 * Eval module — handles eval case management, running evals, and feedback.
 *
 * Ownership is enforced at the route level by the global SkillOwnerGuard
 * (via @CheckOwnership decorator on EvalController) — no OwnershipModule
 * import needed.
 *
 * C1: SkillOptimizationService orchestrates the automated improvement loop.
 * DRAFT_STORE abstraction allows swapping from InMemoryDraftStore (V1)
 * to PostgresDraftStore or RedisDraftStore (V2) without changing the service.
 *
 * Provides:
 * - EvalCaseService: CRUD for eval cases (test cases)
 * - EvalExecutionService: running evals, grading, benchmarks
 * - EvalFeedbackService: feedback, AI-driven improvement, suggestions
 * - EvalSuggestionService: AI-generated test prompt and eval case suggestions
 * - EvalRunnerService: executes individual eval runs via Claude Messages API
 * - GradingService: grades eval outputs against assertions using Claude
 * - BenchmarkService: aggregates benchmark statistics
 * - ExplainFailureService: C3 plain-language failure explanations
 * - SkillOptimizationService: C2 automated optimization loop
 * - EvalController: REST endpoints nested under /api/skills/:skillId/evals
 */
@Module({
  imports: [
    GenerationModule,
    SkillsModule,
  ],
  controllers: [EvalCaseController, EvalExecutionController, EvalFeedbackController],
  providers: [
    SseService,
    EvalCaseService,
    EvalExecutionService,
    EvalFeedbackService,
    EvalSuggestionService,
    EvalRunnerService,
    GradingService,
    BenchmarkService,
    ExplainFailureService,
    SkillOptimizationService,
    // C2: Draft storage — V2: RedisDraftStore persists drafts across pod restarts
    { provide: DRAFT_STORE, useClass: RedisDraftStore },
  ],
  exports: [EvalCaseService, EvalExecutionService, EvalFeedbackService, SkillOptimizationService],
})
export class EvalModule {}
