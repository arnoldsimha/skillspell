import { useState, useCallback, useRef, useEffect } from 'react';
import { flushSync } from 'react-dom';
import { useMutation, useQueryClient } from '@tanstack/react-query';
import type {
  IterationState,
  OptimizationResult,
  SkillDraft,
  CoverageGapReport,
  CoverageGap,
} from '@skillspell/shared';
import { approveOptimization } from '../services/api/optimization.js';
import { queryKeys } from '../lib/queryKeys.js';
import { connectStreamingSocket, getStreamingSocket, onStreamEvent } from '../utils/streamingSocket.js';
import { suggestGapCounts, generateTestEvals, bulkCreateEvalCases } from '../services/api/evals.js';

export type OptStep = 'configure' | 'running' | 'review' | 'applied';

export interface OptConfig {
  maxIterations: number;
  targetPassRate?: number;
  includeFeedback?: boolean;
}

export interface UseSkillContentOptimizerReturn {
  step: OptStep;
  loading: boolean;
  error: string | null;

  /** Live iterations during the running step. */
  iterations: IterationState[];
  /** Current sub-step being executed (from the latest progress event). */
  currentProgress: IterationState | null;
  /** Final result after optimization completes. */
  result: OptimizationResult | null;
  /** Coverage gaps detected after optimization completes. */
  coverageGaps: CoverageGapReport | null;

  /** Start the optimization loop (transitions to 'running'). */
  startOptimization: (skillId: string, config: OptConfig) => void;
  /** Cancel the running optimization. Aborts the WebSocket stream. */
  cancel: () => void;
  /** Apply the best draft as a new skill version. */
  applyBest: (skillId: string) => Promise<void>;
  /** Set when a regression was detected and the loop reverted to a previous draft. */
  regressionDetected: { iteration: number; prevScore: number; currentScore: number; revertedTo: number } | null;
  /** Reset the wizard to configure step. */
  reset: () => void;
  previousConfig: OptConfig | null;
  analyzingGaps: boolean;
  suggestedGapCounts: Record<string, number> | null;
  fixingGaps: boolean;
  fixGapsError: string | null;
  gapFixProgress: { current: number; total: number; dimension: string } | null;
  analyzeGaps: (skillId: string, gaps: CoverageGap[]) => Promise<void>;
  executeGapFix: (skillId: string, gaps: CoverageGap[], counts: Record<string, number>) => Promise<void>;
  clearGapFix: () => void;
  cancelGapFix: () => void;
}

