import { Test, TestingModule } from '@nestjs/testing';
import { GenerationService } from './generation.service.js';
import { SkillGenerationService } from './skill/skill-generation.service.js';
import { StrandsTransport } from './llm/transports/strands/strands.transport.js';
import { ConfigService } from '@nestjs/config';
import { SKILL_REPOSITORY } from '@skillspell/shared';
import { SkillValidatorService } from './skill/skill-validator.service.js';
import { DiagramService } from './skill/diagram.service.js';
import { SessionService } from './session/session.service.js';
import { RequestContext } from '../common/context/request-context.service.js';

describe('Generation Pipeline - Strands Integration', () => {
  let generationService: GenerationService;
  let skillGenService: SkillGenerationService;

  beforeEach(async () => {
    const mockStrandsAgent = {
      runAgentQuery: jest.fn().mockResolvedValue({
        content: JSON.stringify({
          name: 'document-analyzer',
          description: 'Analyzes documents and extracts key information',
          skillContent: `---
name: document-analyzer
description: Analyzes documents and extracts key information
---

# Document Analyzer

You are a document analysis expert.

## Process

1. Read the document
2. Identify key sections
3. Extract metadata
4. Return structured summary`,
          scripts: [],
          references: [],
          assets: [],
        }),
        stats: {
          inputTokens: 500,
          outputTokens: 300,
        },
      }),
    };

    const mockSkillGenService = {
      generateSkill: jest.fn().mockResolvedValue({
        name: 'document-analyzer',
        description: 'Analyzes documents and extracts key information',
        skillContent: `---
name: document-analyzer
description: Analyzes documents and extracts key information
---

# Document Analyzer

You are a document analysis expert.

## Process

1. Read the document
2. Identify key sections
3. Extract metadata
4. Return structured summary`,
        scripts: [],
        references: [],
        assets: [],
        explanation: 'Generated using Strands agent with document analysis capabilities.',
        stats: {
          inputTokens: 500,
          outputTokens: 300,
        },
      }),
    };

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        GenerationService,
        { provide: SkillGenerationService, useValue: mockSkillGenService },
        { provide: StrandsTransport, useValue: mockStrandsAgent },
        {
          provide: SKILL_REPOSITORY,
          useValue: {
            findByName: jest.fn().mockResolvedValue(null),
            create: jest.fn().mockResolvedValue({
              id: 'test-id',
              name: 'document-analyzer',
              ownerId: 'user-123',
              description: 'Analyzes documents and extracts key information',
              skillContent: '---\nname: document-analyzer\n---\n\n# Document Analyzer',
              scripts: [],
              references: [],
              assets: [],
              version: 1,
              status: 'ready',
              createdAt: new Date().toISOString(),
              updatedAt: new Date().toISOString(),
            }),
          },
        },
        {
          provide: SessionService,
          useValue: {
            saveUserPrompt: jest.fn(),
          },
        },
        {
          provide: ConfigService,
          useValue: {
            get: jest.fn().mockReturnValue({
              maxHistoryTokens: 2000,
            }),
          },
        },
        {
          provide: SkillValidatorService,
          useValue: {
            validate: jest.fn().mockReturnValue({ issues: [] }),
          },
        },
        {
          provide: DiagramService,
          useValue: {},
        },
        {
          provide: RequestContext,
          useValue: { userId: 'user-123', skill: null },
        },
      ],
    }).compile();

    generationService = module.get<GenerationService>(GenerationService);
  });

  it('should generate skill end-to-end via Strands', async () => {
    const request = {
      skillName: 'document-analyzer',
      prompt: 'Create a skill for analyzing documents',
      signal: undefined,
    };

    const result = await generationService.generateSkill(request);

    expect(result).toHaveProperty('name', 'document-analyzer');
    expect(result).toHaveProperty('description');
    expect(result).toHaveProperty('skillContent');
    expect(result.explanation).toBeDefined();
  });
});
