import { z } from 'zod';

/**
 * Zod schema mirroring the EXPLANATION_TOOL_SCHEMA inputSchema.
 */
export const EXPLANATION_ZOD_SCHEMA = z.object({
  summary: z
    .string()
    .describe(
      '2-3 sentences describing the behavioral gap between expected and actual output. ' +
        'Do NOT restate assertion text — explain what the model actually did and why it fell short. ' +
        'Example: "The output returned a flat string instead of a JSON object, suggesting the model ' +
        'ignored the format instruction entirely rather than misinterpreting it."',
    ),
  rootCause: z
    .string()
    .describe(
      'One paragraph identifying the specific flaw in the skill instructions that caused this failure. ' +
        'Be precise: quote the ambiguous or missing instruction fragment if applicable. ' +
        'Weak: "The skill does not mention error handling." ' +
        'Strong: "The skill says \'handle errors gracefully\' but never specifies try/catch, ' +
        'fallback values, or error message format, so the model omitted them."',
    ),
  suggestions: z
    .array(z.string())
    .describe(
      'Concrete instruction changes to fix the failure. Each item must be a specific rewrite, not a direction. ' +
        'Weak: "Clarify the output format." ' +
        'Strong: "Replace \'return the result\' with \'return a JSON object with keys ' +
        '`status` (\\"ok\\"|"error\\") and `data` (the result or null).\'" ' +
        'Do not suggest changes unrelated to the failed assertions.',
    ),
});

/**
 * Tool schema for structured failure explanation output via tool_use.
 */
export const EXPLANATION_TOOL_SCHEMA = {
  name: 'explain_failure',
  description: 'Explain why an eval run failed and suggest fixes',
  inputSchema: {
    type: 'object' as const,
    properties: {
      summary: {
        type: 'string',
        description:
          '2-3 sentences describing the behavioral gap between expected and actual output. ' +
          'Do NOT restate assertion text — explain what the model actually did and why it fell short. ' +
          'Example: "The output returned a flat string instead of a JSON object, suggesting the model ' +
          'ignored the format instruction entirely rather than misinterpreting it."',
      },
      rootCause: {
        type: 'string',
        description:
          'One paragraph identifying the specific flaw in the skill instructions that caused this failure. ' +
          'Be precise: quote the ambiguous or missing instruction fragment if applicable. ' +
          'Weak: "The skill does not mention error handling." ' +
          'Strong: "The skill says \'handle errors gracefully\' but never specifies try/catch, ' +
          'fallback values, or error message format, so the model omitted them."',
      },
      suggestions: {
        type: 'array',
        items: { type: 'string' },
        minItems: 1,
        maxItems: 3,
        description:
          'Concrete instruction changes to fix the failure. Each item must be a specific rewrite, not a direction. ' +
          'Weak: "Clarify the output format." ' +
          'Strong: "Replace \'return the result\' with \'return a JSON object with keys ' +
          '`status` (\\"ok\\"|"error\\") and `data` (the result or null).\'" ' +
          'Do not suggest changes unrelated to the failed assertions.',
      },
    },
    required: ['summary', 'rootCause', 'suggestions'],
  },
  zodSchema: EXPLANATION_ZOD_SCHEMA,
};
