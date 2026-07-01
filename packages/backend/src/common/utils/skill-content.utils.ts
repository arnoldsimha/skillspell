/**
 * Replace the `name` field in YAML front-matter of SKILL.md content.
 * If no front-matter or no `name:` line exists, returns content unchanged.
 *
 * The new name is emitted as a single-quoted YAML scalar so it is safe by
 * construction — independent of any caller-side validation. Without quoting, a
 * name containing YAML metacharacters (`:` , `#`, `|`, newlines, etc.) could
 * inject extra front-matter keys (e.g. `foo\nstatus: published`), break the
 * document, or override fields like `allowed-tools`. Quoting confines the value
 * to a single scalar; the colon, hash, etc. are then literal text.
 */
export function updateFrontMatterName(content: string, newName: string): string {
  // Support both LF and CRLF line endings in front-matter blocks
  const fmRegex = /^(---\r?\n)([\s\S]*?\r?\n)(---)/;
  const match = content.match(fmRegex);
  if (!match) return content;

  // Build a safe single-quoted YAML scalar:
  //  - collapse CR/LF so the scalar stays on one line (a name is single-line)
  //  - escape a literal single quote by doubling it, per the YAML 1.2 spec
  const quoted = `'${newName.replace(/[\r\n]+/g, ' ').replace(/'/g, "''")}'`;

  // Escape $ chars before using the value as a String.replace replacement.
  // Without this, sequences like $&, $`, $', $1-$9 are interpreted as replacement
  // pattern references, silently corrupting the YAML front matter.
  const safeReplacement = quoted.replace(/\$/g, '$$$$');
  const updatedFm = match[2].replace(/^name:\s*.+$/m, `name: ${safeReplacement}`);
  return `${match[1]}${updatedFm}${match[3]}${content.slice(match[0].length)}`;
}
