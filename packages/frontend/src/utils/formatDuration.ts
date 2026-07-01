/**
 * Format a duration in milliseconds to a human-readable string.
 * Shows seconds (e.g. "42.1s") when under 60 s, and minutes (e.g. "7m 10s") when ≥ 60 s.
 */
export function formatDuration(ms: number): string {
  const totalSeconds = ms / 1000;
  if (totalSeconds < 60) {
    return `${totalSeconds.toFixed(1)}s`;
  }
  const minutes = Math.floor(totalSeconds / 60);
  const seconds = Math.round(totalSeconds % 60);
  return seconds > 0 ? `${minutes}m ${seconds}s` : `${minutes}m`;
}
