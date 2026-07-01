import { render, screen } from '@testing-library/react';
import { vi, describe, it, expect, beforeEach } from 'vitest';
import MarketplaceGrid from '../MarketplaceGrid.js';

vi.mock('react-router', () => ({ useNavigate: () => vi.fn() }));
vi.mock('../../common/ToastContext.js', () => ({ useToast: () => ({ addToast: vi.fn() }) }));
vi.mock('../../../services/api/marketplace.js', () => ({
  toggleUpvote: vi.fn(),
  toggleFavorite: vi.fn(),
}));
vi.mock('../../export/ExportDialog.js', () => ({ default: () => <div /> }));

const defaultProps = {
  items: [],
  total: 0,
  loading: false,
  error: false,
  page: 1,
  limit: 30,
  categories: [],
  pendingCategories: [],
  appliedCategories: [],
  hasUnappliedChanges: false,
  onCategoryToggle: vi.fn(),
  onApply: vi.fn(),
  onPageChange: vi.fn(),
  onSearchChange: vi.fn(),
};

describe('MarketplaceGrid header hierarchy', () => {
  beforeEach(() => {
    // Mock HTMLDivElement.prototype.scrollTo to avoid "scrollTo is not a function" errors in tests
    HTMLDivElement.prototype.scrollTo = vi.fn();
    vi.clearAllMocks();
  });

  it('renders the page title outside the sidebar container', () => {
    render(<MarketplaceGrid {...defaultProps} />);

    const heading = screen.getByRole('heading', { name: 'Marketplace' });
    const sidebar = screen.getByTestId('filter-sidebar');

    // heading must NOT be a descendant of the sidebar's parent column
    expect(sidebar.contains(heading)).toBe(false);

    // heading's closest section ancestor must NOT contain the sidebar
    const headerSection = heading.closest('[data-testid="page-header"]');
    expect(headerSection).not.toBeNull();
    expect(headerSection!.contains(sidebar)).toBe(false);
  });

  it('shows skill count in the full-width header when total > 0', () => {
    render(<MarketplaceGrid {...defaultProps} total={5} />);
    const header = screen.getByTestId('page-header');
    expect(header).toHaveTextContent('5 skills');
  });
});
