import type { Skill } from '@skillspell/shared';

/**
 * Strips YAML frontmatter (--- ... ---) from markdown content.
 */
function stripFrontmatter(md: string): string {
  // Support both LF and CRLF line endings in front-matter blocks
  const match = md.match(/^---\s*\r?\n[\s\S]*?\r?\n---\s*(?:\r?\n)?/);
  return match ? md.slice(match[0].length).trimStart() : md;
}

/**
 * Builds a single merged markdown document from the skill's content and supporting files.
 *
 * Used by the export pipeline (IDE format packaging) and the eval runner
 * (assembling the full system prompt for Claude). Single source of truth
 * for skill assembly format — do NOT duplicate this function.
 *
 * @param skill - Skill or Pick<Skill, 'skillContent' | 'scripts' | 'references' | 'assets'>
 * @param includeHeader - true = preserve YAML frontmatter (correct for Claude/eval use);
 *                        false = strip frontmatter (correct for IDE-specific export formats)
 */
export function buildFlatMarkdown(
  skill: Pick<Skill, 'skillContent' | 'scripts' | 'references' | 'assets'>,
  includeHeader: boolean,
): string {
  const sections: string[] = [];

  // Main skill content (strip frontmatter for non-Claude formats)
  const body = includeHeader
    ? skill.skillContent
    : stripFrontmatter(skill.skillContent);
  sections.push(body);

  // Inline references
  if (skill.references.length > 0) {
    sections.push('\n---\n');
    sections.push('## References\n');
    for (const ref of skill.references) {
      sections.push(`### ${ref.name}\n`);
      sections.push(ref.content);
      sections.push('');
    }
  }

  // Inline scripts
  if (skill.scripts.length > 0) {
    sections.push('\n---\n');
    sections.push('## Scripts\n');
    for (const script of skill.scripts) {
      const ext = script.name.split('.').pop() ?? '';
      sections.push(`### ${script.name}\n`);
      sections.push(`\`\`\`${ext}`);
      sections.push(script.content);
      sections.push('```\n');
    }
  }

  // Inline assets
  if (skill.assets.length > 0) {
    sections.push('\n---\n');
    sections.push('## Assets\n');
    for (const asset of skill.assets) {
      const ext = asset.name.split('.').pop() ?? '';
      sections.push(`### ${asset.name}\n`);
      sections.push(`\`\`\`${ext}`);
      sections.push(asset.content);
      sections.push('```\n');
    }
  }

  return sections.join('\n');
}
