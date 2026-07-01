import { useState, useCallback, useRef, useEffect } from 'react';
import { useMutation, useQueryClient } from '@tanstack/react-query';
import type { SkillWithSession } from '@skillspell/shared';
import * as api from '../services/api/index.js';
import { queryKeys } from '../lib/queryKeys.js';
import { updateFrontmatterName } from '../utils/updateFrontmatterName.js';

export interface UseGenerationReturn {
  /** The saved skill returned from the last generate/refine call. */
  skill: SkillWithSession | null;
  generating: boolean;
  /** Combined error from generate or refine (whichever last failed). For UI banners. */
  error: string | null;
  /** Error from the last refine call only — use this to keep RefinementDialog open on failure. */
  refineError: string | null;
  /** Generate a new skill from a prompt. Auto-saved to DB. */
  generate: (prompt: string, skillName: string) => Promise<SkillWithSession>;
  /** Refine an existing skill. Uses session if available, else injects skill data. Auto-saved to DB. */
  refine: (refinement: string) => Promise<SkillWithSession>;
  clearSkill: () => void;
  updateSkillName: (name: string) => void;
  /** Set a pre-existing skill (e.g. when entering optimizer with an existing saved skill). */
  setSkill: (skill: SkillWithSession) => void;
  /** Cancel any in-flight refine request. */
  cancel: () => void;
}

export function useGeneration(): UseGenerationReturn {
  const queryClient = useQueryClient();
  const [skill, setSkill] = useState<SkillWithSession | null>(null);

  // AbortController for cancelling in-flight refine requests
  const abortRef = useRef<AbortController | null>(null);

  // Cleanup on unmount
  useEffect(() => {
    return () => {
      abortRef.current?.abort();
    };
  }, []);

  const generateMutation = useMutation({
    mutationFn: ({ prompt, skillName }: { prompt: string; skillName: string }) =>
      api.generateSkill(prompt, skillName),
    onSuccess: (result) => {
      setSkill(result);
      // Invalidate skills list since a new skill was created
      queryClient.invalidateQueries({ queryKey: queryKeys.skills.all });
    },
  });

  const refineMutation = useMutation({
    mutationFn: ({ skillId, refinement, signal }: { skillId: string; refinement: string; signal: AbortSignal }) =>
      api.refineSkill(skillId, refinement, signal),
    onSuccess: (result) => {
      setSkill(result);
      // Invalidate the specific skill detail cache
      if (result.id) {
        queryClient.invalidateQueries({ queryKey: queryKeys.skills.detail(result.id) });
      }
    },
  });

  const cancel = useCallback(() => {
    abortRef.current?.abort();
    abortRef.current = null;
  }, []);

  const generate = useCallback(
    async (prompt: string, skillName: string): Promise<SkillWithSession> => {
      return generateMutation.mutateAsync({ prompt, skillName });
    },
    [generateMutation],
  );

  const refine = useCallback(
    async (refinement: string): Promise<SkillWithSession> => {
      if (!skill?.id) {
        throw new Error('No saved skill to refine — generate a skill first');
      }
      // Cancel any previous in-flight request and clear stale error so the
      // refineError guard in SkillPreview doesn't block auto-close on success.
      abortRef.current?.abort();
      refineMutation.reset();
      const controller = new AbortController();
      abortRef.current = controller;

      try {
        const result = await refineMutation.mutateAsync({
          skillId: skill.id,
          refinement,
          signal: controller.signal,
        });
        return result;
      } catch (err) {
        if (err instanceof DOMException && err.name === 'AbortError') {
          throw err; // Let caller handle abort silently
        }
        throw err;
      }
    },
    [skill, refineMutation],
  );

  const clearSkill = useCallback(() => {
    abortRef.current?.abort();
    abortRef.current = null;
    setSkill(null);
    generateMutation.reset();
    refineMutation.reset();
  }, [generateMutation, refineMutation]);

  const updateSkillName = useCallback((name: string) => {
    setSkill((prev) => {
      if (!prev) return prev;
      return { ...prev, name, skillContent: updateFrontmatterName(prev.skillContent, name) };
    });
  }, []);

  const setSkillDirect = useCallback((s: SkillWithSession) => {
    setSkill(s);
    generateMutation.reset();
    refineMutation.reset();
  }, [generateMutation, refineMutation]);

  // Derive loading and error from both mutations
  const generating = generateMutation.isPending || refineMutation.isPending;

  function extractMessage(err: unknown, fallback: string): string {
    if (err instanceof Error) return err.message;
    if (err && typeof err === 'object' && 'message' in err && typeof (err as { message: unknown }).message === 'string') {
      return (err as { message: string }).message;
    }
    return fallback;
  }

  const error = generateMutation.error
    ? extractMessage(generateMutation.error, 'Generation failed')
    : refineMutation.error
      ? extractMessage(refineMutation.error, 'Refinement failed')
      : null;
  const refineError = refineMutation.error
    ? extractMessage(refineMutation.error, 'Refinement failed')
    : null;

  return { skill, generating, error, refineError, generate, refine, clearSkill, updateSkillName, setSkill: setSkillDirect, cancel };
}
