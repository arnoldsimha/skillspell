import { render, screen, fireEvent } from '@testing-library/react';
import { vi, describe, it, expect, beforeEach } from 'vitest';
import TopBar from '../TopBar';

const mockNavigate = vi.fn();
let mockPathname = '/';

vi.mock('react-router', () => ({
  useNavigate: () => mockNavigate,
  useLocation: () => ({ pathname: mockPathname }),
}));

// UserMenu makes auth API calls — stub it out
vi.mock('../UserMenu', () => ({
  default: () => <div data-testid="user-menu" />,
}));

let mockMarketplaceEnabled = true;
vi.mock('../../../hooks/useAuth.js', () => ({
  useAuth: () => ({ organization: { marketplaceEnabled: mockMarketplaceEnabled } }),
}));

const defaultProps = {
  onCreateNew: vi.fn(),
  onTitleClick: vi.fn(),
  onNavigateProfile: vi.fn(),
  onNavigateOrgSettings: vi.fn(),
};

describe('TopBar', () => {
  beforeEach(() => {
    mockPathname = '/';
    mockMarketplaceEnabled = true;
    vi.clearAllMocks();
  });

  it('renders the three nav links and the Create button', () => {
    render(<TopBar {...defaultProps} />);
    expect(screen.getByRole('button', { name: /marketplace/i })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: /my skills/i })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: /my submissions/i })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: /create.*skill/i })).toBeInTheDocument();
  });

  it('hides Marketplace and My Submissions when marketplace disabled', () => {
    mockMarketplaceEnabled = false;
    render(<TopBar {...defaultProps} />);
    expect(screen.queryByRole('button', { name: /marketplace/i })).not.toBeInTheDocument();
    expect(screen.queryByRole('button', { name: /my submissions/i })).not.toBeInTheDocument();
    expect(screen.getByRole('button', { name: /my skills/i })).toBeInTheDocument();
  });

  it('applies active class to Marketplace when pathname is /', () => {
    render(<TopBar {...defaultProps} />);
    expect(screen.getByRole('button', { name: /marketplace/i })).toHaveClass('bg-indigo-500/15');
  });

  it('applies active class to Marketplace when pathname starts with /browse', () => {
    mockPathname = '/browse';
    render(<TopBar {...defaultProps} />);
    expect(screen.getByRole('button', { name: /marketplace/i })).toHaveClass('bg-indigo-500/15');
  });

  it('applies active class to My Skills when pathname starts with /skills', () => {
    mockPathname = '/skills';
    render(<TopBar {...defaultProps} />);
    expect(screen.getByRole('button', { name: /my skills/i })).toHaveClass('bg-indigo-500/15');
  });

  it('applies active class to My Submissions on its route', () => {
    mockPathname = '/marketplace/my-submissions';
    render(<TopBar {...defaultProps} />);
    expect(screen.getByRole('button', { name: /my submissions/i })).toHaveClass('bg-indigo-500/15');
  });

  it('navigates to / when Marketplace is clicked', () => {
    mockPathname = '/skills';
    render(<TopBar {...defaultProps} />);
    fireEvent.click(screen.getByRole('button', { name: /marketplace/i }));
    expect(mockNavigate).toHaveBeenCalledWith('/');
  });

  it('navigates to /skills when My Skills is clicked', () => {
    render(<TopBar {...defaultProps} />);
    fireEvent.click(screen.getByRole('button', { name: /my skills/i }));
    expect(mockNavigate).toHaveBeenCalledWith('/skills');
  });

  it('navigates to /marketplace/my-submissions when My Submissions is clicked', () => {
    render(<TopBar {...defaultProps} />);
    fireEvent.click(screen.getByRole('button', { name: /my submissions/i }));
    expect(mockNavigate).toHaveBeenCalledWith('/marketplace/my-submissions');
  });

  it('calls onCreateNew when the Create button is clicked', () => {
    render(<TopBar {...defaultProps} />);
    fireEvent.click(screen.getByRole('button', { name: /create.*skill/i }));
    expect(defaultProps.onCreateNew).toHaveBeenCalledOnce();
  });

  it('toggles the mobile nav dropdown via the hamburger', () => {
    render(<TopBar {...defaultProps} />);
    // Mobile dropdown links are not present until hamburger is clicked
    const hamburger = screen.getByRole('button', { name: /open navigation/i });
    fireEvent.click(hamburger);
    // Two instances now exist (desktop inline + mobile dropdown) — at least one My Skills in the dropdown
    expect(screen.getAllByRole('button', { name: /my skills/i }).length).toBeGreaterThan(1);
  });

  it('applies active class to Marketplace when pathname starts with /favorites', () => {
    mockPathname = '/favorites';
    render(<TopBar {...defaultProps} />);
    expect(screen.getByRole('button', { name: /marketplace/i })).toHaveClass('bg-indigo-500/15');
  });

  it('closes the mobile nav dropdown on Escape', () => {
    render(<TopBar {...defaultProps} />);
    fireEvent.click(screen.getByRole('button', { name: /open navigation/i }));
    expect(screen.getAllByRole('button', { name: /my skills/i }).length).toBeGreaterThan(1);
    fireEvent.keyDown(document, { key: 'Escape' });
    expect(screen.getAllByRole('button', { name: /my skills/i }).length).toBe(1);
  });
});
