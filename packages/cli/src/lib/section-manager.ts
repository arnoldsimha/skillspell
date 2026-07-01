/**
 * Manages HTML-comment-delimited sections in shared instruction files.
 * Used for Copilot (.github/copilot-instructions.md) and Windsurf (.windsurfrules).
 * D-12: section markers use slug (not display name) so they survive skill renames.
 *
 * Marker format:
 *   <!-- skillspell-begin: <slug> -->
 *   ...skill content...
 *   <!-- skillspell-end: <slug> -->
 */
export function upsertSection(existing: string, slug: string, content: string): string {
  const begin = `<!-- skillspell-begin: ${slug} -->`;
  const end = `<!-- skillspell-end: ${slug} -->`;
  const section = `${begin}\n${content}\n${end}`;

  const startIdx = existing.indexOf(begin);
  if (startIdx === -1) {
    // No existing section — append (with separator if file has content)
    const separator = existing.trim() === '' ? '' : '\n\n';
    return `${existing}${separator}${section}\n`;
  }

  // Replace existing section
  const endIdx = existing.indexOf(end, startIdx);
  if (endIdx === -1) {
    throw new Error(`Malformed skillspell section for "${slug}": missing end marker`);
  }
  // Preserve content after end marker; ensure exactly one newline terminates the section block
  const tail = existing.slice(endIdx + end.length);
  const normalizedTail = tail.startsWith('\n') ? tail : `\n${tail}`;
  return existing.slice(0, startIdx) + section + normalizedTail;
}

/**
 * Removes the HTML-comment-delimited section for a slug from a shared file.
 * Inverse of upsertSection() — leaves surrounding content intact.
 * D-12: used by uninstall command for Windsurf (.windsurfrules) and Copilot (.github/copilot-instructions.md).
 *
 * Returns the input string unchanged if the section is not found (idempotent).
 * Throws if begin marker exists but end marker is missing (malformed file).
 * Pitfall 4: normalizes consecutive blank lines (\n{3,} → \n\n) after removal.
 */
export function removeSection(existing: string, slug: string): string {
  const begin = `<!-- skillspell-begin: ${slug} -->`;
  const end = `<!-- skillspell-end: ${slug} -->`;

  const startIdx = existing.indexOf(begin);
  if (startIdx === -1) {
    return existing; // Section not present — idempotent
  }

  const endIdx = existing.indexOf(end, startIdx);
  if (endIdx === -1) {
    throw new Error(`Malformed skillspell section for "${slug}": missing end marker`);
  }

  const before = existing.slice(0, startIdx);
  const after = existing.slice(endIdx + end.length);
  // Pitfall 4: removing a section can leave 3+ consecutive newlines — normalize to 2
  return (before + after).replace(/\n{3,}/g, '\n\n').trimEnd() + '\n';
}
