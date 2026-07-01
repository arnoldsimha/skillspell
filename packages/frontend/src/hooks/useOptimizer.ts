import { useState, useCallback, useRef, useEffect } from 'react';
import { useMutation, useQueryClient } from '@tanstack/react-query';
import type { Skill, SkillSummary, OptimizeDraftResponse, SkillFileItem } from '@skillspell/shared';
import * as api from '../services/api/index.js';
import { queryKeys } from '../lib/queryKeys.js';
import { updateFrontmatterName } from '../utils/updateFrontmatterName.js';

export interface UseOptimizerReturn {
  /** The current draft result (not yet saved to DB). */
  draft: OptimizeDraftResponse | null;
  generating: boolean;
  error: string | null;
  /** Generate an optimization draft (does NOT save to DB). */
  optimizeDraft: (refinement: string) => Promise<OptimizeDraftResponse>;
  /** Refine the current draft (sends draft context to the backend). */
  refineDraft: (refinement: string) => Promise<OptimizeDraftResponse>;
  /** Approve the current draft and save as a new skill version. */
  approveDraft: () => Promise<Skill>;
  /** Update the draft name in memory. */
  updateDraftName: (name: string) => void;
  /** Clear the draft. */
  clearDraft: () => void;
  /** Cancel any in-flight optimization/refinement request. */
  cancel: () => void;
}

/** Accepts SkillSummary — only needs skill.id for API calls. */
export function useOptimizer(skill: SkillSummary): UseOptimizerReturn {
  const queryClient = useQueryClient();
  const [draft, setDraft] = useState<OptimizeDraftResponse | null>(null);

  // AbortController for cancelling in-flight requests
  const abortRef = useRef<AbortController | null>(null);

  // Cleanup on unmount
  useEffect(() => {
    return () => {
      abortRef.current?.abort();
    };
  }, []);

  const cancel = useCallback(() => {
    abortRef.current?.abort();
    abortRef.current = null;
  }, []);

  const optimizeMutation = useMutation({
    mutationFn: ({
      refinement,
      draftContext,
      signal,
    }: {
      refinement: string;
      draftContext?: {
        name: string;
        description: string;
        skillContent: string;
        scripts: SkillFileItem[];
        references: SkillFileItem[];
        assets: SkillFileItem[];
      };
      signal: AbortSignal;
    }) => api.optimizeDraft(skill.id, refinement, draftContext, signal),
    onSuccess: (result) => {
      setDraft(result);
    },
  });

  const approveMutation = useMutation({
    mutationFn: () => {
      if (!draft) throw new Error('No draft to approve');
      return api.approveOptimization(skill.id, {
        description: draft.description,
        skillContent: draft.skillContent,
        scripts: draft.scripts,
        references: draft.references,
        assets: draft.assets,
        explanation: draft.explanation,
      });
    },
    onSuccess: () => {
      // Invalidate skill caches so detail and version list refresh
      queryClient.invalidateQueries({ queryKey: queryKeys.skills.detail(skill.id) });
      queryClient.invalidateQueries({ queryKey: queryKeys.versions.history(skill.id) });
      queryClient.invalidateQueries({ queryKey: queryKeys.skills.all });
    },
  });

  const optimizeDraft = useCallback(
    async (refinement: string): Promise<OptimizeDraftResponse> => {
      abortRef.current?.abort();
      const controller = new AbortController();
      abortRef.current = controller;

      try {
        return await optimizeMutation.mutateAsync({
          refinement,
          signal: controller.signal,
        });
      } catch (err) {
        if (err instanceof DOMException && err.name === 'AbortError') {
          throw err;
        }
        throw err;
      }
    },
    [optimizeMutation],
  );

  const refineDraft = useCallback(
    async (refinement: string): Promise<OptimizeDraftResponse> => {
      abortRef.current?.abort();
      const controller = new AbortController();
      abortRef.current = controller;

      const draftContext: {
        name: string;
        description: string;
        skillContent: string;
        scripts: SkillFileItem[];
        references: SkillFileItem[];
        assets: SkillFileItem[];
      } | undefined = draft
        ? {
            name: draft.name,
            description: draft.description,
            skillContent: draft.skillContent,
            scripts: draft.scripts,
            references: draft.references,
            assets: draft.assets,
          }
        : undefined;

      try {
        return await optimizeMutation.mutateAsync({
          refinement,
          draftContext,
          signal: controller.signal,
        });
      } catch (err) {
        if (err instanceof DOMException && err.name === 'AbortError') {
          throw err;
        }
        throw err;
      }
    },
    [optimizeMutation, draft],
  );

  const approveDraftAction = useCallback(async (): Promise<Skill> => {
    return approveMutation.mutateAsync();
  }, [approveMutation]);

  const updateDraftName = useCallback((name: string) => {
    setDraft((prev) => {
      if (!prev) return prev;
      return { ...prev, name, skillContent: updateFrontmatterName(prev.skillContent, name) };
    });
  }, []);

  const clearDraft = useCallback(() => {
    abortRef.current?.abort();
    abortRef.current = null;
    setDraft(null);
    optimizeMutation.reset();
    approveMutation.reset();
  }, [optimizeMutation, approveMutation]);

  // Derive generating and error from mutations
  const generating = optimizeMutation.isPending;
  const error = optimizeMutation.error
    ? (optimizeMutation.error instanceof Error ? optimizeMutation.error.message : 'Optimization failed')
    : approveMutation.error
      ? (approveMutation.error instanceof Error ? approveMutation.error.message : 'Failed to save optimization')
      : null;

  return {
    draft,
    generating,
    error,
    optimizeDraft,
    refineDraft,
    approveDraft: approveDraftAction,
    updateDraftName,
    clearDraft,
    cancel,
  };
}
