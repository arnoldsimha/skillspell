import { render, screen, fireEvent } from '@testing-library/react';
import { vi, describe, it, expect } from 'vitest';
import { MarketplacePagination } from '../MarketplacePagination.js';

describe('MarketplacePagination', () => {
  it('disables Previous on page 1', () => {
    render(<MarketplacePagination page={1} total={90} limit={30} onPage={() => {}} />);
    expect(screen.getByText('Previous')).toBeDisabled();
  });

  it('disables Next on last page', () => {
    render(<MarketplacePagination page={3} total={90} limit={30} onPage={() => {}} />);
    expect(screen.getByText('Next')).toBeDisabled();
  });

  it('shows correct page info', () => {
    render(<MarketplacePagination page={2} total={90} limit={30} onPage={() => {}} />);
    expect(screen.getByText('Page 2 of 3')).toBeInTheDocument();
  });

  it('calls onPage with page-1 when Previous clicked', () => {
    const onPage = vi.fn();
    render(<MarketplacePagination page={2} total={90} limit={30} onPage={onPage} />);
    fireEvent.click(screen.getByText('Previous'));
    expect(onPage).toHaveBeenCalledWith(1);
  });

  it('calls onPage with page+1 when Next clicked', () => {
    const onPage = vi.fn();
    render(<MarketplacePagination page={2} total={90} limit={30} onPage={onPage} />);
    fireEvent.click(screen.getByText('Next'));
    expect(onPage).toHaveBeenCalledWith(3);
  });

  it('shows Page 1 of 1 when total is 0', () => {
    render(<MarketplacePagination page={1} total={0} limit={30} onPage={() => {}} />);
    expect(screen.getByText('Page 1 of 1')).toBeInTheDocument();
  });
});
