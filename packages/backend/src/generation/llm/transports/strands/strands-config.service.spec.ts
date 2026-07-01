import { resolve } from 'node:path';
import { ConfigService } from '@nestjs/config';
import { StrandsConfigService } from './strands-config.service.js';

/**
 * Builds a StrandsConfigService over a mocked ConfigService.
 * Mirrors the three config namespaces the service reads: strands / ai / skills.
 */
function makeService(opts: {
  provider?: string;
  models?: Record<string, string | undefined>;
  ai?: { model?: string; modelLight?: string };
  skills?: { projectDir?: string; workspaceDir?: string };
  apiKeys?: Record<string, string>;
}): StrandsConfigService {
  const strands = {
    providerType: opts.provider ?? 'anthropic',
    providerApiKeys: opts.apiKeys ?? {},
    awsRegion: undefined,
    models: opts.models ?? {},
  };
  const ai = {
    model: opts.ai?.model ?? 'main-model',
    modelLight: opts.ai?.modelLight,
    generationTimeoutMs: 1,
    lightTimeoutMs: 1,
    apiKey: 'k',
    apiBaseUrl: undefined,
    maxRetries: 0,
  };
  const skills = {
    projectDir: opts.skills?.projectDir ?? '',
    workspaceDir: opts.skills?.workspaceDir ?? '',
  };
  const cfg = {
    get: (key: string) => ({ strands, ai, skills }[key]),
  } as unknown as ConfigService<Record<string, unknown>, true>;
  return new StrandsConfigService(cfg);
}

describe('StrandsConfigService model resolution', () => {
  it('reads per-provider model from config, not process.env (F-03)', () => {
    process.env.BEDROCK_MODEL = 'env-should-be-ignored';
    const svc = makeService({ provider: 'bedrock', models: { bedrock: 'cfg-bedrock' } });
    expect(svc.getMainModel()).toBe('cfg-bedrock');
    delete process.env.BEDROCK_MODEL;
  });

  it('getLightModel() uses the bedrock light model for the bedrock provider (F-01)', () => {
    const svc = makeService({
      provider: 'bedrock',
      models: { bedrock: 'cfg-bedrock', bedrockLight: 'cfg-bedrock-light' },
    });
    expect(svc.getLightModel()).toBe('cfg-bedrock-light');
  });

  it('bedrock light falls back to the main model when no light model is set', () => {
    const svc = makeService({ provider: 'bedrock', models: { bedrock: 'cfg-bedrock' } });
    expect(svc.getLightModel()).toBe('cfg-bedrock');
  });

  it('resolves openai/google main + light models from config', () => {
    const svc = makeService({
      provider: 'openai',
      models: { openai: 'gpt', openaiLight: 'gpt-mini' },
    });
    expect(svc.getMainModel()).toBe('gpt');
    expect(svc.getLightModel()).toBe('gpt-mini');
  });
});

describe('StrandsConfigService.getSkillsWorkspaceDir (F-02)', () => {
  it('honors SKILLS_WORKSPACE_DIR when set', () => {
    const svc = makeService({ skills: { workspaceDir: '/srv/app/skills-workspace' } });
    expect(svc.getSkillsWorkspaceDir()).toBe(resolve('/srv/app/skills-workspace'));
  });

  it('derives from SKILLS_PROJECT_DIR when workspace dir is unset', () => {
    const svc = makeService({ skills: { projectDir: '/srv/app' } });
    expect(svc.getSkillsWorkspaceDir()).toBe(resolve('/srv/app', 'skills-workspace'));
  });

  it('falls back to the cwd heuristic when neither override is set', () => {
    const svc = makeService({});
    expect(svc.getSkillsWorkspaceDir()).toBe(
      resolve(process.cwd(), '..', '..', 'skills-workspace'),
    );
  });
});

describe('StrandsConfigService.getModel sampling params (maxTokens/temperature no longer dropped)', () => {
  it('anthropic: maxTokens as a field, temperature via params', () => {
    const m = makeService({ provider: 'anthropic' }).getModel(undefined, {
      maxTokens: 123,
      temperature: 0.3,
    }) as any;
    expect(m.config.maxTokens).toBe(123);
    expect(m.config.params).toEqual({ temperature: 0.3 });
  });

  it('bedrock: maxTokens + temperature as explicit fields', () => {
    const m = makeService({ provider: 'bedrock' }).getModel(undefined, {
      maxTokens: 50,
      temperature: 0.7,
    }) as any;
    expect(m.config.maxTokens).toBe(50);
    expect(m.config.temperature).toBe(0.7);
  });

  it('openai: maxTokens + temperature as explicit fields', () => {
    const m = makeService({ provider: 'openai', apiKeys: { openai: 'k' } }).getModel(
      undefined,
      { maxTokens: 50, temperature: 0.5 },
    ) as any;
    expect(m.config.maxTokens).toBe(50);
    expect(m.config.temperature).toBe(0.5);
  });

  it('google: both via params (temperature + maxOutputTokens)', () => {
    const m = makeService({ provider: 'google', apiKeys: { google: 'k' } }).getModel(
      undefined,
      { maxTokens: 64, temperature: 0.2 },
    ) as any;
    expect(m.config.params).toEqual({ temperature: 0.2, maxOutputTokens: 64 });
  });

  it('omits sampling fields when no params are given', () => {
    const m = makeService({ provider: 'anthropic' }).getModel() as any;
    expect(m.config.maxTokens).toBeUndefined();
    expect(m.config.params).toBeUndefined();
  });
});
