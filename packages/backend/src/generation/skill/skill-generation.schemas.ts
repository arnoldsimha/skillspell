import { z } from 'zod';

const NAMED_CONTENT_FILE_ZOD = z.object({
  name: z.string(),
  content: z.string(),
});

/**
 * Zod schema mirroring the SKILL_OUTPUT_TOOL_SCHEMA inputSchema.
 */
export const SKILL_OUTPUT_ZOD_SCHEMA = z.object({
  name: z
    .string()
    .describe('Skill name in kebab-case (1-64 chars, lowercase letters/numbers/hyphens)'),
  description: z.string().describe('Trigger-optimized description (max 2048 chars)'),
  skillContent: z.string().describe('Full SKILL.md content including YAML frontmatter'),
  scripts: z
    .array(NAMED_CONTENT_FILE_ZOD)
    .describe('Executable scripts (empty array if none)'),
  references: z
    .array(NAMED_CONTENT_FILE_ZOD)
    .describe('Supplementary reference documents (empty array if none)'),
  assets: z
    .array(NAMED_CONTENT_FILE_ZOD)
    .describe('Template/static files (empty array if none)'),
  explanation: z.string().describe('Bullet-point explanation of what was done and why'),
});

/**
 * Zod schema mirroring the SUGGESTIONS_TOOL_SCHEMA inputSchema.
 */
export const SUGGESTIONS_ZOD_SCHEMA = z.object({
  suggestions: z
    .array(
      z.object({
        label: z.string().describe('Short button label (2-5 words)'),
        prompt: z.string().describe('Full prompt text the user can use directly'),
      }),
    )
    .describe('Array of actionable prompt suggestions'),
});

/**
 * Tool schema for structured skill output via tool_use.
 * Forces the model to return valid JSON conforming to the skill output contract.
 */
export const SKILL_OUTPUT_TOOL_SCHEMA = {
  name: 'return_skill',
  description: 'Return the generated or refined skill as a structured JSON object.',
  inputSchema: {
    type: 'object' as const,
    properties: {
      name: {
        type: 'string',
        description: 'Skill name in kebab-case (1-64 chars, lowercase letters/numbers/hyphens)',
      },
      description: {
        type: 'string',
        description: 'Trigger-optimized description (max 2048 chars)',
      },
      skillContent: {
        type: 'string',
        description: 'Full SKILL.md content including YAML frontmatter',
      },
      scripts: {
        type: 'array',
        items: {
          type: 'object',
          properties: {
            name: { type: 'string' },
            content: { type: 'string' },
          },
          required: ['name', 'content'],
        },
        description: 'Executable scripts (empty array if none)',
      },
      references: {
        type: 'array',
        items: {
          type: 'object',
          properties: {
            name: { type: 'string' },
            content: { type: 'string' },
          },
          required: ['name', 'content'],
        },
        description: 'Supplementary reference documents (empty array if none)',
      },
      assets: {
        type: 'array',
        items: {
          type: 'object',
          properties: {
            name: { type: 'string' },
            content: { type: 'string' },
          },
          required: ['name', 'content'],
        },
        description: 'Template/static files (empty array if none)',
      },
      explanation: {
        type: 'string',
        description: 'Bullet-point explanation of what was done and why',
      },
    },
    required: ['name', 'description', 'skillContent', 'scripts', 'references', 'assets', 'explanation'],
  },
  zodSchema: SKILL_OUTPUT_ZOD_SCHEMA,
};

/**
 * Tool schema for structured prompt suggestion output via tool_use.
 */
export const SUGGESTIONS_TOOL_SCHEMA = {
  name: 'return_suggestions',
  description: 'Return prompt suggestions as a structured JSON object.',
  inputSchema: {
    type: 'object' as const,
    properties: {
      suggestions: {
        type: 'array',
        items: {
          type: 'object',
          properties: {
            label: {
              type: 'string',
              description: 'Short button label (2-5 words)',
            },
            prompt: {
              type: 'string',
              description: 'Full prompt text the user can use directly',
            },
          },
          required: ['label', 'prompt'],
        },
        description: 'Array of actionable prompt suggestions',
      },
    },
    required: ['suggestions'],
  },
  zodSchema: SUGGESTIONS_ZOD_SCHEMA,
};
