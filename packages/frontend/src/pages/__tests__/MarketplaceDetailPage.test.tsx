import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import { vi, describe, it, expect, beforeEach } from 'vitest';
import { MemoryRouter, Route, Routes } from 'react-router';
import { MarketplaceDetailPage } from '../MarketplaceDetailPage.js';

const mockNavigate = vi.fn();
vi.mock('react-router', async (importOriginal) => {
  const actual = await importOriginal<typeof import('react-router')>();
  return { ...actual, useNavigate: () => mockNavigate };
});

vi.mock('../../components/common/ToastContext.js', () => ({
  useToast: () => ({ addToast: vi.fn() }),
}));

vi.mock('../../hooks/useAuth.js', () => ({
  useAuth: () => ({ user: { role: 'user', id: 'user-1' } }),
}));

// The page formats dates via user prefs; provide them without PreferencesProvider.
vi.mock('../../hooks/useUserPreferences.js', () => ({
  useUserPreferences: () => ({
    prefs: { timezone: 'UTC', dateFormat: 'DD/MM/YYYY' },
  }),
}));

vi.mock('../../components/skills/SkillViewer.js', () => ({
  default: () => <div data-testid="skill-viewer" />,
}));

vi.mock('../../components/export/ExportDialog.js', () => ({
  default: () => <div data-testid="export-dialog" />,
}));

const mockGetSkill = vi.fn();
const mockToggleUpvote = vi.fn();
const mockToggleFavorite = vi.fn();
vi.mock('../../services/api/marketplace.js', () => ({
  getMarketplaceSkill: (...a: unknown[]) => mockGetSkill(...a),
  toggleUpvote: (...a: unknown[]) => mockToggleUpvote(...a),
  toggleFavorite: (...a: unknown[]) => mockToggleFavorite(...a),
  getMarketplaceVersions: () => Promise.resolve([]),
  downloadMarketplaceSkill: vi.fn(),
  removeMarketplaceSkill: vi.fn(),
  getMarketplaceSkillDiagram: vi.fn(),
}));

vi.mock('../../services/api/taxonomy.js', () => ({
  listCategories: () => Promise.resolve([]),
}));

const skillData = {
  skillId: 'abc-uuid',
  submissionId: 'sub-1',
  name: 'Test Skill',
  description: 'Test desc',
  version: '2',
  categories: [],
  downloadCount: 5,
  submittedAt: '2026-01-01T00:00:00Z',
  reviewedAt: null,
  submittedBy: 'user-1',
  upvoteCount: 3,
  isUpvoted: false,
  isFavorited: false,
  skillContent: '# Test',
  scripts: [],
  references: [],
  assets: [],
};

function renderPage(skillId = 'abc-uuid') {
  return render(
    <MemoryRouter initialEntries={[`/browse/${skillId}`]}>
      <Routes>
        <Route path="/browse/:skillId" element={<MarketplaceDetailPage />} />
      </Routes>
    </MemoryRouter>,
  );
}

describe('MarketplaceDetailPage — upvote/favorite', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockGetSkill.mockResolvedValue(skillData);
    mockToggleUpvote.mockResolvedValue({ upvoteCount: 4, isUpvoted: true });
    mockToggleFavorite.mockResolvedValue({ isFavorited: true });
  });

  it('shows upvote and favorite buttons after skill loads', async () => {
    renderPage();
    await waitFor(() => expect(screen.getByText('Test Skill')).toBeInTheDocument());
    expect(screen.getByRole('button', { name: /upvote/i })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: /add to favorites/i })).toBeInTheDocument();
  });

  it('calls toggleUpvote with the skillId when upvote is clicked', async () => {
    renderPage();
    await waitFor(() => expect(screen.getByText('Test Skill')).toBeInTheDocument());
    fireEvent.click(screen.getByRole('button', { name: /upvote/i }));
    await waitFor(() => expect(mockToggleUpvote).toHaveBeenCalledWith('abc-uuid'));
  });

  it('calls toggleFavorite with the skillId when favorite is clicked', async () => {
    renderPage();
    await waitFor(() => expect(screen.getByText('Test Skill')).toBeInTheDocument());
    fireEvent.click(screen.getByRole('button', { name: /add to favorites/i }));
    await waitFor(() => expect(mockToggleFavorite).toHaveBeenCalledWith('abc-uuid'));
  });

  it('optimistically increments upvote count on click', async () => {
    renderPage();
    await waitFor(() => expect(screen.getByText('Test Skill')).toBeInTheDocument());
    const btn = screen.getByRole('button', { name: /upvote/i });
    expect(btn).toHaveTextContent('3');
    fireEvent.click(btn);
    // Optimistic increment
    expect(btn).toHaveTextContent('4');
    await waitFor(() => expect(mockToggleUpvote).toHaveBeenCalled());
  });
});
