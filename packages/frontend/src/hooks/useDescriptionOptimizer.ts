/**
 * State management hook for the Description Optimization wizard.
 *
 * Manages the 4-step flow:
 * 1. Generate trigger evals (automatic)
 * 2. Review & edit evals (user interaction)
 * 3. Run optimization loop (automatic)
 * 4. Review results & apply (user decision)
 */

import { useState, useCallback, useRef } from 'react';
import { useMutation, useQueryClient } from '@tanstack/react-query';
import type {
  TriggerEvalQuery,
  DescriptionOptimizationResult,
} from '@skillspell/shared';
import {
  generateTriggerEvals,
  runDescriptionOptimization,
  applyOptimizedDescription,
} from '../services/api/description-optimization.js';
import { queryKeys } from '../lib/queryKeys.js';

export type OptimizerStep = 'generate-evals' | 'review-evals' | 'running' | 'results';

export interface UseDescriptionOptimizerReturn {
  /** Current wizard step. */
  step: OptimizerStep;
  /** Whether an async operation is in progress. */
  loading: boolean;
  /** Error message if any operation failed. */
  error: string | null;
  /** Generated/edited trigger eval queries (Step 1-2). */
  queries: TriggerEvalQuery[];
  /** Optimization result after running (Step 3-4). */
  result: DescriptionOptimizationResult | null;

  /** Step 1: Generate trigger eval queries. */
  startGenerateEvals: (skillId: string, count?: number) => Promise<void>;
  /** Step 2: Update a query's shouldTrigger value. */
  toggleQueryTrigger: (index: number) => void;
  /** Step 2: Add a new query. */
  addQuery: (query: string, shouldTrigger: boolean) => void;
  /** Step 2: Remove a query by index. */
  removeQuery: (index: number) => void;
  /** Step 3: Start the optimization loop. */
  startOptimization: (skillId: string, maxIterations?: number) => Promise<void>;
  /** Cancel the running optimization loop. */
  cancelOptimization: () => void;
  /** Step 4: Apply the best description. */
  applyDescription: (skillId: string, description: string) => Promise<void>;
  /** Reset the wizard to the beginning. */
  reset: () => void;
}

export function useDescriptionOptimizer(): UseDescriptionOptimizerReturn {
  const queryClient = useQueryClient();
  const [step, setStep] = useState<OptimizerStep>('generate-evals');
  const [queries, setQueries] = useState<TriggerEvalQuery[]>([]);
  const [result, setResult] = useState<DescriptionOptimizationResult | null>(null);
  const abortControllerRef = useRef<AbortController | null>(null);

  const generateEvalsMutation = useMutation({
    mutationFn: ({ skillId, count }: { skillId: string; count: number }) =>
      generateTriggerEvals(skillId, count),
    onSuccess: (response) => {
      setQueries(response.queries);
      setStep('review-evals');
    },
  });

  const runOptimizationMutation = useMutation({
    mutationFn: ({
      skillId,
      evalQueries,
      maxIterations,
    }: {
      skillId: string;
      evalQueries: TriggerEvalQuery[];
      maxIterations: number;
    }) => {
      // Create and store AbortController for this request
      abortControllerRef.current = new AbortController();
      return runDescriptionOptimization(
        skillId,
        evalQueries,
        maxIterations,
        abortControllerRef.current.signal,
      );
    },
    onSuccess: (optimizationResult) => {
      setResult(optimizationResult);
      setStep('results');
    },
    onError: (error) => {
      // Don't go back if user aborted
      if (error instanceof Error && error.name !== 'AbortError') {
        setStep('review-evals'); // Go back to allow retry
      }
    },
  });

  const applyMutation = useMutation({
    mutationFn: ({ skillId, description }: { skillId: string; description: string }) =>
      applyOptimizedDescription(skillId, description),
    onSuccess: (_data, { skillId }) => {
      // Invalidate skill caches since description was updated
      queryClient.invalidateQueries({ queryKey: queryKeys.skills.detail(skillId) });
      queryClient.invalidateQueries({ queryKey: queryKeys.skills.all });
    },
  });

  const startGenerateEvals = useCallback(
    async (skillId: string, count: number = 20) => {
      await generateEvalsMutation.mutateAsync({ skillId, count });
    },
    [generateEvalsMutation],
  );

  const toggleQueryTrigger = useCallback((index: number) => {
    setQueries((prev) =>
      prev.map((q, i) =>
        i === index ? { ...q, shouldTrigger: !q.shouldTrigger } : q,
      ),
    );
  }, []);

  const addQuery = useCallback((query: string, shouldTrigger: boolean) => {
    setQueries((prev) => [...prev, { query, shouldTrigger }]);
  }, []);

  const removeQuery = useCallback((index: number) => {
    setQueries((prev) => prev.filter((_, i) => i !== index));
  }, []);

  const startOptimization = useCallback(
    async (skillId: string, maxIterations: number = 5) => {
      setStep('running');
      await runOptimizationMutation.mutateAsync({
        skillId,
        evalQueries: queries,
        maxIterations,
      });
    },
    [runOptimizationMutation, queries],
  );

  const applyDescription = useCallback(
    async (skillId: string, description: string) => {
      await applyMutation.mutateAsync({ skillId, description });
    },
    [applyMutation],
  );

  const cancelOptimization = useCallback(() => {
    if (abortControllerRef.current && !abortControllerRef.current.signal.aborted) {
      abortControllerRef.current.abort();
    }
  }, []);

  const reset = useCallback(() => {
    setStep('generate-evals');
    setQueries([]);
    setResult(null);
    generateEvalsMutation.reset();
    runOptimizationMutation.reset();
    applyMutation.reset();
  }, [generateEvalsMutation, runOptimizationMutation, applyMutation]);

  // Derive loading and error from all mutations
  const loading =
    generateEvalsMutation.isPending ||
    runOptimizationMutation.isPending ||
    applyMutation.isPending;

  const error =
    generateEvalsMutation.error
      ? ((generateEvalsMutation.error as Error).message || 'Failed to generate trigger evals')
      : runOptimizationMutation.error
        ? ((runOptimizationMutation.error as Error).message || 'Optimization loop failed')
        : applyMutation.error
          ? ((applyMutation.error as Error).message || 'Failed to apply description')
          : null;

  return {
    step,
    loading,
    error,
    queries,
    result,
    startGenerateEvals,
    toggleQueryTrigger,
    addQuery,
    removeQuery,
    startOptimization,
    cancelOptimization,
    applyDescription,
    reset,
  };
}
