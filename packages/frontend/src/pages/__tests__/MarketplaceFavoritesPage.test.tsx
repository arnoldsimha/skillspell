import { render, screen, waitFor } from '@testing-library/react';
import { MemoryRouter } from 'react-router';
import { vi, describe, it, expect } from 'vitest';
import * as api from '../../services/api/marketplace.js';
import MarketplaceFavoritesPage from '../MarketplaceFavoritesPage.js';

vi.mock('../../services/api/marketplace.js');

vi.mock('../../components/common/ToastContext.js', () => ({
  useToast: () => ({ addToast: vi.fn() }),
}));

// ExportDialog uses createPortal — stub it to keep tests simple
vi.mock('../../components/export/ExportDialog.js', () => ({
  default: () => <div data-testid="export-dialog" />,
}));

const mockNavigate = vi.fn();
vi.mock('react-router', async (importOriginal) => {
  const actual = await importOriginal<typeof import('react-router')>();
  return {
    ...actual,
    useNavigate: () => mockNavigate,
  };
});

const mockItem: api.MarketplaceListItem = {
  skillId: 'skill-1', submissionId: 'sub-1', name: 'My Fav Skill', description: 'desc',
  version: '1', categories: [], downloadCount: 3,
  submittedAt: '', reviewedAt: null, submittedBy: '', upvoteCount: 1, isUpvoted: false, isFavorited: true,
};

describe('MarketplaceFavoritesPage', () => {
  it('shows empty state when no favorites', async () => {
    vi.mocked(api.fetchFavorites).mockResolvedValue({ items: [], total: 0 });
    render(
      <MemoryRouter initialEntries={['/favorites']}>
        <MarketplaceFavoritesPage />
      </MemoryRouter>,
    );
    await waitFor(() =>
      expect(screen.getByText(/haven't favorited any skills yet/i)).toBeInTheDocument(),
    );
  });

  it('renders skill cards when favorites exist', async () => {
    vi.mocked(api.fetchFavorites).mockResolvedValue({ items: [mockItem], total: 1 });
    render(
      <MemoryRouter initialEntries={['/favorites']}>
        <MarketplaceFavoritesPage />
      </MemoryRouter>,
    );
    await waitFor(() => expect(screen.getByText('My Fav Skill')).toBeInTheDocument());
  });

  it('shows pagination when total > limit', async () => {
    vi.mocked(api.fetchFavorites).mockResolvedValue({
      items: [mockItem],
      total: 60,
    });
    render(
      <MemoryRouter initialEntries={['/favorites']}>
        <MarketplaceFavoritesPage />
      </MemoryRouter>,
    );
    await waitFor(() =>
      expect(screen.getByText('Page 1 of 2')).toBeInTheDocument(),
    );
  });

  it('calls fetchFavorites with page from URL', async () => {
    vi.mocked(api.fetchFavorites).mockResolvedValue({ items: [], total: 0 });
    render(
      <MemoryRouter initialEntries={['/favorites?page=2']}>
        <MarketplaceFavoritesPage />
      </MemoryRouter>,
    );
    await waitFor(() =>
      expect(vi.mocked(api.fetchFavorites)).toHaveBeenCalledWith({ limit: 30, page: 2 }),
    );
  });
});
