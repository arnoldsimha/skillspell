/**
 * Format an explanation string into readable bullet points.
 *
 * If the text already contains newlines or bullet characters it is returned
 * as-is (with minor normalisation). Otherwise a long single-line explanation
 * is split on sentence boundaries and each sentence becomes a bullet point.
 */
export function formatExplanation(raw: string): string {
  if (!raw) return raw;

  const trimmed = raw.trim();

  // Already multi-line → normalise bullet prefixes and return
  if (trimmed.includes('\n')) {
    return trimmed
      .split('\n')
      .map((line) => {
        const stripped = line.replace(/^[\s\-*•]+/, '').trim();
        return stripped ? `• ${stripped}` : '';
      })
      .filter(Boolean)
      .join('\n');
  }

  // Already has bullet characters on a single line (shouldn't happen, but just in case)
  if (/^•/.test(trimmed)) return trimmed;

  // Single-line: split on sentence boundaries.
  // We split on ". " followed by an uppercase letter (new sentence) to avoid
  // splitting on abbreviations like "e.g." or decimal numbers like "4.5".
  const sentences = trimmed
    .split(/\.\s+(?=[A-Z])/)
    .map((s) => s.replace(/\.$/, '').trim())
    .filter(Boolean);

  // If only one sentence, return as-is (no need for a bullet)
  if (sentences.length <= 1) return trimmed;

  return sentences.map((s) => `• ${s}`).join('\n');
}
