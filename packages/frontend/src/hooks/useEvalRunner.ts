import { useState, useCallback, useRef, useEffect } from 'react';
import { flushSync } from 'react-dom';
import { useQueryClient } from '@tanstack/react-query';
import type {
  RunEvalsRequest,
  EvalProgressStarted,
  EvalProgressCompleted,
  EvalRunStreamComplete,
} from '@skillspell/shared';
import { queryKeys } from '../lib/queryKeys.js';
import { connectStreamingSocket, getStreamingSocket, onStreamEvent } from '../utils/streamingSocket.js';

// ── Types ──────────────────────────────────────────────────────────────

export type EvalStatus = 'pending' | 'executing' | 'grading' | 'completed' | 'failed';

export interface EvalStatusEntry {
  /** 1-based global index — unique even when runsPerCase > 1. */
  index: number;
  evalId: string;
  evalName: string;
  status: EvalStatus;
  /** 0-100 score, only set when completed. */
  score?: number;
  /** pass/fail/partial, only set when completed. */
  overall?: 'pass' | 'fail' | 'partial';
  /** Duration in ms, only set when completed. */
  durationMs?: number;
}

export interface EvalRunProgress {
  /** Whether the eval run is currently in progress. */
  running: boolean;
  /** Number of completed evals so far. */
  completed: number;
  /** Total number of evals to run. */
  total: number;
  /** Ordered list of per-eval statuses (keyed by index, not evalId). */
  evalStatuses: EvalStatusEntry[];
  /** Seconds elapsed since the run started. */
  elapsed: number;
  /** Error message if the run failed. */
  error: string | null;
}

export interface UseEvalRunnerReturn {
  /** Current progress state. */
  progress: EvalRunProgress;
  /** Start running evals with WebSocket progress streaming. */
  startRun: (skillId: string, request: RunEvalsRequest) => void;
  /** Cancel the in-flight eval run. Aborts the WebSocket stream. */
  cancel: () => void;
}

// ── Hook ───────────────────────────────────────────────────────────────

