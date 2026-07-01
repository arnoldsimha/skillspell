import { useCallback } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import type { SkillSummary } from '@skillspell/shared';
import * as api from '../services/api/index.js';
import { queryKeys } from '../lib/queryKeys.js';

export interface UseSkillsReturn {
  skills: SkillSummary[];
  loading: boolean;
  error: string | null;
  refreshSkills: () => void;
  removeSkill: (id: string) => Promise<void>;
  updateSkillInList: (id: string, data: Partial<SkillSummary>) => void;
}

export function useSkills(): UseSkillsReturn {
  const queryClient = useQueryClient();

  const { data: skills = [], isLoading, error } = useQuery({
    queryKey: queryKeys.skills.all,
    queryFn: () => api.fetchSkills(),
  });

  const deleteMutation = useMutation({
    mutationFn: (id: string) => api.deleteSkill(id),
    onSuccess: (_data, id) => {
      // Remove the deleted skill from the cache optimistically
      queryClient.setQueryData<SkillSummary[]>(queryKeys.skills.all, (old) =>
        old ? old.filter((s) => s.id !== id) : [],
      );
    },
  });

  const refreshSkills = useCallback(() => {
    queryClient.invalidateQueries({ queryKey: queryKeys.skills.all });
  }, [queryClient]);

  const removeSkill = useCallback(
    async (id: string) => {
      await deleteMutation.mutateAsync(id);
    },
    [deleteMutation],
  );

  const updateSkillInList = useCallback(
    (id: string, data: Partial<SkillSummary>) => {
      queryClient.setQueryData<SkillSummary[]>(queryKeys.skills.all, (old) =>
        old ? old.map((s) => (s.id === id ? { ...s, ...data } : s)) : [],
      );
    },
    [queryClient],
  );

  return {
    skills,
    loading: isLoading,
    error: error ? (error instanceof Error ? error.message : 'Failed to load skills') : null,
    refreshSkills,
    removeSkill,
    updateSkillInList,
  };
}
