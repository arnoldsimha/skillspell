import { render, screen, waitFor } from '@testing-library/react';
import { vi, describe, it, expect, beforeEach } from 'vitest';
import { MemoryRouter } from 'react-router';
import * as api from '../../services/api/marketplace.js';
import MarketplaceHomePage from '../MarketplaceHomePage.js';

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
  skillId: 'skill-1',
  submissionId: 'sub-1',
  name: 'Test Skill',
  description: 'does things',
  version: '1',
  categories: [],
  downloadCount: 5,
  submittedAt: '',
  reviewedAt: null,
  submittedBy: '',
  upvoteCount: 2,
  isUpvoted: false,
  isFavorited: false,
};

describe('MarketplaceHomePage', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.mocked(api.browseMarketplace).mockResolvedValue({ items: [mockItem], total: 1 });
    vi.mocked(api.fetchFavorites).mockResolvedValue({ items: [], total: 0 });
  });

  it('renders Popular Skills section heading', () => {
    render(<MemoryRouter><MarketplaceHomePage /></MemoryRouter>);
    expect(screen.getByText(/Popular Skills/)).toBeInTheDocument();
  });

  it('renders My Favorites section heading', () => {
    render(<MemoryRouter><MarketplaceHomePage /></MemoryRouter>);
    // "My Favorites" appears in both the tab bar and the section heading — assert at least one exists
    expect(screen.getAllByText(/My Favorites/).length).toBeGreaterThanOrEqual(1);
  });

  it('shows skill card after popular skills load', async () => {
    render(<MemoryRouter><MarketplaceHomePage /></MemoryRouter>);
    await waitFor(() => expect(screen.getByText('Test Skill')).toBeInTheDocument());
  });

  it('shows empty favorites state when no favorites', async () => {
    render(<MemoryRouter><MarketplaceHomePage /></MemoryRouter>);
    await waitFor(() =>
      expect(screen.getByText(/No favorites yet/)).toBeInTheDocument(),
    );
  });

  it('shows See all link when favorites > 6', async () => {
    vi.mocked(api.fetchFavorites).mockResolvedValue({
      items: Array.from({ length: 6 }, (_, i) => ({
        ...mockItem,
        skillId: `s${i}`,
        name: `Skill ${i}`,
      })),
      total: 8,
    });
    render(<MemoryRouter><MarketplaceHomePage /></MemoryRouter>);
    await waitFor(() => expect(screen.getByText('See all →')).toBeInTheDocument());
  });

  it('does not show See all link when favorites <= 6', async () => {
    vi.mocked(api.fetchFavorites).mockResolvedValue({
      items: Array.from({ length: 3 }, (_, i) => ({
        ...mockItem,
        skillId: `s${i}`,
        name: `Skill ${i}`,
      })),
      total: 3,
    });
    render(<MemoryRouter><MarketplaceHomePage /></MemoryRouter>);
    await waitFor(() => expect(screen.queryByText('See all →')).not.toBeInTheDocument());
  });
});
