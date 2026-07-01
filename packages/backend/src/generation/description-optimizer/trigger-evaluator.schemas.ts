import { z } from 'zod';

/**
 * Zod schema mirroring the BATCH_TRIGGER_TOOL_SCHEMA inputSchema.
 */
export const BATCH_TRIGGER_ZOD_SCHEMA = z.object({
  decisions: z
    .array(
      z.object({
        query_id: z
          .number()
          .describe('The 1-based index of the query from the input list'),
        triggered: z
          .boolean()
          .describe(
            'true if the skill should be invoked for this query, false otherwise',
          ),
      }),
    )
    .describe('Array of trigger decisions, one per query'),
});

/**
 * Tool schema for batch trigger evaluation via tool_use.
 */
export const BATCH_TRIGGER_TOOL_SCHEMA = {
  name: 'batch_trigger_results',
  description:
    'Return trigger decisions for each query. Each decision includes the query_id (1-based index) ' +
    'and whether the skill would be triggered.',
  inputSchema: {
    type: 'object' as const,
    properties: {
      decisions: {
        type: 'array' as const,
        description: 'Array of trigger decisions, one per query',
        items: {
          type: 'object' as const,
          properties: {
            query_id: {
              type: 'number' as const,
              description: 'The 1-based index of the query from the input list',
            },
            triggered: {
              type: 'boolean' as const,
              description:
                'true if the skill should be invoked for this query, false otherwise',
            },
          },
          required: ['query_id', 'triggered'],
        },
      },
    },
    required: ['decisions'],
  },
  zodSchema: BATCH_TRIGGER_ZOD_SCHEMA,
};
