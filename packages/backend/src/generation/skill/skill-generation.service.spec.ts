import { Test, TestingModule } from '@nestjs/testing';
import { ConfigService } from '@nestjs/config';
import { SkillGenerationService } from './skill-generation.service';
import { LlmService } from '../llm/llm.service.js';
import { PromptLoaderService } from '../prompts/prompt-loader.service';
import type { Skill } from '@skillspell/shared';

jest.mock('node:fs/promises', () => ({
  readFile: jest.fn().mockResolvedValue('mock reference content'),
}));

const makeSkill = (overrides: Partial<Skill> = {}): Skill =>
  ({
    id: 'skill-1',
    name: 'test-skill',
    description: 'A test skill',
    skillContent: '---\nname: test-skill\ndescription: A test skill\n---\n\n# Test Skill\n\n## Overview\nSome content\n\n## Usage\nHow to use it',
    scripts: [],
    references: [],
    assets: [],
    version: 1,
    status: 'ready',
    ownerId: 'user-1',
    createdAt: '2024-01-01T00:00:00.000Z',
    updatedAt: '2024-01-01T00:00:00.000Z',
    ...overrides,
  }) as Skill;

const makeAgentResult = (overrides = {}) => ({
  content: JSON.stringify({
    name: 'test-skill',
    description: 'A test skill',
    skillContent: '---\nname: test-skill\ndescription: A test skill\n---\n\n# Test Skill\n\n## Overview\nRefined content',
    scripts: [],
    references: [],
    assets: [],
    explanation: '• Made some changes',
  }),
  stats: {
    durationMs: 1500,
    inputTokens: 300,
    outputTokens: 200,
    cacheReadInputTokens: 0,
    cacheCreationInputTokens: 0,
    costUsd: 0,
    numTurns: 2,
  },
  ...overrides,
});

describe('SkillGenerationService — refineSkill', () => {
  let service: SkillGenerationService;
  let runAgentQueryMock: jest.Mock;
  let runLightQueryMock: jest.Mock;
  let sendMessageMock: jest.Mock;
  let renderMock: jest.Mock;

  beforeEach(async () => {
    runAgentQueryMock = jest.fn().mockResolvedValue(makeAgentResult());
    runLightQueryMock = jest.fn();
    sendMessageMock = jest.fn();
    renderMock = jest.fn();

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        SkillGenerationService,
        {
          provide: LlmService,
          useValue: {
            runAgentQuery: runAgentQueryMock,
            runLightQuery: runLightQueryMock,
            sendMessage: sendMessageMock,
            model: 'claude-sonnet-4-6',
            skillsWorkspace: '/mock/workspace',
          },
        },
        {
          provide: PromptLoaderService,
          useValue: { render: renderMock },
        },
        {
          provide: ConfigService,
          useValue: {
            get: jest.fn(() => ({ maxHistoryTokens: 2000 })),
          },
        },
      ],
    }).compile();

    await module.init(); // triggers onModuleInit to populate generationSystemPrompt
    service = module.get<SkillGenerationService>(SkillGenerationService);

    const logger = (service as any).logger;
    jest.spyOn(logger, 'log').mockImplementation(() => {});
    jest.spyOn(logger, 'warn').mockImplementation(() => {});
    jest.spyOn(logger, 'debug').mockImplementation(() => {});
    jest.spyOn(logger, 'error').mockImplementation(() => {});
  });

  afterEach(() => {
    jest.restoreAllMocks();
  });

  it('calls runAgentQuery with generationSystemPrompt (preloaded references)', async () => {
    const skill = makeSkill();

    await service.refineSkill(skill, 'Add error handling');

    expect(runAgentQueryMock).toHaveBeenCalledTimes(1);
    const [systemPrompt] = runAgentQueryMock.mock.calls[0];
    expect(systemPrompt).toContain('already loaded in context');
    expect(systemPrompt).toContain('mock reference content');
  });

  it('user message contains <existing_skill> block with skill JSON', async () => {
    const skill = makeSkill();

    await service.refineSkill(skill, 'Add error handling');

    const [, userMessage] = runAgentQueryMock.mock.calls[0];
    expect(userMessage).toContain('<existing_skill>');
    expect(userMessage).toContain('test-skill');
    expect(userMessage).toContain('</existing_skill>');
  });

  it('user message contains <optimization_history> block', async () => {
    const skill = makeSkill();

    await service.refineSkill(skill, 'Add error handling', [
      { role: 'user', content: 'Make descriptions concise' },
    ]);

    const [, userMessage] = runAgentQueryMock.mock.calls[0];
    expect(userMessage).toContain('<optimization_history>');
    expect(userMessage).toContain('</optimization_history>');
  });

  it('user message contains <user_request> block with refinement prompt', async () => {
    const skill = makeSkill();

    await service.refineSkill(skill, 'Add error handling');

    const [, userMessage] = runAgentQueryMock.mock.calls[0];
    expect(userMessage).toContain('<user_request>');
    expect(userMessage).toContain('Add error handling');
    expect(userMessage).toContain('</user_request>');
  });

  it('does not call promptLoaderService.render', async () => {
    const skill = makeSkill();

    await service.refineSkill(skill, 'Add error handling');

    expect(renderMock).not.toHaveBeenCalled();
  });

  it('does not call runLightQuery (no classifier)', async () => {
    const skill = makeSkill();

    await service.refineSkill(skill, 'Add error handling');

    expect(runLightQueryMock).not.toHaveBeenCalled();
  });

  it('does not call sendMessage (no Messages API path)', async () => {
    const skill = makeSkill();

    await service.refineSkill(skill, 'Add error handling');

    expect(sendMessageMock).not.toHaveBeenCalled();
  });

  it('returns a SkillGenerationResult with stats', async () => {
    const skill = makeSkill();

    const result = await service.refineSkill(skill, 'Add error handling');

    expect(result.name).toBe('test-skill');
    expect(result.skillContent).toContain('Refined content');
    expect(result.stats).toBeDefined();
    expect(result.stats?.durationMs).toBe(1500);
  });

  it('passes AbortSignal to runAgentQuery', async () => {
    const skill = makeSkill();
    const controller = new AbortController();

    await service.refineSkill(skill, 'Add error handling', [], controller.signal);

    expect(runAgentQueryMock).toHaveBeenCalledWith(
      expect.any(String),
      expect.any(String),
      expect.any(Object),
      controller.signal,
    );
  });
});

