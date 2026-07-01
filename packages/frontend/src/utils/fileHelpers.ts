/**
 * Check if a filename is a Markdown file.
 */
export function isMarkdownFile(name: string): boolean {
  return name.toLowerCase().endsWith('.md');
}

/**
 * Check if a filename is a YAML file.
 */
export function isYamlFile(name: string): boolean {
  const lower = name.toLowerCase();
  return lower.endsWith('.yaml') || lower.endsWith('.yml');
}
