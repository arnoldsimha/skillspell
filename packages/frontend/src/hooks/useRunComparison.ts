import { useState, useCallback, useEffect, useRef, useMemo } from 'react';
import type { EvalRun } from '@skillspell/shared';
import { rankComparisonCandidates, type ComparisonSuggestion } from '../utils/comparisonRanker.js';

export interface UseRunComparisonOptions {
  runs: EvalRun[];
}

export interface UseRunComparisonReturn {
  /** Set of run IDs selected for comparison (derived from slots A and B). */
  selectedRunIds: Set<string>;
  /** Toggle a run in/out of the comparison selection. */
  toggleRunSelection: (runId: string) => void;
  /** Clear all run selections (both slots). */
  clearRunSelection: () => void;
  /** The two selected runs when exactly 2 are selected, null otherwise. */
  comparisonPair: [EvalRun, EvalRun] | null;
  /** Whether the comparison view is active. */
  isComparing: boolean;
  /** Show/hide the comparison view. */
  setIsComparing: (v: boolean) => void;

  // Named slots
  slotA: string | null;
  slotB: string | null;
  selectionFull: boolean;
  selectSlot: (slot: 'A' | 'B', runId: string | null) => void;
  selectionError: string | null;
  clearSelectionError: () => void;

  // Smart suggestions
  comparisonSuggestions: ComparisonSuggestion[];
  quickCompare: (runId: string) => void;
}

/**
 * Encapsulates A/B slot selection, cross-case blocking,
 * smart suggestions, and quick-compare logic.
 */
export function useRunComparison({ runs }: UseRunComparisonOptions): UseRunComparisonReturn {
  const [slotA, setSlotA] = useState<string | null>(null);
  const [slotB, setSlotB] = useState<string | null>(null);
  const [isComparing, setIsComparing] = useState(false);
  const [selectionError, setSelectionError] = useState<string | null>(null);
  const selectionErrorTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  // Auto-clear selection error after 4 seconds
  const showSelectionError = useCallback((msg: string) => {
    setSelectionError(msg);
    if (selectionErrorTimerRef.current) clearTimeout(selectionErrorTimerRef.current);
    selectionErrorTimerRef.current = setTimeout(() => {
      setSelectionError(null);
      selectionErrorTimerRef.current = null;
    }, 4000);
  }, []);

  const clearSelectionError = useCallback(() => {
    setSelectionError(null);
    if (selectionErrorTimerRef.current) {
      clearTimeout(selectionErrorTimerRef.current);
      selectionErrorTimerRef.current = null;
    }
  }, []);

  // Derive selectedRunIds from slots
  const selectedRunIds = useMemo(() => {
    const set = new Set<string>();
    if (slotA) set.add(slotA);
    if (slotB) set.add(slotB);
    return set;
  }, [slotA, slotB]);

  const selectionFull = slotA !== null && slotB !== null;

  // Clear run selection when the runs array changes (e.g., version switch)
  useEffect(() => {
    setSlotA(null);
    setSlotB(null);
    setIsComparing(false);
  }, [runs]);

  // Toggle a run ID in/out of the selection using named slots
  // Blocks cross-case selection: slot B must have the same evalId as slot A
  const toggleRunSelection = useCallback((runId: string) => {
    clearSelectionError();

    // If already selected in a slot, deselect it
    if (slotA === runId) {
      setSlotA(slotB);
      setSlotB(null);
      setIsComparing(false);
      return;
    }
    if (slotB === runId) {
      setSlotB(null);
      setIsComparing(false);
      return;
    }

    const targetRun = runs.find((r) => r.id === runId);
    if (!targetRun) return;

    if (slotA === null) {
      setSlotA(runId);
      return;
    }

    // Cross-case check
    const slotARun = runs.find((r) => r.id === slotA);
    if (slotARun && targetRun.evalId !== slotARun.evalId) {
      showSelectionError('Can only compare runs from the same test case. Select a different run of the same test.');
      return;
    }

    if (slotB === null) {
      setSlotB(runId);
      return;
    }
    // Both slots full — replace slot B
    setSlotB(runId);
  }, [slotA, slotB, runs, clearSelectionError, showSelectionError]);

  const selectSlot = useCallback((slot: 'A' | 'B', runId: string | null) => {
    if (slot === 'A') {
      setSlotA(runId);
      if (runId === null) setIsComparing(false);
    } else {
      setSlotB(runId);
      if (runId === null) setIsComparing(false);
    }
  }, []);

  const clearRunSelection = useCallback(() => {
    setSlotA(null);
    setSlotB(null);
    setIsComparing(false);
  }, []);

  // Derive the comparison pair when both slots are filled
  const comparisonPair = useMemo<[EvalRun, EvalRun] | null>(() => {
    if (!slotA || !slotB) return null;
    const runA = runs.find((r) => r.id === slotA);
    const runB = runs.find((r) => r.id === slotB);
    if (!runA || !runB) return null;
    return [runA, runB];
  }, [slotA, slotB, runs]);

  // Smart comparison suggestions — ranked candidates for slot B
  const comparisonSuggestions = useMemo<ComparisonSuggestion[]>(() => {
    if (!slotA) return [];
    const slotARun = runs.find((r) => r.id === slotA);
    if (!slotARun) return [];
    const exclude = new Set<string>([slotA]);
    if (slotB) exclude.add(slotB);
    return rankComparisonCandidates(slotARun, runs, exclude);
  }, [slotA, slotB, runs]);

  // Quick compare: set slot A to given run, auto-fill slot B with the best suggestion
  const quickCompare = useCallback((runId: string) => {
    const run = runs.find((r) => r.id === runId);
    if (!run) return;
    const suggestions = rankComparisonCandidates(run, runs, new Set([runId]));
    if (suggestions.length === 0) {
      showSelectionError('No comparable runs found for this test case.');
      return;
    }
    setSlotA(runId);
    setSlotB(suggestions[0].runId);
  }, [runs, showSelectionError]);

  return {
    selectedRunIds,
    toggleRunSelection,
    clearRunSelection,
    comparisonPair,
    isComparing,
    setIsComparing,
    slotA,
    slotB,
    selectionFull,
    selectSlot,
    selectionError,
    clearSelectionError,
    comparisonSuggestions,
    quickCompare,
  };
}
