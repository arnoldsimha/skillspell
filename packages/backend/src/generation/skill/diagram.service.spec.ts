import { Test, TestingModule } from '@nestjs/testing';
import { DiagramService } from './diagram.service';
import { LlmService } from '../llm/llm.service.js';
import { PromptLoaderService } from '../prompts/prompt-loader.service';

const VALID_MERMAID = 'flowchart LR\n  A[Start] --> B[End]';
const VALID_RESPONSE = `A brief summary of the skill.\n\n\`\`\`mermaid\n${VALID_MERMAID}\n\`\`\``;

// For retry test — use actually invalid mermaid (unmatched closing bracket):
const UNMATCHED_MERMAID = 'flowchart LR\n  A[Start]]\n';
const UNMATCHED_RESPONSE = `Summary\n\n\`\`\`mermaid\n${UNMATCHED_MERMAID}\n\`\`\``;

describe('DiagramService', () => {
  let service: DiagramService;
  let runLightQueryMock: jest.Mock;
  let renderMock: jest.Mock;

  beforeEach(async () => {
    runLightQueryMock = jest.fn().mockResolvedValue({ content: VALID_RESPONSE });
    renderMock = jest.fn().mockResolvedValue('system instruction');

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        DiagramService,
        { provide: LlmService, useValue: { runLightQuery: runLightQueryMock } },
        { provide: PromptLoaderService, useValue: { render: renderMock } },
      ],
    }).compile();

    service = module.get(DiagramService);
  });

  describe('generateDiagram()', () => {
    const SKILL_CTX = { name: 'Test Skill', description: 'A test', skillContent: '# Test' };

    it('success path: returns mermaid + summary on first attempt without retry', async () => {
      const result = await service.generateDiagram(SKILL_CTX);
      expect(result.mermaid).toBe(VALID_MERMAID);
      expect(result.summary).toBe('A brief summary of the skill.');
      expect(runLightQueryMock).toHaveBeenCalledTimes(1);
    });

    it('retries on invalid mermaid syntax: second prompt includes IMPORTANT warning text', async () => {
      runLightQueryMock
        .mockResolvedValueOnce({ content: UNMATCHED_RESPONSE })
        .mockResolvedValueOnce({ content: VALID_RESPONSE });
      const result = await service.generateDiagram(SKILL_CTX);
      expect(runLightQueryMock).toHaveBeenCalledTimes(2);
      const secondCallPrompt = runLightQueryMock.mock.calls[1][1] as string;
      expect(secondCallPrompt).toContain('IMPORTANT: The previous attempt produced invalid Mermaid syntax');
      expect(result.mermaid).toBe(VALID_MERMAID);
    });

    it('returns result even when all retries exhausted (no throw)', async () => {
      runLightQueryMock.mockResolvedValue({ content: UNMATCHED_RESPONSE });
      const result = await service.generateDiagram(SKILL_CTX);
      expect(result).toHaveProperty('mermaid');
      expect(runLightQueryMock).toHaveBeenCalledTimes(2);
    });
  });

  describe('extractDiagramFromResponse() — private method', () => {
    const extract = (svc: DiagramService, resp: string) =>
      (svc as any).extractDiagramFromResponse(resp);

    it('extracts mermaid block and pre-block text as summary', () => {
      const result = extract(service, VALID_RESPONSE);
      expect(result.mermaid).toBe(VALID_MERMAID);
      expect(result.summary).toBe('A brief summary of the skill.');
    });

    it('throws when no mermaid code block present', () => {
      expect(() => extract(service, 'No mermaid fence here')).toThrow(
        'Failed to generate diagram: no Mermaid code block in response',
      );
    });

    it('uses default summary when nothing precedes the mermaid block', () => {
      const result = extract(service, `\`\`\`mermaid\n${VALID_MERMAID}\n\`\`\``);
      expect(result.summary).toBe('Skill workflow diagram');
      expect(result.mermaid).toBe(VALID_MERMAID);
    });
  });

  describe('validateMermaidSyntax() — private method', () => {
    const validate = (svc: DiagramService, mermaid: string) =>
      (svc as any).validateMermaidSyntax(mermaid);

    it('returns null for balanced brackets', () => {
      expect(validate(service, 'flowchart LR\n  A[Start] --> B[End]')).toBeNull();
    });

    it('returns error string for unmatched closing bracket', () => {
      const result = validate(service, 'flowchart LR\n  A[Start]]\n');
      expect(result).not.toBeNull();
      expect(result).toContain("unmatched ']'");
    });

    it('returns error string for unclosed opening paren', () => {
      const result = validate(service, 'flowchart LR\n  A(Start\n');
      expect(result).not.toBeNull();
      expect(result).toContain("unclosed '('");
    });

    it('ignores brackets inside quoted strings', () => {
      expect(validate(service, 'flowchart LR\n  A["has [brackets] inside"] --> B')).toBeNull();
    });
  });
});
