import { Test, TestingModule } from '@nestjs/testing';
import { SkillGenerationService } from './skill-generation.service.js';
import { LlmService } from '../llm/llm.service.js';
import { PromptLoaderService } from '../prompts/prompt-loader.service.js';
import { ConfigService } from '@nestjs/config';

jest.mock('node:fs/promises', () => ({
  readFile: jest.fn().mockResolvedValue('mock reference content'),
}));

describe('SkillGenerationService - single LLM path', () => {
  let service: SkillGenerationService;
  let configService: jest.Mocked<ConfigService>;

  const mockLlm = {
    runAgentQuery: jest.fn().mockResolvedValue({
      content: JSON.stringify({
        name: 'test-skill',
        description: 'Test skill from LLM',
        skillContent: '---\nname: test\n---\n\nTest',
        scripts: [],
        references: [],
        assets: [],
      }),
      stats: {
        inputTokens: 100,
        outputTokens: 200,
      },
    }),
    runLightQuery: jest.fn(),
    skillsWorkspace: '/mock/workspace',
  };

  const mockPromptLoader = {
    render: jest.fn().mockResolvedValue('test prompt'),
  };

  beforeEach(async () => {
    configService = {
      get: jest.fn(() => ({ maxHistoryTokens: 2000 })),
    } as any;

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        SkillGenerationService,
        { provide: LlmService, useValue: mockLlm },
        { provide: PromptLoaderService, useValue: mockPromptLoader },
        { provide: ConfigService, useValue: configService },
      ],
    }).compile();

    await module.init(); // triggers onModuleInit to populate generationSystemPrompt
    service = module.get<SkillGenerationService>(SkillGenerationService);
  });

  afterEach(() => jest.clearAllMocks());

  it('generateSkill calls llm.runAgentQuery and returns the parsed result', async () => {
    const result = await service.generateSkill('Create a test skill');

    expect(mockLlm.runAgentQuery).toHaveBeenCalledTimes(1);
    expect(result).toHaveProperty('name', 'test-skill');
    expect(result.description).toContain('LLM');
  });

  describe('refineSkill', () => {
    it('refines skill via llm.runAgentQuery and returns parsed result', async () => {
      const existingSkill = {
        id: 'test-id',
        name: 'test-skill',
        description: 'Test skill',
        skillContent: '---\nname: test\n---\n\nOriginal content',
        version: 1,
      } as any;

      const result = await service.refineSkill(existingSkill, 'Make this better');

      expect(mockLlm.runAgentQuery).toHaveBeenCalledTimes(1);
      expect(result).toHaveProperty('skillContent');
      expect(result.skillContent).toContain('---');
    });
  });
});
