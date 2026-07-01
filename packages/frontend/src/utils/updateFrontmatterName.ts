/**
 * Update the `name` field in a YAML front-matter block within markdown content.
 *
 * Matches the `---\n...\n---` front-matter pattern at the start of the content
 * and replaces the `name: <value>` line with the new name. If no front-matter
 * is found, the content is returned unchanged.
 *
 * @param content - The markdown content (e.g. SKILL.md)
 * @param name - The new name value to set
 * @returns The updated content with the name replaced in front-matter
 */
export function updateFrontmatterName(content: string, name: string): string {
  const fmRegex = /^(---\n)([\s\S]*?\n)(---)/;
  const match = content.match(fmRegex);
  if (!match) return content;

  const updatedFm = match[2].replace(/^name:\s*.+$/m, `name: ${name}`);
  return `${match[1]}${updatedFm}${match[3]}${content.slice(match[0].length)}`;
}
