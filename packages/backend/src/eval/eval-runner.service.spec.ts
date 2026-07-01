import { Test, TestingModule } from '@nestjs/testing';
import { EvalRunnerService } from './eval-runner.service';
import { LlmService } from '../generation/llm/llm.service.js';
import type { EvalCase, EvalRunConfig, Skill } from '@skillspell/shared';

/** Minimal skill object for testing — wraps a content string with empty file arrays. */
const makeSkill = (
  skillContent: string,
): Pick<Skill, 'skillContent' | 'scripts' | 'references' | 'assets'> => ({
  skillContent,
  scripts: [],
  references: [],
  assets: [],
});

/**
 * Unit tests for EvalRunnerService — behavioral coverage.
 *
 * Validates the parallel Promise.all execution pattern introduced in Phase 01:
 * - with-skill and baseline runPrompt calls fire concurrently via Promise.all()
 * - compareBaseline: false resolves immediately via Promise.resolve(null) — no
 *   second API call is issued
 * - The result shape (outputWithSkill, outputWithoutSkill, baselineTiming) is
 *   correct under both paths
 */
describe('EvalRunnerService — PERF-03 parallel baseline eval', () => {
  let service: EvalRunnerService;
  let sendMessageMock: jest.Mock;

  /** Build a minimal EvalCase for testing. */
  const makeEvalCase = (overrides: Partial<EvalCase> = {}): EvalCase =>
    ({
      id: 'eval-1',
      skillId: 'skill-1',
      name: 'Test Eval',
      prompt: 'What is the capital of France?',
      assertions: [],
      expectedOutput: 'Paris',
      split: 'train',
      createdAt: new Date().toISOString(),
      ...overrides,
    }) as EvalCase;

  /** Minimal config for a with-skill-only run (no baseline). */
  const makeConfig = (
    overrides: Partial<EvalRunConfig> = {},
  ): EvalRunConfig => ({
    model: 'light',
    maxTokens: 8192,
    temperature: 0,
    compareBaseline: false,
    ...overrides,
  });

  /** Minimal sendMessage response. */
  const makeMessageResponse = (content: string) => ({
    content,
    usage: { inputTokens: 50, outputTokens: 20 },
  });

  beforeEach(async () => {
    sendMessageMock = jest.fn();

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        EvalRunnerService,
        {
          provide: LlmService,
          useValue: { sendMessage: sendMessageMock },
        },
      ],
    }).compile();

    service = module.get<EvalRunnerService>(EvalRunnerService);

    // Silence logger output
    const logger = (service as any).logger;
    jest.spyOn(logger, 'log').mockImplementation(() => {});
    jest.spyOn(logger, 'warn').mockImplementation(() => {});
    jest.spyOn(logger, 'debug').mockImplementation(() => {});
    jest.spyOn(logger, 'error').mockImplementation(() => {});
  });

  afterEach(() => {
    jest.clearAllMocks();
  });

  // ── compareBaseline: false — only one API call ───────────────────────

  describe('compareBaseline: false', () => {
    it('makes exactly one sendMessage call when compareBaseline is false', async () => {
      sendMessageMock.mockResolvedValue(makeMessageResponse('Paris'));

      const evalCase = makeEvalCase();
      const config = makeConfig({ compareBaseline: false });

      await service.executeEval(evalCase, makeSkill('# Skill content'), config);

      expect(sendMessageMock).toHaveBeenCalledTimes(1);
    });

    it('sets outputWithoutSkill to undefined when compareBaseline is false', async () => {
      sendMessageMock.mockResolvedValue(makeMessageResponse('Paris'));

      const result = await service.executeEval(
        makeEvalCase(),
        makeSkill('# Skill content'),
        makeConfig({ compareBaseline: false }),
      );

      expect(result.outputWithoutSkill).toBeUndefined();
    });

    it('sets baselineTiming to undefined when compareBaseline is false', async () => {
      sendMessageMock.mockResolvedValue(makeMessageResponse('Paris'));

      const result = await service.executeEval(
        makeEvalCase(),
        makeSkill('# Skill content'),
        makeConfig({ compareBaseline: false }),
      );

      expect(result.baselineTiming).toBeUndefined();
    });

    it('correctly captures with-skill output', async () => {
      sendMessageMock.mockResolvedValue(
        makeMessageResponse('Paris is the capital of France'),
      );

      const result = await service.executeEval(
        makeEvalCase(),
        makeSkill('# Geography Skill'),
        makeConfig({ compareBaseline: false }),
      );

      expect(result.outputWithSkill).toBe('Paris is the capital of France');
    });
  });

  // ── compareBaseline: true — two parallel API calls ───────────────────

  describe('compareBaseline: true', () => {
    it('makes exactly two sendMessage calls when compareBaseline is true', async () => {
      // Both calls return different responses so we can distinguish them
      sendMessageMock
        .mockResolvedValueOnce(makeMessageResponse('Paris (with skill)'))
        .mockResolvedValueOnce(makeMessageResponse('Paris (baseline)'));

      const evalCase = makeEvalCase();
      const config = makeConfig({ compareBaseline: true });

      await service.executeEval(evalCase, makeSkill('# Skill content'), config);

      expect(sendMessageMock).toHaveBeenCalledTimes(2);
    });

    it('populates outputWithSkill and outputWithoutSkill when compareBaseline is true', async () => {
      sendMessageMock
        .mockResolvedValueOnce(makeMessageResponse('With skill answer'))
        .mockResolvedValueOnce(makeMessageResponse('Baseline answer'));

      const result = await service.executeEval(
        makeEvalCase(),
        makeSkill('# Skill content'),
        makeConfig({ compareBaseline: true }),
      );

      expect(result.outputWithSkill).toBe('With skill answer');
      expect(result.outputWithoutSkill).toBe('Baseline answer');
    });

    it('populates baselineTiming when compareBaseline is true', async () => {
      sendMessageMock
        .mockResolvedValueOnce(makeMessageResponse('With skill answer'))
        .mockResolvedValueOnce(makeMessageResponse('Baseline answer'));

      const result = await service.executeEval(
        makeEvalCase(),
        makeSkill('# Skill content'),
        makeConfig({ compareBaseline: true }),
      );

      expect(result.baselineTiming).toBeDefined();
      expect(result.baselineTiming?.totalTokens).toBeGreaterThan(0);
    });

    it('sends the skill content as system prompt for the with-skill call', async () => {
      sendMessageMock.mockResolvedValue(makeMessageResponse('answer'));

      const skillContent = '# My Skill\nYou are a helpful assistant.';

      await service.executeEval(
        makeEvalCase(),
        makeSkill(skillContent),
        makeConfig({ compareBaseline: true }),
      );

      // buildFlatMarkdown with empty file arrays returns just skillContent unchanged
      const callsWithSystem = sendMessageMock.mock.calls.filter(
        (call) => call[0].system === skillContent,
      );
      expect(callsWithSystem).toHaveLength(1);
    });

    it('sends no system prompt for the baseline call', async () => {
      sendMessageMock.mockResolvedValue(makeMessageResponse('answer'));

      await service.executeEval(
        makeEvalCase(),
        makeSkill('# Skill content'),
        makeConfig({ compareBaseline: true }),
      );

      // One of the calls should NOT have a system prompt (bare baseline)
      const callsWithoutSystem = sendMessageMock.mock.calls.filter(
        (call) => !call[0].system,
      );
      expect(callsWithoutSystem).toHaveLength(1);
    });

    it('fires both calls concurrently — second call does not wait for the first to complete', async () => {
      const callOrder: string[] = [];
      let resolveFirst: (value: unknown) => void;
      let resolveSecond: (value: unknown) => void;

      const firstCallPromise = new Promise((resolve) => {
        resolveFirst = resolve;
      });
      const secondCallPromise = new Promise((resolve) => {
        resolveSecond = resolve;
      });

      sendMessageMock
        .mockImplementationOnce(async () => {
          callOrder.push('first-started');
          await firstCallPromise;
          callOrder.push('first-resolved');
          return makeMessageResponse('first response');
        })
        .mockImplementationOnce(async () => {
          callOrder.push('second-started');
          await secondCallPromise;
          callOrder.push('second-resolved');
          return makeMessageResponse('second response');
        });

      // Start executeEval but don't await yet — both calls should fire immediately
      const evalPromise = service.executeEval(
        makeEvalCase(),
        makeSkill('# Skill'),
        makeConfig({ compareBaseline: true }),
      );

      // Give the event loop a tick to start both calls
      await new Promise((resolve) => setImmediate(resolve));

      // Both should have started (if sequential, only the first would be started)
      expect(callOrder).toContain('first-started');
      expect(callOrder).toContain('second-started');

      // Now resolve both and await the result
      resolveFirst!(undefined);
      resolveSecond!(undefined);
      await evalPromise;

      expect(callOrder).toContain('first-resolved');
      expect(callOrder).toContain('second-resolved');
    });
  });

  // ── Return shape invariants ──────────────────────────────────────────

  describe('return shape', () => {
    it('always includes required EvalRun fields', async () => {
      sendMessageMock.mockResolvedValue(makeMessageResponse('output'));

      const result = await service.executeEval(
        makeEvalCase(),
        makeSkill('# Skill'),
        makeConfig(),
      );

      expect(result).toHaveProperty('id');
      expect(result).toHaveProperty('evalId', 'eval-1');
      expect(result).toHaveProperty('skillId', 'skill-1');
      expect(result).toHaveProperty('prompt', 'What is the capital of France?');
      expect(result).toHaveProperty('outputWithSkill');
      expect(result).toHaveProperty('status', 'completed');
      expect(result).toHaveProperty('timing');
      expect(result.timing).toHaveProperty('durationMs');
      expect(result.timing).toHaveProperty('inputTokens');
      expect(result.timing).toHaveProperty('outputTokens');
      expect(result.timing).toHaveProperty('totalTokens');
    });

    it('timing.totalTokens equals inputTokens + outputTokens', async () => {
      sendMessageMock.mockResolvedValue({
        content: 'Paris',
        usage: { inputTokens: 30, outputTokens: 10 },
      });

      const result = await service.executeEval(
        makeEvalCase(),
        makeSkill('# Skill'),
        makeConfig(),
      );

      expect(result.timing.inputTokens).toBe(30);
      expect(result.timing.outputTokens).toBe(10);
      expect(result.timing.totalTokens).toBe(40);
    });
  });

  // ── Abort signal ─────────────────────────────────────────────────────

  describe('abort signal', () => {
    it('throws "Request cancelled by client" when signal is already aborted', async () => {
      const abortController = new AbortController();
      abortController.abort();

      await expect(
        service.executeEval(
          makeEvalCase(),
          makeSkill('# Skill'),
          makeConfig(),
          abortController.signal,
        ),
      ).rejects.toThrow('Request cancelled by client');

      // sendMessage should NOT have been called
      expect(sendMessageMock).not.toHaveBeenCalled();
    });
  });

  // ── M1: context injection ────────────────────────────────────────────

  describe('context injection', () => {
    /** Typed accessor for the user-message content of the Nth sendMessage call. */
    const userContentOf = (callIndex: number): string => {
      const [opts] = sendMessageMock.mock.calls[callIndex] as [
        { messages: { content: string }[] },
      ];
      return opts.messages[0].content;
    };

    it('prepends a <context> block to the user message when context is set', async () => {
      sendMessageMock.mockResolvedValue(makeMessageResponse('answer'));

      await service.executeEval(
        makeEvalCase({
          prompt: 'Draft the postmortem.',
          context: 'Incident: DB outage at 02:00.',
        }),
        makeSkill('# Skill'),
        makeConfig({ compareBaseline: false }),
      );

      const userContent = userContentOf(0);
      expect(userContent).toContain('<context>');
      expect(userContent).toContain('Incident: DB outage at 02:00.');
      expect(userContent).toContain('Draft the postmortem.');
    });

    it('leaves the user message as the bare prompt when no context is set', async () => {
      sendMessageMock.mockResolvedValue(makeMessageResponse('answer'));

      await service.executeEval(
        makeEvalCase({ prompt: 'Just the prompt.', context: undefined }),
        makeSkill('# Skill'),
        makeConfig({ compareBaseline: false }),
      );

      expect(userContentOf(0)).toBe('Just the prompt.');
    });

    it('sends identical context-augmented content to both with-skill and baseline runs', async () => {
      sendMessageMock.mockResolvedValue(makeMessageResponse('answer'));

      await service.executeEval(
        makeEvalCase({ prompt: 'P', context: 'CTX' }),
        makeSkill('# Skill'),
        makeConfig({ compareBaseline: true }),
      );

      expect(sendMessageMock).toHaveBeenCalledTimes(2);
      const a = userContentOf(0);
      const b = userContentOf(1);
      expect(a).toBe(b);
      expect(a).toContain('CTX');
    });

    it('stores the augmented input as run.prompt so grading sees the context', async () => {
      sendMessageMock.mockResolvedValue(makeMessageResponse('answer'));

      const result = await service.executeEval(
        makeEvalCase({ prompt: 'P', context: 'CTX' }),
        makeSkill('# Skill'),
        makeConfig({ compareBaseline: false }),
      );

      expect(result.prompt).toContain('<context>');
      expect(result.prompt).toContain('CTX');
      expect(result.prompt).toContain('P');
    });
  });
});
