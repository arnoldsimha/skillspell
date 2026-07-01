/**
 * Strip undefined values from a DTO, returning only defined fields.
 * Uses native Object.fromEntries (Node 12+).
 * Replaces manual `if (data.x !== undefined) entity.x = data.x` boilerplate.
 */
export function stripUndefined<T>(data: Record<string, unknown>): Partial<T> {
  return Object.fromEntries(
    Object.entries(data).filter(([, v]) => v !== undefined),
  ) as Partial<T>;
}
