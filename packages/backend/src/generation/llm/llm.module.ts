import { Module } from '@nestjs/common';
import { StrandsConfigService } from './transports/strands/strands-config.service.js';
import { StrandsTransport } from './transports/strands/strands.transport.js';
import { LlmService } from './llm.service.js';
import { LLM_TRANSPORT } from './llm-transport.port.js';
import { PromptDumpService } from '../prompts/prompt-dump.service.js';

/**
 * Strands LLM module.
 *
 * Provides multi-provider LLM support (anthropic/azure/bedrock/openai/google)
 * via the Strands Agent framework. LlmService is the single public entry point
 * every feature injects; it delegates to the LLM_TRANSPORT adapter (StrandsTransport
 * today — swap the binding to change frameworks). StrandsConfigService owns
 * provider/model selection. Skills are discovered from skills-workspace/skills/.
 */
@Module({
  providers: [
    StrandsConfigService,
    StrandsTransport,
    { provide: LLM_TRANSPORT, useExisting: StrandsTransport },
    LlmService,
    PromptDumpService,
  ],
  exports: [LlmService, StrandsConfigService],
})
export class LlmModule {}
