/**
 * B5: Skill section parser — extracts markdown headings from SKILL.md content.
 *
 * Uses `marked.lexer()` to correctly handle:
 * - YAML frontmatter (stripped before parsing)
 * - Code blocks containing # characters (ignored — they're tokenized as `code`, not `heading`)
 * - ATX headings at any depth (1-6)
 * - Setext-style headings (underlined with === or ---)
 *
 * Reusable by: B5 (refinement preservation), C2 (optimization loop), and any
 * feature that needs to understand skill structure.
 */
import { marked, type Tokens } from 'marked';

export interface SkillSection {
  heading: string;
  depth: number;
}

/**
 * Extract section headings from a SKILL.md content string.
 *
 * @param skillContent - Raw SKILL.md content (may include YAML frontmatter)
 * @returns Array of {heading, depth} objects in document order
 */
export function extractSections(skillContent: string): SkillSection[] {
  if (!skillContent) return [];

  // Strip YAML frontmatter before parsing (---\n...\n---\n)
  const content = skillContent.replace(/^---\n[\s\S]*?\n---\n?/, '');
  const tokens = marked.lexer(content);

  return tokens
    .filter((t): t is Tokens.Heading => t.type === 'heading')
    .map((t) => ({ heading: t.text, depth: t.depth }));
}

/**
 * Convenience: returns heading strings formatted with their markdown prefix.
 * Used for prompt injection — e.g. "## Prerequisites", "### Error Handling".
 *
 * @param skillContent - Raw SKILL.md content
 * @returns Array of formatted heading strings (e.g. ["## Prerequisites", "### Error Handling"])
 */
export function extractSectionHeadings(skillContent: string): string[] {
  return extractSections(skillContent).map(
    (s) => `${'#'.repeat(s.depth)} ${s.heading}`,
  );
}
