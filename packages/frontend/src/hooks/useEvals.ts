import { useState, useCallback, useMemo, useRef, useEffect } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import type {
  EvalCase,
  EvalRun,
  EvalBenchmark,
  EvalFeedback,
  CreateEvalCaseRequest,
  UpdateEvalCaseRequest,
  RunEvalsRequest,
  SaveFeedbackRequest,
  TestPromptSuggestion,
} from '@skillspell/shared';
import * as api from '../services/api/index.js';
import { queryKeys } from '../lib/queryKeys.js';

export interface UseEvalsReturn {
  // State
  evalCases: EvalCase[];
  evalRuns: EvalRun[];
  benchmark: EvalBenchmark | null;
  /** Map of runId → EvalFeedback for quick lookup of existing feedback. */
  feedbackMap: Record<string, EvalFeedback>;
  loading: boolean;
  running: boolean;
  deleting: boolean;
  generating: boolean;
  error: string | null;

  // Actions
  loadEvalCases: (skillId: string) => Promise<void>;
  loadEvalRuns: (skillId: string) => Promise<void>;
  loadBenchmark: (skillId: string, version?: number) => Promise<void>;
  loadFeedback: (skillId: string) => Promise<void>;
  createCase: (skillId: string, data: CreateEvalCaseRequest) => Promise<EvalCase>;
  updateCase: (skillId: string, evalId: string, data: UpdateEvalCaseRequest) => Promise<EvalCase>;
  deleteCase: (skillId: string, evalId: string) => Promise<void>;
  executeEvals: (skillId: string, data: RunEvalsRequest) => Promise<EvalRun[]>;
  deleteRun: (skillId: string, runId: string) => Promise<void>;
  submitFeedback: (skillId: string, data: SaveFeedbackRequest) => Promise<EvalFeedback>;
  generateTestEvals: (skillId: string, count: number, coverageHint?: string) => Promise<TestPromptSuggestion[]>;
  cancelGenerate: () => void;
  bulkCreateCases: (skillId: string, cases: CreateEvalCaseRequest[]) => Promise<EvalCase[]>;
  clearError: () => void;
}

/**
 * Hook for managing eval cases, runs, benchmarks, and feedback.
 *
 * Uses React Query for caching and deduplication while maintaining the
 * same imperative interface for backwards compatibility with existing consumers.
 *
 * Internally tracks a `currentSkillId` so that queries are enabled once
 * any of the load functions is first called.
 */
