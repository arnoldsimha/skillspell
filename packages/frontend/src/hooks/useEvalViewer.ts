import { useState, useCallback, useEffect, useRef } from 'react';
import type { EvalRun, EvalFeedback, SaveFeedbackRequest } from '@skillspell/shared';
import { useRunComparison, type UseRunComparisonReturn } from './useRunComparison.js';

export interface UseEvalViewerOptions {
  runs: EvalRun[];
  skillId: string;
  /** Map of runId → EvalFeedback for restoring previously saved feedback. */
  feedbackMap?: Record<string, EvalFeedback>;
  onSaveFeedback: (skillId: string, data: SaveFeedbackRequest) => Promise<EvalFeedback>;
}

export interface UseEvalViewerReturn extends UseRunComparisonReturn {
  // Navigation state
  currentIndex: number;
  currentRun: EvalRun | null;
  hasNext: boolean;
  hasPrev: boolean;
  totalRuns: number;

  // Navigation actions
  goToNext: () => void;
  goToPrev: () => void;
  goToIndex: (index: number) => void;

  // Feedback state
  feedbackText: string;
  feedbackRating: 'good' | 'bad' | 'neutral' | null;
  savingFeedback: boolean;
  feedbackSaved: boolean;

  // Feedback actions
  setFeedbackText: (text: string) => void;
  setFeedbackRating: (rating: 'good' | 'bad' | 'neutral' | null) => void;
  saveFeedback: () => Promise<void>;
  /** True when feedback has unsaved changes. */
  feedbackDirty: boolean;

  // Tab state
  activeTab: 'outputs' | 'benchmark';
  setActiveTab: (tab: 'outputs' | 'benchmark') => void;
}

export function useEvalViewer({
  runs,
  skillId,
  feedbackMap,
  onSaveFeedback,
}: UseEvalViewerOptions): UseEvalViewerReturn {
  const [currentIndex, setCurrentIndex] = useState(0);
  const [feedbackText, setFeedbackText] = useState('');
  const [feedbackRating, setFeedbackRating] = useState<'good' | 'bad' | 'neutral' | null>(null);
  const [savingFeedback, setSavingFeedback] = useState(false);
  const [feedbackSaved, setFeedbackSaved] = useState(false);
  const [activeTab, setActiveTab] = useState<'outputs' | 'benchmark'>('outputs');

  // Delegate all comparison logic to the dedicated hook
  const comparison = useRunComparison({ runs });

  const lastSavedFeedbackRef = useRef<string>('');
  const lastSavedRatingRef = useRef<string>('');

  const currentRun = runs[currentIndex] ?? null;
  const hasNext = currentIndex < runs.length - 1;
  const hasPrev = currentIndex > 0;

  // Track whether feedback has unsaved changes
  const feedbackDirty =
    // eslint-disable-next-line react-hooks/refs
    feedbackText !== lastSavedFeedbackRef.current ||
    // eslint-disable-next-line react-hooks/refs
    (feedbackRating ?? '') !== lastSavedRatingRef.current;

  // Restore or reset feedback when switching runs
  useEffect(() => {
    const runId = runs[currentIndex]?.id;
    const existing = runId ? feedbackMap?.[runId] : undefined;

    if (existing) {
      setFeedbackText(existing.feedback || '');
      setFeedbackRating(existing.rating ?? null);
      lastSavedFeedbackRef.current = existing.feedback || '';
      lastSavedRatingRef.current = existing.rating ?? '';
    } else {
      setFeedbackText('');
      setFeedbackRating(null);
      lastSavedFeedbackRef.current = '';
      lastSavedRatingRef.current = '';
    }
    setFeedbackSaved(false);
  }, [currentIndex, runs, feedbackMap]);

  // Manual save feedback
  const saveFeedback = useCallback(async () => {
    if (!currentRun || savingFeedback) return;
    if (!feedbackText && !feedbackRating) return;

    setSavingFeedback(true);
    try {
      await onSaveFeedback(skillId, {
        runId: currentRun.id,
        feedback: feedbackText,
        rating: feedbackRating ?? undefined,
      });
      lastSavedFeedbackRef.current = feedbackText;
      lastSavedRatingRef.current = feedbackRating ?? '';
      setFeedbackSaved(true);
      setTimeout(() => setFeedbackSaved(false), 2000);
    } catch (err) {
      console.error('Failed to save feedback:', err);
    } finally {
      setSavingFeedback(false);
    }
  }, [currentRun, feedbackText, feedbackRating, skillId, onSaveFeedback, savingFeedback]);

  // Keyboard navigation (arrow keys when not in input/textarea)
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.target instanceof HTMLInputElement || e.target instanceof HTMLTextAreaElement) {
        return;
      }
      if (e.key === 'ArrowRight' && hasNext) {
        setCurrentIndex((prev) => prev + 1);
      } else if (e.key === 'ArrowLeft' && hasPrev) {
        setCurrentIndex((prev) => prev - 1);
      }
    };

    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [hasNext, hasPrev]);

  const goToNext = useCallback(() => {
    if (hasNext) setCurrentIndex((prev) => prev + 1);
  }, [hasNext]);

  const goToPrev = useCallback(() => {
    if (hasPrev) setCurrentIndex((prev) => prev - 1);
  }, [hasPrev]);

  const goToIndex = useCallback(
    (index: number) => {
      if (index >= 0 && index < runs.length) setCurrentIndex(index);
    },
    [runs.length],
  );

  return {
    // Navigation
    currentIndex,
    currentRun,
    hasNext,
    hasPrev,
    totalRuns: runs.length,
    goToNext,
    goToPrev,
    goToIndex,

    // Feedback
    feedbackText,
    feedbackRating,
    savingFeedback,
    feedbackSaved,
    setFeedbackText,
    setFeedbackRating,
    saveFeedback,
    feedbackDirty,

    // Tab state
    activeTab,
    setActiveTab,

    // Comparison (spread from dedicated hook)
    ...comparison,
  };
}
