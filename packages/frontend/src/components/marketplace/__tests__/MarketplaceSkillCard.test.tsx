import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import { vi, describe, it, expect, beforeEach } from 'vitest';
import MarketplaceSkillCard from '../MarketplaceSkillCard.js';
import type { MarketplaceListItem } from '../../../services/api/marketplace.js';

const mockNavigate = vi.fn();
vi.mock('react-router', () => ({
  useNavigate: () => mockNavigate,
}));

const mockAddToast = vi.fn();
vi.mock('../../common/ToastContext.js', () => ({
  useToast: () => ({ addToast: mockAddToast }),
}));

const mockToggleUpvote = vi.fn();
const mockToggleFavorite = vi.fn();
vi.mock('../../../services/api/marketplace.js', () => ({
  toggleUpvote: (...args: unknown[]) => mockToggleUpvote(...args),
  toggleFavorite: (...args: unknown[]) => mockToggleFavorite(...args),
}));

// ExportDialog uses createPortal — stub it to keep tests simple
vi.mock('../../export/ExportDialog.js', () => ({
  default: () => <div data-testid="export-dialog" />,
}));

const baseItem: MarketplaceListItem = {
  skillId: 'skill-abc',
  submissionId: 'sub-abc',
  name: 'My Test Skill',
  description: 'A description',
  version: '1',
  submittedBy: 'user-1',
  submittedByName: 'Alice',
  submittedAt: '2026-01-01T00:00:00Z',
  reviewedAt: null,
  downloadCount: 42,
  categories: ['Testing'],
  upvoteCount: 7,
  isUpvoted: false,
  isFavorited: false,
};

function renderCard(item: Partial<MarketplaceListItem> = {}) {
  return render(
    <MarketplaceSkillCard item={{ ...baseItem, ...item }} />,
  );
}

describe('MarketplaceSkillCard — upvote', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('renders the upvote button with the current count', () => {
    renderCard({ upvoteCount: 7, isUpvoted: false });
    const btn = screen.getByRole('button', { name: /upvote/i });
    expect(btn).toBeInTheDocument();
    expect(btn).toHaveTextContent('7');
    expect(btn).toHaveAttribute('aria-label', 'Upvote');
  });

  it('reflects isUpvoted=true in aria-label', () => {
    renderCard({ isUpvoted: true });
    expect(screen.getByRole('button', { name: 'Upvote (active)' })).toBeInTheDocument();
  });

  it('optimistically increments count on click', async () => {
    mockToggleUpvote.mockResolvedValue({ upvoteCount: 8, isUpvoted: true });
    renderCard({ upvoteCount: 7, isUpvoted: false });

    const btn = screen.getByRole('button', { name: /upvote/i });
    fireEvent.click(btn);

    // Optimistic update is synchronous
    expect(btn).toHaveTextContent('8');

    await waitFor(() => expect(mockToggleUpvote).toHaveBeenCalledWith('skill-abc'));
  });

  it('reverts count and shows toast on API error', async () => {
    mockToggleUpvote.mockRejectedValue(new Error('network error'));
    renderCard({ upvoteCount: 7, isUpvoted: false });

    const btn = screen.getByRole('button', { name: /upvote/i });
    fireEvent.click(btn);

    // Optimistic update fires first
    expect(btn).toHaveTextContent('8');

    await waitFor(() =>
      expect(mockAddToast).toHaveBeenCalledWith(
        'error',
        'Something went wrong — please try again',
      ),
    );

    // State reverted
    expect(btn).toHaveTextContent('7');
    expect(btn).toHaveAttribute('aria-label', 'Upvote');
  });

  it('does not trigger card navigation when upvote is clicked', async () => {
    mockToggleUpvote.mockResolvedValue({ upvoteCount: 8, isUpvoted: true });
    renderCard();

    fireEvent.click(screen.getByRole('button', { name: /upvote/i }));

    await waitFor(() => expect(mockToggleUpvote).toHaveBeenCalled());
    expect(mockNavigate).not.toHaveBeenCalled();
  });
});

describe('MarketplaceSkillCard — favorite', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('renders the favorite button with star icon', () => {
    renderCard({ isFavorited: false });
    const btn = screen.getByRole('button', { name: /add to favorites/i });
    expect(btn).toBeInTheDocument();
    // Star SVG should be present (no emoji)
    expect(btn.querySelector('svg')).toBeInTheDocument();
  });

  it('shows "Remove from favorites" label when already favorited', () => {
    renderCard({ isFavorited: true });
    expect(
      screen.getByRole('button', { name: /remove from favorites/i }),
    ).toBeInTheDocument();
  });

  it('optimistically toggles and calls toggleFavorite', async () => {
    mockToggleFavorite.mockResolvedValue({ isFavorited: true });
    renderCard({ isFavorited: false });

    fireEvent.click(screen.getByRole('button', { name: /add to favorites/i }));

    // Optimistic: label changes immediately
    expect(
      screen.getByRole('button', { name: /remove from favorites/i }),
    ).toBeInTheDocument();

    await waitFor(() => expect(mockToggleFavorite).toHaveBeenCalledWith('skill-abc'));
  });

  it('reverts and shows toast on API error', async () => {
    mockToggleFavorite.mockRejectedValue(new Error('network error'));
    renderCard({ isFavorited: false });

    fireEvent.click(screen.getByRole('button', { name: /add to favorites/i }));

    await waitFor(() =>
      expect(mockAddToast).toHaveBeenCalledWith(
        'error',
        'Something went wrong — please try again',
      ),
    );

    expect(
      screen.getByRole('button', { name: /add to favorites/i }),
    ).toBeInTheDocument();
  });
});
