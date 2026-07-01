import { z } from 'zod';

/**
 * Zod schema mirroring the GRADING_TOOL_SCHEMA inputSchema.
 */
export const GRADING_ZOD_SCHEMA = z.object({
  assertionResults: z.array(
    z.object({
      passed: z.boolean(),
      evidence: z.string(),
      confidence: z.number().optional(),
    }),
  ),
  overallScore: z.number(),
  overallAssessment: z.enum(['pass', 'fail', 'partial']),
  claims: z
    .array(
      z.object({
        claim: z.string(),
        type: z.enum(['factual', 'process', 'quality']),
        verified: z.boolean(),
        evidence: z.string(),
        confidence: z.number().optional(),
      }),
    )
    .optional(),
  evalFeedback: z
    .object({
      suggestions: z
        .array(
          z.object({
            assertion: z.string().nullable().optional(),
            reason: z.string(),
          }),
        )
        .optional(),
      overall: z.string().optional(),
    })
    .optional(),
  plainEnglishSummary: z
    .string()
    .describe(
      'A 2-3 sentence plain-English readout of the eval results for the user, for ANY result (pass, partial, or fail). ' +
        'On a pass: say what the output did well and flag anything fragile. ' +
        'On a fail/partial: name the dominant failure pattern (what kind of inputs fail and why) ' +
        'and end with the most useful next step (e.g. optimize, add edge-case assertions).',
    )
    .optional(),
});

/**
 * Tool schema for structured grading output via tool_use.
 * Forces the LLM to return valid JSON, eliminating regex/fallback parsing.
 */
export const GRADING_TOOL_SCHEMA = {
  name: 'return_grading',
  description: 'Return grading results as structured JSON.',
  inputSchema: {
    type: 'object' as const,
    properties: {
      assertionResults: {
        type: 'array',
        items: {
          type: 'object',
          properties: {
            passed: { type: 'boolean' },
            evidence: { type: 'string' },
            confidence: { type: 'number' },
          },
          required: ['passed', 'evidence'],
        },
      },
      overallScore: { type: 'number' },
      overallAssessment: { type: 'string', enum: ['pass', 'fail', 'partial'] },
      claims: {
        type: 'array',
        items: {
          type: 'object',
          properties: {
            claim: { type: 'string' },
            type: { type: 'string', enum: ['factual', 'process', 'quality'] },
            verified: { type: 'boolean' },
            evidence: { type: 'string' },
            confidence: { type: 'number' },
          },
          required: ['claim', 'type', 'verified', 'evidence'],
        },
      },
      evalFeedback: {
        type: 'object',
        properties: {
          suggestions: {
            type: 'array',
            items: {
              type: 'object',
              properties: {
                assertion: { type: ['string', 'null'] },
                reason: { type: 'string' },
              },
              required: ['reason'],
            },
          },
          overall: { type: 'string' },
        },
      },
      plainEnglishSummary: {
        type: 'string',
        description:
          'A 2-3 sentence plain-English readout of the eval results for the user, for ANY result (pass, partial, or fail). ' +
          'On a pass: say what the output did well and flag anything fragile. ' +
          'On a fail/partial: name the dominant failure pattern (what kind of inputs fail and why) ' +
          'and end with the most useful next step (e.g. optimize, add edge-case assertions).',
      },
    },
    required: ['assertionResults', 'overallScore', 'overallAssessment'],
  },
  zodSchema: GRADING_ZOD_SCHEMA,
};
