/**
 * Extracts a human-readable message from an unknown `catch` value.
 *
 * Prefer this over raw `${error}` (calls `.toString()`, may leak stack)
 * or repeated `error instanceof Error ? error.message : String(error)`.
 */
export function formatError(error: unknown): string {
  if (error instanceof Error) {
    return error.message;
  }
  return String(error);
}
