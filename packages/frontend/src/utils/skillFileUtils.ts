/**
 * Resolve a relative href (from a markdown link or inline code) to a matching key
 * in the skill file tree. Comparison is case-insensitive so that links written as
 * `references/foo.md`, `References/foo.md`, or `REFERENCES/foo.md` all resolve
 * to the correct tree key (e.g. `References/foo.md`).
 */
export function resolveSkillFileKey(href: string, files: { key: string }[]): string | null {
  const hrefLower = href.toLowerCase();
  return files.find((f) => f.key.toLowerCase() === hrefLower)?.key ?? null;
}

/**
 * Returns an onLinkClick handler that resolves a relative href to a skill file key,
 * expands the containing folder if collapsed, and selects the file.
 */
export function makeSkillLinkHandler(
  files: { key: string }[],
  setSelectedKey: (key: string) => void,
  setCollapsedGroups: (updater: (prev: Set<string>) => Set<string>) => void,
): (href: string) => void {
  return (href: string) => {
    const key = resolveSkillFileKey(href, files);
    if (!key) return;
    const category = key.split('/')[0];
    if (category) {
      setCollapsedGroups((prev) => {
        const next = new Set(prev);
        next.delete(category);
        return next;
      });
    }
    setSelectedKey(key);
  };
}
