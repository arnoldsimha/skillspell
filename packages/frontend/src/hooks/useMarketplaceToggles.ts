/**
 * IN-002: Custom hooks for optimistic-update upvote and favorite toggles.
 *
 * Extracted from MarketplaceDetailPage and MarketplaceSkillCard to DRY up
 * the identical pending-ref / prev-state-capture / rollback-on-error pattern.
 */
import { useState, useRef } from 'react';
import { toggleUpvote, toggleFavorite } from '../services/api/marketplace.js';
import { useToast } from '../components/common/ToastContext.js';

export interface UseUpvoteToggleResult {
  upvoteCount: number;
  isUpvoted: boolean;
  handleUpvote: () => Promise<void>;
  /** Sync the local state to freshly-loaded values (e.g. after async page load). */
  syncUpvoteState: (count: number, upvoted: boolean) => void;
}

/**
 * Optimistic-update toggle for the upvote action.
 *
 * - Immediately increments / decrements the local count and flips the state.
 * - On API success, reconciles with the server-returned count.
 * - On API failure, rolls back to the previous state and shows an error toast.
 * - De-bounced via a pending ref so rapid clicks are ignored while the request is in flight.
 */
export function useUpvoteToggle(
  skillId: string,
  initial: { upvoteCount: number; isUpvoted: boolean },
): UseUpvoteToggleResult {
  const { addToast } = useToast();
  const [upvoteCount, setUpvoteCount] = useState(initial.upvoteCount);
  const [isUpvoted, setIsUpvoted] = useState(initial.isUpvoted);
  const pendingRef = useRef(false);

  const handleUpvote = async () => {
    if (pendingRef.current) return;
    pendingRef.current = true;
    const prevCount = upvoteCount;
    const prevState = isUpvoted;
    setUpvoteCount(c => (isUpvoted ? c - 1 : c + 1));
    setIsUpvoted(s => !s);
    try {
      const res = await toggleUpvote(skillId);
      setUpvoteCount(res.upvoteCount);
      setIsUpvoted(res.isUpvoted);
    } catch {
      setUpvoteCount(prevCount);
      setIsUpvoted(prevState);
      addToast('error', 'Something went wrong — please try again');
    } finally {
      pendingRef.current = false;
    }
  };

  const syncUpvoteState = (count: number, upvoted: boolean) => {
    setUpvoteCount(count);
    setIsUpvoted(upvoted);
  };

  return { upvoteCount, isUpvoted, handleUpvote, syncUpvoteState };
}

export interface UseFavoriteToggleResult {
  isFavorited: boolean;
  handleFavorite: () => Promise<void>;
  /** Sync the local state to freshly-loaded values (e.g. after async page load). */
  syncFavoriteState: (favorited: boolean) => void;
}

/**
 * Optimistic-update toggle for the favorite action.
 *
 * Same pattern as useUpvoteToggle — immediate state flip, server reconciliation,
 * rollback on failure, and in-flight de-bounce.
 */
export function useFavoriteToggle(
  skillId: string,
  initialIsFavorited: boolean,
): UseFavoriteToggleResult {
  const { addToast } = useToast();
  const [isFavorited, setIsFavorited] = useState(initialIsFavorited);
  const pendingRef = useRef(false);

  const handleFavorite = async () => {
    if (pendingRef.current) return;
    pendingRef.current = true;
    const prev = isFavorited;
    setIsFavorited(f => !f);
    try {
      const res = await toggleFavorite(skillId);
      setIsFavorited(res.isFavorited);
    } catch {
      setIsFavorited(prev);
      addToast('error', 'Something went wrong — please try again');
    } finally {
      pendingRef.current = false;
    }
  };

  const syncFavoriteState = (favorited: boolean) => {
    setIsFavorited(favorited);
  };

  return { isFavorited, handleFavorite, syncFavoriteState };
}
