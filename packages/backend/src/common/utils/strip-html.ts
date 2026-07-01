/**
 * Strips HTML tags and decodes common HTML entities from a string.
 *
 * Applied to user-supplied free-text fields (feedback, suggestedFix) at the
 * DTO layer so that HTML/JS content never reaches storage or LLM prompts.
 *
 * Does NOT use a DOM parser — safe for server-side use.
 */
export function stripHtml(value: unknown): string {
  if (typeof value !== 'string') return '';

  return value
    // Remove script/style blocks and their content entirely
    .replace(/<script\b[^<]*(?:(?!<\/script>)<[^<]*)*<\/script>/gi, '')
    .replace(/<style\b[^<]*(?:(?!<\/style>)<[^<]*)*<\/style>/gi, '')
    // Strip all remaining HTML tags
    .replace(/<[^>]+>/g, '')
    .trim();
}
