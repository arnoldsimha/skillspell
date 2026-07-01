import { useState, useCallback } from 'react';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import type { SuggestionItem } from '@skillspell/shared';
import * as api from '../services/api/index.js';
import { queryKeys } from '../lib/queryKeys.js';
import { useDebounce } from './useDebounce.js';

export interface UseSuggestionsReturn {
  /** Current list of AI-generated suggestions. */
  suggestions: SuggestionItem[];
  /** Whether suggestions are being fetched. */
  loading: boolean;
  /** Any error from the last fetch. */
  error: string | null;
  /** Fetch AI suggestions for the given mode and context. */
  fetchSuggestions: (
    mode: 'create' | 'optimize',
    partialInput?: string,
    skillId?: string,
    skillName?: string,
  ) => Promise<void>;
  /** Refresh suggestions (re-fetch with the same params). */
  refresh: () => Promise<void>;
  /** Clear current suggestions. */
  clear: () => void;
}

/**
 * Hook for fetching AI-powered smart suggestions.
 *
 * All suggestions come from the AI backend — no predefined defaults.
 * Uses React Query with debounced query keys for automatic deduplication.
 */
export function useSuggestions(debounceMs = 800): UseSuggestionsReturn {
  const queryClient = useQueryClient();

  // Track current fetch parameters
  const [mode, setMode] = useState<'create' | 'optimize' | null>(null);
  const [partialInput, setPartialInput] = useState<string | undefined>(undefined);
  const [skillId, setSkillId] = useState<string | undefined>(undefined);
  const [skillName, setSkillName] = useState<string | undefined>(undefined);

  // Debounce partial input to avoid excessive API calls
  const debouncedInput = useDebounce(partialInput, debounceMs);
  const debouncedSkillName = useDebounce(skillName, debounceMs);

  const queryKey = queryKeys.suggestions.smart(mode ?? '', debouncedInput, skillId, debouncedSkillName);

  const { data, isFetching, error: queryError } = useQuery({
    queryKey,
    queryFn: ({ signal }) =>
      api.fetchSuggestions(mode!, debouncedInput, skillId, signal, debouncedSkillName),
    enabled: !!mode,
    staleTime: 60_000, // Suggestions stay fresh for 1 min
  });

  const fetchSuggestions = useCallback(
    async (
      newMode: 'create' | 'optimize',
      newPartialInput?: string,
      newSkillId?: string,
      newSkillName?: string,
    ) => {
      setMode(newMode);
      setPartialInput(newPartialInput);
      setSkillId(newSkillId);
      setSkillName(newSkillName);
      // React Query will auto-fetch when the debounced key changes
    },
    [],
  );

  const refresh = useCallback(async () => {
    if (mode) {
      await queryClient.invalidateQueries({ queryKey });
    }
  }, [queryClient, queryKey, mode]);

  const clear = useCallback(() => {
    setMode(null);
    setPartialInput(undefined);
    setSkillId(undefined);
  }, []);

  return {
    suggestions: data ?? [],
    loading: isFetching,
    error: queryError
      ? (queryError instanceof Error ? queryError.message : 'Failed to fetch suggestions')
      : null,
    fetchSuggestions,
    refresh,
    clear,
  };
}