export function useSkillContentOptimizer(): UseSkillContentOptimizerReturn {
  const queryClient = useQueryClient();

  const [step, setStep] = useState<OptStep>('configure');
  const [iterations, setIterations] = useState<IterationState[]>([]);
  const [currentProgress, setCurrentProgress] = useState<IterationState | null>(null);
  const [result, setResult] = useState<OptimizationResult | null>(null);
  const [coverageGaps, setCoverageGaps] = useState<CoverageGapReport | null>(null);
  const [regressionDetected, setRegressionDetected] = useState<{ iteration: number; prevScore: number; currentScore: number; revertedTo: number } | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const [previousConfig, setPreviousConfig] = useState<OptConfig | null>(null);
  const [analyzingGaps, setAnalyzingGaps] = useState(false);
  const [suggestedGapCounts, setSuggestedGapCounts] = useState<Record<string, number> | null>(null);
  const [fixingGaps, setFixingGaps] = useState(false);
  const [fixGapsError, setFixGapsError] = useState<string | null>(null);
  const [gapFixProgress, setGapFixProgress] = useState<{ current: number; total: number; dimension: string } | null>(null);

  const abortRef = useRef<AbortController | null>(null);
  const skillIdRef = useRef<string | null>(null);

  // Clean up on unmount — abort any in-flight operation
  useEffect(() => {
    return () => {
      abortRef.current?.abort();
    };
  }, []);

  const startOptimization = useCallback((skillId: string, config: OptConfig) => {
    setStep('running');
    setIterations([]);
    setCurrentProgress(null);
    setResult(null);
    setCoverageGaps(null);
    setRegressionDetected(null);
    setError(null);
    setLoading(true);
    setPreviousConfig(config);

    const ac = new AbortController();
    abortRef.current = ac;
    skillIdRef.current = skillId;

    // Fire-and-forget — WebSocket events drive state updates
    (async () => {
      try {
        await connectStreamingSocket();
        const sock = getStreamingSocket();
        const requestId = crypto.randomUUID();

        await new Promise<void>((resolve) => {
          const unsubscribe = onStreamEvent(requestId, (ev) => {
            // Use flushSync so React renders each event immediately
            // instead of batching them (which would skip intermediate sub-steps).
            switch (ev.type) {
              case 'iteration-progress':
                flushSync(() => {
                  setCurrentProgress(ev as unknown as IterationState);
                });
                break;

              case 'iteration-complete':
                flushSync(() => {
                  setIterations(prev => [...prev, ev as unknown as IterationState]);
                  setCurrentProgress(null);
                });
                break;

              case 'regression-detected':
                flushSync(() => {
                  setRegressionDetected(ev as unknown as { iteration: number; prevScore: number; currentScore: number; revertedTo: number });
                });
                break;

              case 'optimization-complete':
                flushSync(() => {
                  const optResult = ev as unknown as OptimizationResult;
                  setResult(optResult);
                  setCoverageGaps(optResult.coverageGaps ?? null);
                  setStep('review');
                  setLoading(false);
                });
                unsubscribe();
                ac.signal.removeEventListener('abort', onAbort);
                resolve();
                break;

              case 'optimization-error':
                flushSync(() => {
                  setError((ev as unknown as { message: string }).message);
                  setStep('configure');
                  setLoading(false);
                });
                unsubscribe();
                ac.signal.removeEventListener('abort', onAbort);
                resolve();
                break;

              case 'interrupted':
                // Server restarting (k8s pod recycle). Terminal + retryable —
                // surface a clear message instead of leaving the UI spinning.
                flushSync(() => {
                  setError('Optimization was interrupted because the server restarted. Please try again.');
                  setStep('configure');
                  setLoading(false);
                });
                unsubscribe();
                ac.signal.removeEventListener('abort', onAbort);
                resolve();
                break;
            }
          }, sock);

          const onAbort = () => {
            sock.emit('cancel', { requestId });
            unsubscribe();
            resolve();
          };
          ac.signal.addEventListener('abort', onAbort, { once: true });

          sock.emit('optimize-skill', {
            skillId,
            requestId,
            maxIterations: config.maxIterations,
            targetPassRate: config.targetPassRate,
            includeFeedback: config.includeFeedback,
          });
        });
      } catch (err) {
        if (!ac.signal.aborted) {
          setError(err instanceof Error ? err.message : 'Failed to start optimization');
          setStep('configure');
          setLoading(false);
        }
      }
    })();
  }, []);

  const cancel = useCallback(() => {
    abortRef.current?.abort();
    setLoading(false);
    // If we have completed iterations, go to review with what we have
    if (iterations.length > 0) {
      setStep('review');
    } else {
      setStep('configure');
    }
  }, [iterations.length]);

  const applyMutation = useMutation({
    mutationFn: ({ skillId, draft }: { skillId: string; draft: SkillDraft }) =>
      approveOptimization(skillId, {
        name: draft.name,
        description: draft.description,
        skillContent: draft.skillContent,
        scripts: draft.scripts,
        references: draft.references,
        assets: draft.assets,
      }),
    onSuccess: (_data, { skillId }) => {
      queryClient.invalidateQueries({ queryKey: queryKeys.skills.detail(skillId) });
      queryClient.invalidateQueries({ queryKey: queryKeys.skills.all });
      setStep('applied');
    },
  });

  const applyBest = useCallback(
    async (skillId: string) => {
      if (!result?.bestIteration?.draft) return;
      await applyMutation.mutateAsync({
        skillId,
        draft: result.bestIteration.draft,
      });
    },
    [result, applyMutation],
  );

  const reset = useCallback(() => {
    abortRef.current?.abort();
    setStep('configure');
    setIterations([]);
    setCurrentProgress(null);
    setResult(null);
    setCoverageGaps(null);
    setRegressionDetected(null);
    setError(null);
    setLoading(false);
    setPreviousConfig(null);
    setAnalyzingGaps(false);
    setSuggestedGapCounts(null);
    setFixingGaps(false);
    setFixGapsError(null);
    setGapFixProgress(null);
  }, []);

  const analyzeGaps = useCallback(async (skillId: string, gaps: CoverageGap[]) => {
    const signal = abortRef.current?.signal;
    setAnalyzingGaps(true);
    setFixGapsError(null);
    try {
      const counts = await suggestGapCounts(skillId, gaps, signal);
      setSuggestedGapCounts(counts);
    } catch (err) {
      setFixGapsError((err as Error).message || 'Failed to analyze gaps');
    } finally {
      setAnalyzingGaps(false);
    }
  }, []);

  const executeGapFix = useCallback(async (
    skillId: string,
    gaps: CoverageGap[],
    counts: Record<string, number>,
  ) => {
    if (!previousConfig) return;
    const signal = abortRef.current?.signal;

    setFixingGaps(true);
    setFixGapsError(null);
    setSuggestedGapCounts(null);

    try {
      for (let i = 0; i < gaps.length; i++) {
        const gap = gaps[i];
        const count = counts[gap.dimension] ?? 3;

        setGapFixProgress({ current: 0, total: count, dimension: gap.dimension });

        const generated = await generateTestEvals(
          skillId,
          count,
          (_phase, current, total) => setGapFixProgress({ current, total, dimension: gap.dimension }),
          signal,
          gap.suggestionPrompt,
        );

        if (!generated.length) {
          throw new Error(`No cases generated for gap: ${gap.dimension}`);
        }

        await bulkCreateEvalCases(skillId, generated.map(c => ({
          name: c.name,
          prompt: c.prompt,
          expectedOutput: c.expectedOutput ?? '',
          assertions: c.assertions ?? [],
        })));
      }

      setGapFixProgress(null);
      setFixingGaps(false);
      startOptimization(skillId, previousConfig);
    } catch (err) {
      if (!signal?.aborted) {
        setFixGapsError((err as Error).message || 'Failed to generate cases');
      }
      setFixingGaps(false);
      setGapFixProgress(null);
    }
  }, [previousConfig, startOptimization]);

  const clearGapFix = useCallback(() => {
    setSuggestedGapCounts(null);
    setFixGapsError(null);
  }, []);

  // Abort an in-flight gap fix (called from the generation modal Cancel button)
  const cancelGapFix = useCallback(() => {
    abortRef.current?.abort();
    abortRef.current = null; // prevent dead-signal on next analyzeGaps/executeGapFix call
    setFixingGaps(false);
    setFixGapsError(null);
    setGapFixProgress(null);
    setSuggestedGapCounts(null);
  }, []);

  return {
    step,
    loading,
    error: error || (applyMutation.error ? (applyMutation.error as Error).message : null),
    iterations,
    currentProgress,
    result,
    coverageGaps,
    regressionDetected,
    startOptimization,
    cancel,
    applyBest,
    reset,
    previousConfig,
    analyzingGaps,
    suggestedGapCounts,
    fixingGaps,
    fixGapsError,
    gapFixProgress,
    analyzeGaps,
    executeGapFix,
    clearGapFix,
    cancelGapFix,
  };
}
