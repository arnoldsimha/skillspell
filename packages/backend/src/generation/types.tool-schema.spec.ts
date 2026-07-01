import { z } from 'zod';
import { GRADING_TOOL_SCHEMA } from '../eval/grading.schemas';
import { EXPLANATION_TOOL_SCHEMA } from '../eval/explain-failure.schemas';
import {
  TEST_SUGGESTIONS_TOOL_SCHEMA,
  GENERATE_TEST_EVALS_TOOL_SCHEMA,
  SUGGEST_GAP_COUNTS_TOOL_SCHEMA,
} from '../eval/eval-suggestion.schemas';
import { BATCH_TRIGGER_TOOL_SCHEMA } from './description-optimizer/trigger-evaluator.schemas';
import {
  SKILL_OUTPUT_TOOL_SCHEMA,
  SUGGESTIONS_TOOL_SCHEMA,
} from './skill/skill-generation.schemas';
import type { ToolSchema } from './types';

const ALL: ToolSchema[] = [
  GRADING_TOOL_SCHEMA,
  EXPLANATION_TOOL_SCHEMA,
  BATCH_TRIGGER_TOOL_SCHEMA,
  SKILL_OUTPUT_TOOL_SCHEMA,
  SUGGESTIONS_TOOL_SCHEMA,
  TEST_SUGGESTIONS_TOOL_SCHEMA,
  GENERATE_TEST_EVALS_TOOL_SCHEMA,
  SUGGEST_GAP_COUNTS_TOOL_SCHEMA,
];

describe('tool schemas — Strands structured-output readiness', () => {
  it.each(ALL.map((s) => [s.name, s]))('%s has a usable zodSchema', (_name, schema) => {
    expect(schema.zodSchema).toBeDefined();
    expect(schema.zodSchema).toBeInstanceOf(z.ZodType);
  });
});