export function useEvalRunner(): UseEvalRunnerReturn {
  const queryClient = useQueryClient();

  const [running, setRunning] = useState(false);
  const [completed, setCompleted] = useState(0);
  const [total, setTotal] = useState(0);
  const [evalStatuses, setEvalStatuses] = useState<EvalStatusEntry[]>([]);
  const [elapsed, setElapsed] = useState(0);
  const [error, setError] = useState<string | null>(null);

  const abortRef = useRef<AbortController | null>(null);
  const skillIdRef = useRef<string | null>(null);
  const elapsedRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const startTimeRef = useRef<number>(0);

  /** Stop the elapsed‑second timer (called in multiple places). */
  const stopTimer = useCallback(() => {
    if (elapsedRef.current) {
      clearInterval(elapsedRef.current);
      elapsedRef.current = null;
    }
  }, []);

  // Clean up on unmount — abort + stop timer
  useEffect(() => {
    return () => {
      abortRef.current?.abort();
      stopTimer();
    };
  }, [stopTimer]);

  // Warn on tab close / refresh while running; abort if user leaves
  useEffect(() => {
    const handleBeforeUnload = (e: BeforeUnloadEvent) => {
      if (!abortRef.current || abortRef.current.signal.aborted) return;
      // Show native browser "are you sure?" confirmation dialog
      e.preventDefault();
      // Abort the WebSocket stream so the backend stops all LLM calls
      abortRef.current.abort();
      stopTimer();
    };

    window.addEventListener('beforeunload', handleBeforeUnload);
    return () => window.removeEventListener('beforeunload', handleBeforeUnload);
  }, [stopTimer]);

  const startRun = useCallback((skillId: string, request: RunEvalsRequest) => {
    // Reset state
    setRunning(true);
    setCompleted(0);
    setTotal(0);
    setEvalStatuses([]);
    setElapsed(0);
    setError(null);

    // Abort any previous run
    abortRef.current?.abort();
    const ac = new AbortController();
    abortRef.current = ac;
    skillIdRef.current = skillId;

    // Start elapsed timer
    startTimeRef.current = Date.now();
    stopTimer();
    elapsedRef.current = setInterval(() => {
      setElapsed(Math.floor((Date.now() - startTimeRef.current) / 1000));
    }, 1000);

    // Fire-and-forget — WebSocket events drive state updates
    (async () => {
      try {
        await connectStreamingSocket();
        const sock = getStreamingSocket();
        const requestId = crypto.randomUUID();

        await new Promise<void>((resolve) => {
          const unsubscribe = onStreamEvent(requestId, (ev) => {
            // Use flushSync so React renders each WS event immediately
            // instead of batching them. The handler runs outside React's
            // event system, so React 18 automatic batching does NOT apply.
            switch (ev.type) {
              case 'eval-started': {
                const d = ev as unknown as EvalProgressStarted & { type: string };
                flushSync(() => {
                  setTotal(d.total);
                  setEvalStatuses((prev) => {
                    // Use index as unique key (handles runsPerCase > 1)
                    const exists = prev.some((e) => e.index === d.index);
                    if (exists) {
                      return prev.map((e) =>
                        e.index === d.index
                          ? { ...e, status: 'executing' as EvalStatus }
                          : e,
                      );
                    }
                    return [
                      ...prev,
                      {
                        index: d.index,
                        evalId: d.evalId,
                        evalName: d.evalName,
                        status: 'executing' as EvalStatus,
                      },
                    ];
                  });
                });
                break;
              }

              case 'eval-grading': {
                const d = ev as unknown as EvalProgressStarted & { type: string };
                flushSync(() => {
                  setEvalStatuses((prev) =>
                    prev.map((e) =>
                      e.index === d.index
                        ? { ...e, status: 'grading' as EvalStatus }
                        : e,
                    ),
                  );
                });
                break;
              }

              case 'eval-completed': {
                const d = ev as unknown as EvalProgressCompleted & { type: string };
                flushSync(() => {
                  setCompleted((prev) => prev + 1);
                  setEvalStatuses((prev) =>
                    prev.map((e) =>
                      e.index === d.index
                        ? {
                            ...e,
                            status: d.status as EvalStatus,
                            score: d.score,
                            overall: d.overall,
                            durationMs: d.durationMs,
                          }
                        : e,
                    ),
                  );
                });
                break;
              }

              case 'eval-run-complete': {
                const d = ev as unknown as EvalRunStreamComplete & { type: string };
                flushSync(() => {
                  setRunning(false);
                  setCompleted(d.totalRuns);
                  setTotal(d.totalRuns);
                });

                // Invalidate React Query caches so runs + benchmark refetch
                // (no full EvalRun[] in WS payload — avoids large payloads)
                queryClient.invalidateQueries({
                  queryKey: queryKeys.evals.runs(skillId),
                });
                queryClient.invalidateQueries({
                  queryKey: queryKeys.evals.benchmark(skillId),
                });

                stopTimer();
                unsubscribe();
                ac.signal.removeEventListener('abort', onAbort);
                resolve();
                break;
              }

              case 'eval-run-error': {
                const d = ev as unknown as { type: string; message: string };
                flushSync(() => {
                  setError(d.message);
                  setRunning(false);
                });
                stopTimer();
                unsubscribe();
                ac.signal.removeEventListener('abort', onAbort);
                resolve();
                break;
              }

              case 'interrupted': {
                // Server restarting (k8s pod recycle). Terminal + retryable.
                flushSync(() => {
                  setError('Eval run was interrupted because the server restarted. Please try again.');
                  setRunning(false);
                });
                stopTimer();
                unsubscribe();
                ac.signal.removeEventListener('abort', onAbort);
                resolve();
                break;
              }
            }
          }, sock);

          // Handle abort (cancel button / unmount)
          const onAbort = () => {
            sock.emit('cancel', { requestId });
            unsubscribe();
            resolve(); // don't reject — cancel is intentional
          };
          ac.signal.addEventListener('abort', onAbort, { once: true });

          sock.emit('run-evals', { ...request, skillId, requestId });
        });
      } catch (err) {
        if (!ac.signal.aborted) {
          setError(
            err instanceof Error ? err.message : 'Failed to start eval run',
          );
          setRunning(false);
          stopTimer();
        }
      }
    })();
  }, [queryClient, stopTimer]);

  const cancel = useCallback(() => {
    abortRef.current?.abort();
    setRunning(false);
    stopTimer();
  }, [stopTimer]);

  return {
    progress: {
      running,
      completed,
      total,
      evalStatuses,
      elapsed,
      error,
    },
    startRun,
    cancel,
  };
}
