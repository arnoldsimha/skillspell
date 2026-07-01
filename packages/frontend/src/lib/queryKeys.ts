/**
 * Centralized query key factory.
 *
 * Every cache key used by React Query is defined here so that
 * invalidation is predictable and type-safe.
 */
export const queryKeys = {
  skills: {
    all: ['skills'] as const,
    detail: (id: string) => ['skills', id] as const,
    metadata: (id: string) => ['skills', id, 'metadata'] as const,
  },
  versions: {
    history: (skillId: string) => ['skills', skillId, 'versions'] as const,
    snapshot: (skillId: string, version: number) =>
      ['skills', skillId, 'versions', version] as const,
  },
  evals: {
    cases: (skillId: string) => ['skills', skillId, 'evals'] as const,
    runs: (skillId: string) => ['skills', skillId, 'evals', 'runs'] as const,
    benchmark: (skillId: string, version?: number) =>
      ['skills', skillId, 'evals', 'benchmark', version ?? 'latest'] as const,
    feedback: (skillId: string) =>
      ['skills', skillId, 'evals', 'feedback'] as const,
  },
  suggestions: {
    smart: (mode: string, partialInput?: string, skillId?: string, skillName?: string) =>
      ['suggestions', mode, partialInput ?? '', skillId ?? '', skillName ?? ''] as const,
  },
  profile: {
    me: ['profile'] as const,
  },
  users: {
    all: ['users'] as const,
  },
  tokens: {
    all: ['tokens'] as const,
  },
} as const;
