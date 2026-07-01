import { z } from 'zod';

/**
 * Supported LLM providers. All run through the Strands Agent framework.
 * - anthropic: direct Anthropic API (api.anthropic.com or compatible)
 * - azure:     Azure AI Foundry Anthropic deployment (via Foundry client)
 * - bedrock:   AWS Bedrock (Anthropic models), uses AWS credentials
 * - openai:    OpenAI API
 * - google:    Google Gemini API
 */
export const LLM_PROVIDERS = ['anthropic', 'azure', 'bedrock', 'openai', 'google'] as const;
export type LlmProvider = (typeof LLM_PROVIDERS)[number];

export const StrandsConfigSchema = z.object({
  /** Selected provider (LLM_PROVIDER env var). */
  providerType: z.enum(LLM_PROVIDERS).default('anthropic'),
  /** Per-provider credentials/config, populated from env. */
  providerApiKeys: z
    .object({
      openai: z.string().optional(),
      google: z.string().optional(),
    })
    .default({}),
  /** AWS region for the bedrock provider. */
  awsRegion: z.string().optional(),
  /**
   * Per-provider model id overrides, populated from env at config load.
   * Centralized here so the resolution logic never reads process.env directly
   * (keeps it overridable in tests via a mocked ConfigService).
   */
  models: z
    .object({
      anthropic: z.string().optional(),
      anthropicLight: z.string().optional(),
      openai: z.string().optional(),
      openaiLight: z.string().optional(),
      google: z.string().optional(),
      googleLight: z.string().optional(),
      bedrock: z.string().optional(),
      bedrockLight: z.string().optional(),
    })
    .default({}),
});

export type StrandsConfig = z.infer<typeof StrandsConfigSchema>;

/**
 * Resolve the provider from env. Backward compatible: if LLM_PROVIDER is unset
 * but AI_API_BASE_URL points at an Azure endpoint, infer 'azure'.
 */
function resolveProvider(): LlmProvider {
  const explicit = process.env.LLM_PROVIDER?.toLowerCase();
  if (explicit && (LLM_PROVIDERS as readonly string[]).includes(explicit)) {
    return explicit as LlmProvider;
  }
  // Back-compat inference: an Azure base URL implies the azure provider.
  if (process.env.AI_API_BASE_URL && /azure/i.test(process.env.AI_API_BASE_URL)) {
    return 'azure';
  }
  return 'anthropic';
}

export function createStrandsConfig(): StrandsConfig {
  return {
    providerType: resolveProvider(),
    providerApiKeys: {
      openai: process.env.OPENAI_API_KEY,
      google: process.env.GOOGLE_API_KEY,
    },
    awsRegion: process.env.AWS_REGION,
    models: {
      anthropic: process.env.ANTHROPIC_MODEL,
      anthropicLight: process.env.ANTHROPIC_MODEL_LIGHT,
      openai: process.env.OPENAI_MODEL,
      openaiLight: process.env.OPENAI_MODEL_LIGHT,
      google: process.env.GOOGLE_MODEL,
      googleLight: process.env.GOOGLE_MODEL_LIGHT,
      bedrock: process.env.BEDROCK_MODEL,
      bedrockLight: process.env.BEDROCK_MODEL_LIGHT,
    },
  };
}
