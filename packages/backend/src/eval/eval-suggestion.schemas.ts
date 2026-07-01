import { z } from 'zod';

/**
 * Zod schema mirroring EVAL_CASE_ITEM_SCHEMA, shared by the test-suggestion tools.
 */
export const EVAL_CASE_ITEM_ZOD_SCHEMA = z.object({
  name: z.string().describe('Short descriptive test case title (3-8 words)'),
  label: z
    .string()
    .describe('Button label for the UI (2-5 words, start with a verb)')
    .optional(),
  prompt: z
    .string()
    .describe(
      'Full test prompt — a realistic, self-contained user input the skill would handle',
    ),
  expectedOutput: z
    .string()
    .describe('Key elements the ideal output should contain (specific but not rigid)')
    .optional(),
  context: z
    .string()
    .describe(
      'Additional context for the test (only include when the test requires specific setup)',
    )
    .optional(),
  maxOutputTokens: z
    .number()
    .describe(
      'Output token budget. Set to 16000 only when the prompt will produce a full code file, complete microservice, or multi-class implementation. Omit for normal-length responses.',
    )
    .optional(),
  assertions: z
    .array(
      z.object({
        type: z
          .enum(['contains', 'not_contains', 'regex', 'semantic', 'custom'])
          .describe(
            'contains/not_contains: exact text match. regex: pattern match. semantic: AI-graded meaning check. custom: AI-graded nuanced criteria.',
          ),
        value: z
          .string()
          .describe(
            'The value to check (max 200 chars). For semantic/custom use a concise criteria description.',
          ),
        description: z
          .string()
          .describe(
            'Human-readable explanation of what this assertion checks (max 500 chars)',
          )
          .optional(),
      }),
    )
    .optional(),
});

/** Zod schema for return_test_suggestions tool input. */
export const TEST_SUGGESTIONS_ZOD_SCHEMA = z.object({
  suggestions: z.array(EVAL_CASE_ITEM_ZOD_SCHEMA),
});

/** Zod schema for return_test_evals tool input. */
export const GENERATE_TEST_EVALS_ZOD_SCHEMA = z.object({
  cases: z.array(EVAL_CASE_ITEM_ZOD_SCHEMA),
});

/** Zod schema for return_gap_counts tool input. */
export const SUGGEST_GAP_COUNTS_ZOD_SCHEMA = z.object({
  counts: z.array(
    z.object({
      dimension: z.string(),
      count: z.number().int(),
      reasoning: z.string().optional(),
    }),
  ),
});

/**
 * Shared eval case item shape reused by TEST_SUGGESTIONS and GENERATE_TEST_EVALS schemas.
 * Descriptions carry field-level guidance — prompt files only contain behavioral reasoning.
 */
export const EVAL_CASE_ITEM_SCHEMA = {
  type: 'object' as const,
  properties: {
    name: {
      type: 'string',
      description: 'Short descriptive test case title (3-8 words)',
    },
    label: {
      type: 'string',
      description: 'Button label for the UI (2-5 words, start with a verb)',
    },
    prompt: {
      type: 'string',
      description: 'Full test prompt — a realistic, self-contained user input the skill would handle',
    },
    expectedOutput: {
      type: 'string',
      description: 'Key elements the ideal output should contain (specific but not rigid)',
    },
    context: {
      type: 'string',
      description: 'Additional context for the test (only include when the test requires specific setup)',
    },
    maxOutputTokens: {
      type: 'number',
      minimum: 1024,
      maximum: 16000,
      description: 'Output token budget. Set to 16000 only when the prompt will produce a full code file, complete microservice, or multi-class implementation. Omit for normal-length responses.',
    },
    assertions: {
      type: 'array',
      minItems: 1,
      maxItems: 3,
      items: {
        type: 'object',
        properties: {
          type: {
            type: 'string',
            enum: ['contains', 'not_contains', 'regex', 'semantic', 'custom'],
            description: 'contains/not_contains: exact text match. regex: pattern match. semantic: AI-graded meaning check. custom: AI-graded nuanced criteria.',
          },
          value: {
            type: 'string',
            description: 'The value to check (max 200 chars). For semantic/custom use a concise criteria description.',
          },
          description: {
            type: 'string',
            description: 'Human-readable explanation of what this assertion checks (max 500 chars)',
          },
        },
        required: ['type', 'value'],
      },
    },
  },
  required: ['name', 'prompt'],
};

/** Tool schema for inline test prompt suggestions (up to 5, wrapped in suggestions[]). */
export const TEST_SUGGESTIONS_TOOL_SCHEMA = {
  name: 'return_test_suggestions',
  description: 'Return test case suggestions as structured JSON.',
  inputSchema: {
    type: 'object' as const,
    properties: {
      suggestions: { type: 'array', items: EVAL_CASE_ITEM_SCHEMA },
    },
    required: ['suggestions'],
  },
  zodSchema: TEST_SUGGESTIONS_ZOD_SCHEMA,
};

/** Tool schema for bulk test eval generation (wrapped in cases[]). */
export const GENERATE_TEST_EVALS_TOOL_SCHEMA = {
  name: 'return_test_evals',
  description: 'Return generated test eval cases as structured JSON.',
  inputSchema: {
    type: 'object' as const,
    properties: {
      cases: { type: 'array', items: EVAL_CASE_ITEM_SCHEMA },
    },
    required: ['cases'],
  },
  zodSchema: GENERATE_TEST_EVALS_ZOD_SCHEMA,
};

/** Tool schema for gap-count recommendations per coverage dimension. */
export const SUGGEST_GAP_COUNTS_TOOL_SCHEMA = {
  name: 'return_gap_counts',
  description: 'Return recommended test case counts per coverage gap dimension.',
  inputSchema: {
    type: 'object' as const,
    properties: {
      counts: {
        type: 'array',
        items: {
          type: 'object',
          properties: {
            dimension: { type: 'string' },
            count: { type: 'integer' },
            reasoning: { type: 'string' },
          },
          required: ['dimension', 'count'],
        },
      },
    },
    required: ['counts'],
  },
  zodSchema: SUGGEST_GAP_COUNTS_ZOD_SCHEMA,
};
