import { Module } from '@nestjs/common';
import { ConfigModule } from '@nestjs/config';
import { SseService } from '../common/sse.service.js';
import { PromptLoaderService } from './prompts/prompt-loader.service.js';
import { PromptDumpService } from './prompts/prompt-dump.service.js';
import { SkillGenerationService } from './skill/skill-generation.service.js';
import { SkillValidatorService } from './skill/skill-validator.service.js';
import { DiagramService } from './skill/diagram.service.js';
import { GenerationService } from './generation.service.js';
import { SessionService } from './session/session.service.js';
import { GenerationController } from './generation.controller.js';
import { TriggerEvaluatorService } from './description-optimizer/trigger-evaluator.service.js';
import { DescriptionOptimizerService } from './description-optimizer/description-optimizer.service.js';
import { DescriptionOptimizerController } from './description-optimizer/description-optimizer.controller.js';
import { LlmModule } from './llm/llm.module.js';

/**
 * Generation module — handles LLM-based skill generation and refinement.
 *
 * Skills are discovered by the Strands AgentSkills plugin from
 * `skills-workspace/skills/`. No manual skill loading is needed.
 *
 * Session history is stored in PostgreSQL (not on disk) so that refinements
 * work across multiple server instances and survive container restarts.
 *
 * Ownership is enforced at the route level by the global SkillOwnerGuard
 * (via @CheckOwnership decorator) — no OwnershipModule import needed.
 *
 * Provides:
 * - PromptLoaderService: loads prompt templates from .md files at startup
 * - PromptDumpService: dev-only debug service to dump prompts to disk
 * - LlmService (via LlmModule): provider-agnostic LLM entry point
 * - SkillGenerationService: generate + refine skills, prompt suggestions
 * - DiagramService: Mermaid diagram generation from skill content
 * - SessionService: manages conversation history in PostgreSQL with TTL
 * - GenerationService: orchestrates generate -> auto-save -> refine flow
 * - GenerationController: REST endpoints for generation and refinement
 */
@Module({
  imports: [ConfigModule, LlmModule],
  controllers: [GenerationController, DescriptionOptimizerController],
  providers: [
    SseService,
    PromptLoaderService,
    PromptDumpService,
    SkillGenerationService,
    SkillValidatorService,
    DiagramService,
    SessionService,
    GenerationService,
    TriggerEvaluatorService,
    DescriptionOptimizerService,
  ],
  exports: [
    // Re-export LlmModule so consumers (e.g. EvalModule) get LlmService.
    LlmModule,
    PromptLoaderService,
    PromptDumpService,
    SkillGenerationService,
    SkillValidatorService,
    DiagramService,
    SessionService,
    GenerationService,
    TriggerEvaluatorService,
    DescriptionOptimizerService,
  ],
})
export class GenerationModule {}
