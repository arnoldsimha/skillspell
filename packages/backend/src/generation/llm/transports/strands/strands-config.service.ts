import { resolve } from 'node:path';
import { Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import type { AppConfig } from '../../../../config/configuration.js';
import { AnthropicModel } from '@strands-agents/sdk/models/anthropic';
import { BedrockModel } from '@strands-agents/sdk/models/bedrock';
import { OpenAIModel } from '@strands-agents/sdk/models/openai';
import { GoogleModel } from '@strands-agents/sdk/models/google';
import type { Model } from '@strands-agents/sdk';
import { configureLogging } from '@strands-agents/sdk';
import Anthropic from '@anthropic-ai/sdk';
import AnthropicFoundry from '@anthropic-ai/foundry-sdk';
import type { LlmProvider } from '../../../../config/strands.config.js';

@Injectable()
export class StrandsConfigService {
  private readonly logger = new Logger(StrandsConfigService.name);
  private readonly sdkLogger = new Logger('StrandsSDK');
  private readonly providerType: LlmProvider;
  private readonly providerApiKeys: Record<string, string | undefined>;
  private readonly awsRegion?: string;
  private readonly models: Record<string, string | undefined>;

  /** Memoized Anthropic-compatible client (Foundry for Azure, standard otherwise). */
  private client?: Anthropic;
  /** Memoized Strands Model for the configured provider. */
  private model?: Model;

  constructor(private readonly configService: ConfigService<AppConfig, true>) {
    const strandsConfig = this.configService.get('strands', { infer: true });
    this.providerType = strandsConfig.providerType;
    this.providerApiKeys = strandsConfig.providerApiKeys || {};
    this.awsRegion = strandsConfig.awsRegion;
    this.models = strandsConfig.models || {};

    // Quiet the Strands SDK's built-in logger. By default it logs streamed
    // model output and other verbose internals at debug/info. Route warn/error
    // through NestJS and drop debug/info to keep logs clean.
    configureLogging({
      debug: () => {},
      info: () => {},
      warn: (...args: unknown[]) => this.sdkLogger.warn(args.map(String).join(' ')),
      error: (...args: unknown[]) => this.sdkLogger.error(args.map(String).join(' ')),
    });

    this.logger.log(`Strands LLM provider: ${this.providerType}`);
  }

  /** The configured provider type. */
  getProvider(): LlmProvider {
    return this.providerType;
  }

  /** Timeout (ms) for heavy generation/agent calls. */
  getGenerationTimeoutMs(): number {
    return this.configService.get('ai.generationTimeoutMs', { infer: true });
  }

  /** Timeout (ms) for lightweight calls (suggestions, grading, diagrams). */
  getLightTimeoutMs(): number {
    return this.configService.get('ai.lightTimeoutMs', { infer: true });
  }

  /** True when the provider speaks the Anthropic Messages API (anthropic/azure). */
  isAnthropicCompatible(): boolean {
    return this.providerType === 'anthropic' || this.providerType === 'azure';
  }

  /**
   * Returns the Anthropic SDK client used by getModel() to build the Anthropic-family Strands model.
   *
   * Only valid for Anthropic-family providers. Other providers (bedrock/openai/
   * google) run exclusively through the Strands Model abstraction (getModel).
   */
  getClient(): Anthropic {
    if (this.client) {
      return this.client;
    }

    if (!this.isAnthropicCompatible()) {
      throw new Error(
        `getClient() is only available for anthropic/azure providers; ` +
          `provider "${this.providerType}" runs through the Strands Model abstraction.`,
      );
    }

    const aiConfig = this.configService.get('ai', { infer: true });
    const apiKey = aiConfig.apiKey;
    const apiBaseUrl = aiConfig.apiBaseUrl;
    const maxRetries = aiConfig.maxRetries;

    let client: Anthropic;
    if (this.providerType === 'azure') {
      this.logger.log(
        `Building Azure Foundry client (endpoint: ${apiBaseUrl}, maxRetries: ${maxRetries})`,
      );
      // AnthropicFoundry extends Anthropic (Foundry omits the Batch API);
      // safe to use anywhere an Anthropic client is expected.
      client = new AnthropicFoundry({ apiKey, baseURL: apiBaseUrl, maxRetries }) as unknown as Anthropic;
    } else {
      this.logger.log(
        `Building Anthropic client${apiBaseUrl ? ` (endpoint: ${apiBaseUrl})` : ''} (maxRetries: ${maxRetries})`,
      );
      client = new Anthropic({
        apiKey,
        maxRetries,
        ...(apiBaseUrl ? { baseURL: apiBaseUrl } : {}),
      });
    }

    this.client = client;
    return client;
  }

  /** Resolve the main model id for the configured provider. */
  getMainModel(): string {
    const aiConfig = this.configService.get('ai', { infer: true });
    switch (this.providerType) {
      case 'openai':
        return this.models.openai || aiConfig.model;
      case 'google':
        return this.models.google || aiConfig.model;
      case 'bedrock':
        return this.models.bedrock || aiConfig.model;
      case 'anthropic':
      case 'azure':
      default:
        return this.models.anthropic || aiConfig.model;
    }
  }

  /**
   * Resolve the light/fast model id for lightweight queries.
   * Falls back to the main model when no light model is configured.
   */
  getLightModel(): string {
    const aiConfig = this.configService.get('ai', { infer: true });
    switch (this.providerType) {
      case 'openai':
        return this.models.openaiLight || aiConfig.modelLight || this.getMainModel();
      case 'google':
        return this.models.googleLight || aiConfig.modelLight || this.getMainModel();
      case 'bedrock':
        return this.models.bedrockLight || aiConfig.modelLight || this.getMainModel();
      case 'anthropic':
      case 'azure':
      default:
        return this.models.anthropicLight || aiConfig.modelLight || this.getMainModel();
    }
  }

  /**
   * Resolve the skills-workspace directory, honoring the documented overrides
   * SKILLS_WORKSPACE_DIR (absolute workspace path) and SKILLS_PROJECT_DIR
   * (parent under which skills-workspace/ lives). Falls back to the cwd
   * heuristic (monorepo root, two levels up) for local development.
   */
  getSkillsWorkspaceDir(): string {
    const skills = this.configService.get('skills', { infer: true });
    if (skills.workspaceDir) {
      return resolve(skills.workspaceDir);
    }
    if (skills.projectDir) {
      return resolve(skills.projectDir, 'skills-workspace');
    }
    return resolve(process.cwd(), '..', '..', 'skills-workspace');
  }

  /**
   * Build (once) and return the provider-appropriate Strands Model.
   *
   * Every provider runs through Strands' Model abstraction so the agent loop,
   * tools, and structured output behave identically. Switching providers is a
   * matter of the LLM_PROVIDER env var plus that provider's credentials.
   */
  getModel(
    modelId?: string,
    genParams?: { maxTokens?: number; temperature?: number },
  ): Model {
    const gen = this.buildGenConfig(genParams);
    const hasGen = Object.keys(gen).length > 0;
    // Memoize only the bare default (no custom modelId, no per-call sampling
    // params); calls that pass maxTokens/temperature build a fresh model.
    if (!modelId && !hasGen && this.model) {
      return this.model;
    }

    const resolvedModelId = modelId || this.getMainModel();
    let model: Model;

    switch (this.providerType) {
      case 'openai': {
        const apiKey = this.providerApiKeys.openai;
        if (!apiKey) {
          throw new Error('LLM_PROVIDER=openai requires OPENAI_API_KEY');
        }
        this.logger.log(`Initializing OpenAI Model: ${resolvedModelId}`);
        model = new OpenAIModel({ modelId: resolvedModelId, apiKey, ...gen } as any);
        break;
      }
      case 'google': {
        const apiKey = this.providerApiKeys.google;
        if (!apiKey) {
          throw new Error('LLM_PROVIDER=google requires GOOGLE_API_KEY');
        }
        this.logger.log(`Initializing Google Model: ${resolvedModelId}`);
        model = new GoogleModel({ modelId: resolvedModelId, apiKey, ...gen } as any);
        break;
      }
      case 'bedrock': {
        this.logger.log(
          `Initializing Bedrock Model: ${resolvedModelId} (region: ${this.awsRegion ?? 'default'})`,
        );
        model = new BedrockModel({
          modelId: resolvedModelId,
          ...(this.awsRegion ? { region: this.awsRegion } : {}),
          ...gen,
        } as any);
        break;
      }
      case 'anthropic':
      case 'azure':
      default: {
        this.logger.log(
          `Initializing Anthropic Model (${this.providerType}): ${resolvedModelId}`,
        );
        model = new AnthropicModel({
          modelId: resolvedModelId,
          client: this.getClient(),
          ...gen,
        } as any);
        break;
      }
    }

    if (!modelId && !hasGen) {
      this.model = model;
    }
    return model;
  }

  /**
   * Map provider-neutral sampling knobs ({ maxTokens, temperature }) to the
   * provider-specific Strands model-config shape. Returns an empty object when
   * nothing is set (so the memoized default model is reused).
   * - Anthropic/Azure: maxTokens is a field; temperature goes through `params`.
   * - Bedrock/OpenAI:   maxTokens + temperature are explicit config fields.
   * - Google (Gemini):  both go through `params` (temperature, maxOutputTokens).
   */
  private buildGenConfig(genParams?: {
    maxTokens?: number;
    temperature?: number;
  }): Record<string, unknown> {
    if (!genParams) return {};
    const { maxTokens, temperature } = genParams;
    if (maxTokens == null && temperature == null) return {};

    switch (this.providerType) {
      case 'google': {
        const params: Record<string, unknown> = {};
        if (temperature != null) params.temperature = temperature;
        if (maxTokens != null) params.maxOutputTokens = maxTokens;
        return { params };
      }
      case 'anthropic':
      case 'azure': {
        const cfg: Record<string, unknown> = {};
        if (maxTokens != null) cfg.maxTokens = maxTokens;
        if (temperature != null) cfg.params = { temperature };
        return cfg;
      }
      case 'bedrock':
      case 'openai':
      default: {
        const cfg: Record<string, unknown> = {};
        if (maxTokens != null) cfg.maxTokens = maxTokens;
        if (temperature != null) cfg.temperature = temperature;
        return cfg;
      }
    }
  }
}