describe('SkillGenerationService — generateSkill', () => {
  let service: SkillGenerationService;
  let runAgentQueryMock: jest.Mock;
  let renderMock: jest.Mock;

  beforeEach(async () => {

    runAgentQueryMock = jest.fn().mockResolvedValue({
      content: JSON.stringify({
        name: 'test-skill',
        description: 'A test skill',
        skillContent: '---\nname: test-skill\ndescription: A test skill\n---\n\n# Test\n\nContent.',
        scripts: [],
        references: [],
        assets: [],
        explanation: '• Generated test skill',
      }),
      stats: {
        durationMs: 100,
        inputTokens: 50,
        outputTokens: 100,
        cacheReadInputTokens: 0,
        cacheCreationInputTokens: 0,
        costUsd: 0,
        numTurns: 1,
      },
    });
    renderMock = jest.fn();

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        SkillGenerationService,
        {
          provide: LlmService,
          useValue: {
            runAgentQuery: runAgentQueryMock,
            runLightQuery: jest.fn(),
            sendMessage: jest.fn(),
            skillsWorkspace: '/mock/workspace',
          },
        },
        {
          provide: PromptLoaderService,
          useValue: { render: renderMock },
        },
        {
          provide: ConfigService,
          useValue: {
            get: jest.fn(() => ({ maxHistoryTokens: 2000 })),
          },
        },
      ],
    }).compile();

    await module.init(); // triggers onModuleInit lifecycle hook
    service = module.get<SkillGenerationService>(SkillGenerationService);
  });

  afterEach(() => jest.restoreAllMocks());

  it('injects preloaded reference files into the system prompt', async () => {
    await service.generateSkill('create a skill for writing emails');

    const [systemPrompt] = runAgentQueryMock.mock.calls[0];
    expect(systemPrompt).toContain('already loaded in context');
    expect(systemPrompt).toContain('mock reference content');
  });

  it('passes the user prompt as the second argument', async () => {
    await service.generateSkill('create a skill for writing emails');

    const [, userPrompt, options] = runAgentQueryMock.mock.calls[0];
    expect(userPrompt).toBe('create a skill for writing emails');
    expect(options).toMatchObject({ maxTurns: 5 });
  });

  it('does not call promptLoaderService.render', async () => {
    await service.generateSkill('create a skill for writing emails');

    expect(renderMock).not.toHaveBeenCalled();
  });
});
