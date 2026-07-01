import { Test, TestingModule } from '@nestjs/testing';
import { StrandsTransport } from './strands.transport.js';
import { StrandsConfigService } from './strands-config.service.js';
import { PromptDumpService } from '../../../prompts/prompt-dump.service.js';

describe('StrandsTransport', () => {
  let service: StrandsTransport;
  let configService: jest.Mocked<StrandsConfigService>;
  let promptDump: jest.Mocked<PromptDumpService>;

  beforeEach(async () => {
    configService = {
      getModel: jest.fn(),
      getMainModel: jest.fn().mockReturnValue('test-model'),
      getLightModel: jest.fn().mockReturnValue('test-model-light'),
      getProvider: jest.fn().mockReturnValue('anthropic'),
      isAnthropicCompatible: jest.fn().mockReturnValue(true),
      getClient: jest.fn(),
      getGenerationTimeoutMs: jest.fn().mockReturnValue(600000),
      getLightTimeoutMs: jest.fn().mockReturnValue(30000),
      getSkillsWorkspaceDir: jest
        .fn()
        .mockReturnValue(
          require('node:path').resolve(process.cwd(), '..', '..', 'skills-workspace'),
        ),
    } as any;

    promptDump = {
      generateId: jest.fn().mockReturnValue('test-dump-id'),
      write: jest.fn(),
    } as any;

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        StrandsTransport,
        { provide: StrandsConfigService, useValue: configService },
        { provide: PromptDumpService, useValue: promptDump },
      ],
    }).compile();

    service = module.get<StrandsTransport>(StrandsTransport);
  });

  it('should be defined', () => {
    expect(service).toBeDefined();
  });

  it('runAgentQuery should return AgentQueryResult with content', async () => {
    const mockModel = {};

    configService.getModel.mockReturnValue(mockModel as any);

    const result = await service.runAgentQuery(
      'Test system prompt',
      'Test user prompt',
    );

    expect(result).toHaveProperty('content');
    expect(result.content).toBe('Mock agent response');
    expect(result).toHaveProperty('stats');
    expect(result.stats).toHaveProperty('inputTokens');
    expect(result.stats).toHaveProperty('outputTokens');
  });
});