export function useEvals(): UseEvalsReturn {
  const queryClient = useQueryClient();

  // Track which skillId has been loaded (enables queries)
  const [currentSkillId, setCurrentSkillId] = useState<string | null>(null);
  const [benchmarkVersion, setBenchmarkVersion] = useState<number | undefined>(undefined);
  const [mutationError, setMutationError] = useState<string | null>(null);

  // ── Queries ──────────────────────────────────────────────────────

  const casesQuery = useQuery({
    queryKey: queryKeys.evals.cases(currentSkillId ?? ''),
    queryFn: () => api.fetchEvalCases(currentSkillId!),
    enabled: !!currentSkillId,
  });

  const runsQuery = useQuery({
    queryKey: queryKeys.evals.runs(currentSkillId ?? ''),
    queryFn: () => api.fetchEvalRuns(currentSkillId!),
    enabled: !!currentSkillId,
  });

  const benchmarkQuery = useQuery({
    queryKey: queryKeys.evals.benchmark(currentSkillId ?? '', benchmarkVersion),
    queryFn: () => api.fetchBenchmark(currentSkillId!, benchmarkVersion),
    enabled: !!currentSkillId,
  });

  const feedbackQuery = useQuery({
    queryKey: queryKeys.evals.feedback(currentSkillId ?? ''),
    queryFn: () => api.fetchFeedback(currentSkillId!),
    enabled: !!currentSkillId,
  });

  // Build feedback map from array — memoized so the reference is stable
  // across renders and doesn't trigger downstream effects unnecessarily.
  const feedbackMap = useMemo(() => {
    const map: Record<string, EvalFeedback> = {};
    if (feedbackQuery.data) {
      for (const fb of feedbackQuery.data) {
        map[fb.runId] = fb;
      }
    }
    return map;
  }, [feedbackQuery.data]);

  // ── Mutations ────────────────────────────────────────────────────

  const createCaseMutation = useMutation({
    mutationFn: ({ skillId, data }: { skillId: string; data: CreateEvalCaseRequest }) =>
      api.createEvalCase(skillId, data),
    onSuccess: (newCase, { skillId }) => {
      // Optimistic update: append the new case
      queryClient.setQueryData<EvalCase[]>(
        queryKeys.evals.cases(skillId),
        (old) => old ? [...old, newCase] : [newCase],
      );
    },
  });

  const updateCaseMutation = useMutation({
    mutationFn: ({ skillId, evalId, data }: { skillId: string; evalId: string; data: UpdateEvalCaseRequest }) =>
      api.updateEvalCase(skillId, evalId, data),
    onSuccess: (updated, { skillId, evalId }) => {
      queryClient.setQueryData<EvalCase[]>(
        queryKeys.evals.cases(skillId),
        (old) => old ? old.map((c) => (c.id === evalId ? updated : c)) : [],
      );
    },
  });

  const deleteCaseMutation = useMutation({
    mutationFn: ({ skillId, evalId }: { skillId: string; evalId: string }) =>
      api.deleteEvalCase(skillId, evalId),
    onSuccess: (_data, { skillId, evalId }) => {
      queryClient.setQueryData<EvalCase[]>(
        queryKeys.evals.cases(skillId),
        (old) => old ? old.filter((c) => c.id !== evalId) : [],
      );
      // Refresh benchmark
      queryClient.invalidateQueries({ queryKey: queryKeys.evals.benchmark(skillId, benchmarkVersion) });
    },
  });

  const executeEvalsMutation = useMutation({
    mutationFn: ({ skillId, data }: { skillId: string; data: RunEvalsRequest }) =>
      api.runEvals(skillId, data),
    onSuccess: (newRuns, { skillId }) => {
      // Prepend new runs to the cache
      queryClient.setQueryData<EvalRun[]>(
        queryKeys.evals.runs(skillId),
        (old) => old ? [...newRuns, ...old] : newRuns,
      );
    },
  });

  const deleteRunMutation = useMutation({
    mutationFn: ({ skillId, runId }: { skillId: string; runId: string }) =>
      api.deleteEvalRun(skillId, runId),
    onSuccess: (_data, { skillId, runId }) => {
      queryClient.setQueryData<EvalRun[]>(
        queryKeys.evals.runs(skillId),
        (old) => old ? old.filter((r) => r.id !== runId) : [],
      );
      // Remove feedback for this run from cache
      queryClient.setQueryData<EvalFeedback[]>(
        queryKeys.evals.feedback(skillId),
        (old) => old ? old.filter((fb) => fb.runId !== runId) : [],
      );
      // Refresh benchmark
      queryClient.invalidateQueries({ queryKey: queryKeys.evals.benchmark(skillId, benchmarkVersion) });
    },
  });

  const submitFeedbackMutation = useMutation({
    mutationFn: ({ skillId, data }: { skillId: string; data: SaveFeedbackRequest }) =>
      api.saveFeedback(skillId, data),
    onSuccess: (feedback, { skillId }) => {
      // Update feedback cache optimistically
      queryClient.setQueryData<EvalFeedback[]>(
        queryKeys.evals.feedback(skillId),
        (old) => {
          if (!old) return [feedback];
          // Replace existing feedback for this run or append
          const exists = old.findIndex((fb) => fb.runId === feedback.runId);
          if (exists >= 0) {
            return old.map((fb, i) => (i === exists ? feedback : fb));
          }
          return [...old, feedback];
        },
      );
    },
  });

  const generateAbortRef = useRef<AbortController | null>(null);
  const generateMutation = useMutation({
    mutationFn: ({ skillId, count, signal, coverageHint }: { skillId: string; count: number; signal?: AbortSignal; coverageHint?: string }) =>
      api.generateTestEvals(skillId, count, undefined, signal, coverageHint),
  });

  const bulkCreateMutation = useMutation({
    mutationFn: ({ skillId, cases }: { skillId: string; cases: CreateEvalCaseRequest[] }) =>
      api.bulkCreateEvalCases(skillId, cases),
    onSuccess: (created, { skillId }) => {
      queryClient.setQueryData<EvalCase[]>(
        queryKeys.evals.cases(skillId),
        (old) => old ? [...old, ...created] : created,
      );
    },
  });

  // ── Imperative load functions (for backward compatibility) ──────

  const loadEvalCases = useCallback(async (skillId: string) => {
    setCurrentSkillId(skillId);
    setMutationError(null);
    // If data is already fresh, React Query won't refetch.
    // If the skillId changed, the query key changes and auto-refetches.
    await queryClient.invalidateQueries({ queryKey: queryKeys.evals.cases(skillId) });
  }, [queryClient]);

  const loadEvalRuns = useCallback(async (skillId: string) => {
    setCurrentSkillId(skillId);
    setMutationError(null);
    await queryClient.invalidateQueries({ queryKey: queryKeys.evals.runs(skillId) });
  }, [queryClient]);

  const loadBenchmark = useCallback(async (skillId: string, version?: number) => {
    setCurrentSkillId(skillId);
    setBenchmarkVersion(version);
    setMutationError(null);
    await queryClient.invalidateQueries({ queryKey: queryKeys.evals.benchmark(skillId, version) });
  }, [queryClient]);

  const loadFeedback = useCallback(async (skillId: string) => {
    setCurrentSkillId(skillId);
    await queryClient.invalidateQueries({ queryKey: queryKeys.evals.feedback(skillId) });
  }, [queryClient]);

  // ── Mutation wrappers ──────────────────────────────────────────

  const createCase = useCallback(async (skillId: string, data: CreateEvalCaseRequest) => {
    setMutationError(null);
    try {
      return await createCaseMutation.mutateAsync({ skillId, data });
    } catch (err) {
      const message = err instanceof Error ? err.message : 'Failed to create eval case';
      setMutationError(message);
      throw err;
    }
  }, [createCaseMutation]);

  const updateCase = useCallback(async (skillId: string, evalId: string, data: UpdateEvalCaseRequest) => {
    setMutationError(null);
    try {
      return await updateCaseMutation.mutateAsync({ skillId, evalId, data });
    } catch (err) {
      const message = err instanceof Error ? err.message : 'Failed to update eval case';
      setMutationError(message);
      throw err;
    }
  }, [updateCaseMutation]);

  const deleteCase = useCallback(async (skillId: string, evalId: string) => {
    setMutationError(null);
    try {
      await deleteCaseMutation.mutateAsync({ skillId, evalId });
    } catch (err) {
      const message = err instanceof Error ? err.message : 'Failed to delete eval case';
      setMutationError(message);
      throw err;
    }
  }, [deleteCaseMutation]);

  const executeEvals = useCallback(async (skillId: string, data: RunEvalsRequest) => {
    setMutationError(null);
    try {
      return await executeEvalsMutation.mutateAsync({ skillId, data });
    } catch (err) {
      const message = err instanceof Error ? err.message : 'Failed to execute evals';
      setMutationError(message);
      throw err;
    }
  }, [executeEvalsMutation]);

  const deleteRun = useCallback(async (skillId: string, runId: string) => {
    setMutationError(null);
    try {
      await deleteRunMutation.mutateAsync({ skillId, runId });
    } catch (err) {
      const message = err instanceof Error ? err.message : 'Failed to delete eval run';
      setMutationError(message);
      throw err;
    }
  }, [deleteRunMutation]);

  const submitFeedback = useCallback(async (skillId: string, data: SaveFeedbackRequest) => {
    setMutationError(null);
    try {
      return await submitFeedbackMutation.mutateAsync({ skillId, data });
    } catch (err) {
      const message = err instanceof Error ? err.message : 'Failed to save feedback';
      setMutationError(message);
      throw err;
    }
  }, [submitFeedbackMutation]);

  const generateTestEvalsAction = useCallback(async (skillId: string, count: number, coverageHint?: string) => {
    // Cancel any previous in-flight generate request
    generateAbortRef.current?.abort();
    const controller = new AbortController();
    generateAbortRef.current = controller;

    setMutationError(null);
    try {
      return await generateMutation.mutateAsync({ skillId, count, signal: controller.signal, coverageHint });
    } catch (err) {
      if (controller.signal.aborted) return [] as TestPromptSuggestion[];
      const message = err instanceof Error ? err.message : 'Failed to generate test cases';
      setMutationError(message);
      throw err;
    }
  }, [generateMutation]);

  // Cancel in-flight generate request (called on dialog close / unmount)
  const cancelGenerate = useCallback(() => {
    generateAbortRef.current?.abort();
    generateAbortRef.current = null;
  }, []);

  // Abort generate on unmount
  useEffect(() => {
    return () => {
      generateAbortRef.current?.abort();
    };
  }, []);

  const bulkCreateCasesAction = useCallback(async (skillId: string, cases: CreateEvalCaseRequest[]) => {
    setMutationError(null);
    try {
      return await bulkCreateMutation.mutateAsync({ skillId, cases });
    } catch (err) {
      const message = err instanceof Error ? err.message : 'Failed to bulk-create eval cases';
      setMutationError(message);
      throw err;
    }
  }, [bulkCreateMutation]);

  const clearError = useCallback(() => {
    setMutationError(null);
    createCaseMutation.reset();
    updateCaseMutation.reset();
    deleteCaseMutation.reset();
    executeEvalsMutation.reset();
    deleteRunMutation.reset();
    submitFeedbackMutation.reset();
    generateMutation.reset();
    bulkCreateMutation.reset();
  }, [
    createCaseMutation, updateCaseMutation, deleteCaseMutation,
    executeEvalsMutation, deleteRunMutation, submitFeedbackMutation,
    generateMutation, bulkCreateMutation,
  ]);

  // ── Derived state ──────────────────────────────────────────────

  const loading = casesQuery.isLoading || runsQuery.isLoading || benchmarkQuery.isLoading;
  const running = executeEvalsMutation.isPending;
  const deleting = deleteRunMutation.isPending;
  const generating = generateMutation.isPending;

  // Combine query and mutation errors — show the first one available
  const queryError = casesQuery.error || runsQuery.error || benchmarkQuery.error;
  const error = mutationError
    ?? (queryError ? (queryError instanceof Error ? queryError.message : 'Failed to load data') : null);

  return {
    evalCases: casesQuery.data ?? [],
    evalRuns: runsQuery.data ?? [],
    benchmark: benchmarkQuery.data ?? null,
    feedbackMap,
    loading,
    running,
    deleting,
    generating,
    error,
    loadEvalCases,
    loadEvalRuns,
    loadBenchmark,
    loadFeedback,
    createCase,
    updateCase,
    deleteCase,
    executeEvals,
    deleteRun,
    submitFeedback,
    generateTestEvals: generateTestEvalsAction,
    cancelGenerate,
    bulkCreateCases: bulkCreateCasesAction,
    clearError,
  };
}
