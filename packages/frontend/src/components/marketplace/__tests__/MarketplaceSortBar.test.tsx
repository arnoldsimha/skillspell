import { render, screen, fireEvent } from '@testing-library/react';
import { vi, describe, it, expect } from 'vitest';
import { MarketplaceSortBar } from '../MarketplaceSortBar.js';

describe('MarketplaceSortBar', () => {
  it('renders all five sort options', () => {
    render(<MarketplaceSortBar value="popular" onSort={() => {}} />);
    expect(screen.getByText('Popular')).toBeInTheDocument();
    expect(screen.getByText('Newest')).toBeInTheDocument();
    expect(screen.getByText('Most Downloaded')).toBeInTheDocument();
    expect(screen.getByText('Most Upvoted')).toBeInTheDocument();
    expect(screen.getByText('A to Z')).toBeInTheDocument();
  });

  it('marks the active sort option with aria-pressed=true', () => {
    render(<MarketplaceSortBar value="newest" onSort={() => {}} />);
    const activeButton = screen.getByText('Newest').closest('button');
    expect(activeButton).toHaveAttribute('aria-pressed', 'true');
  });

  it('marks inactive options with aria-pressed=false', () => {
    render(<MarketplaceSortBar value="newest" onSort={() => {}} />);
    const inactiveButton = screen.getByText('Popular').closest('button');
    expect(inactiveButton).toHaveAttribute('aria-pressed', 'false');
  });

  it('calls onSort with correct value when pill is clicked', () => {
    const onSort = vi.fn();
    render(<MarketplaceSortBar value="popular" onSort={onSort} />);
    fireEvent.click(screen.getByText('Newest'));
    expect(onSort).toHaveBeenCalledWith('newest');
  });
});
