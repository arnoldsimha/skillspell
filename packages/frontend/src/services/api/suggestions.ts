import type { SuggestionItem } from '@skillspell/shared';
import { API_BASE, request } from './client.js';

/** Fetch smart AI-powered suggestions. */
export async function fetchSuggestions(
  mode: 'create' | 'optimize',
  partialInput?: string,
  skillId?: string,
  signal?: AbortSignal,
  skillName?: string,
): Promise<SuggestionItem[]> {
  const body: Record<string, string> = { mode };
  if (partialInput) body.partialInput = partialInput;
  if (skillId) body.skillId = skillId;
  if (skillName) body.skillName = skillName;

  const result = await request<{ suggestions: SuggestionItem[] }>(
    `${API_BASE}/generate/suggestions`,
    {
      method: 'POST',
      body: JSON.stringify(body),
      signal,
    },
  );
  return result.suggestions;
}
