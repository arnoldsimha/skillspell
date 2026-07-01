import { render, screen } from '@testing-library/react';
import { MemoryRouter } from 'react-router';
import { MarketplaceTabBar } from '../MarketplaceTabBar.js';

describe('MarketplaceTabBar', () => {
  it('renders all three tabs', () => {
    render(
      <MemoryRouter initialEntries={['/']}>
        <MarketplaceTabBar />
      </MemoryRouter>,
    );
    expect(screen.getByText('Home')).toBeInTheDocument();
    expect(screen.getByText('All Skills')).toBeInTheDocument();
    expect(screen.getByText('My Favorites')).toBeInTheDocument();
  });

  it('marks Home as active when on /', () => {
    render(
      <MemoryRouter initialEntries={['/']}>
        <MarketplaceTabBar />
      </MemoryRouter>,
    );
    expect(screen.getByText('Home').closest('a')).toHaveAttribute('aria-current', 'page');
    expect(screen.getByText('All Skills').closest('a')).not.toHaveAttribute('aria-current');
  });

  it('marks All Skills as active when on /browse', () => {
    render(
      <MemoryRouter initialEntries={['/browse']}>
        <MarketplaceTabBar />
      </MemoryRouter>,
    );
    expect(screen.getByText('All Skills').closest('a')).toHaveAttribute('aria-current', 'page');
    expect(screen.getByText('Home').closest('a')).not.toHaveAttribute('aria-current');
  });

  it('marks All Skills as active on /browse?sort=newest', () => {
    render(
      <MemoryRouter initialEntries={['/browse?sort=newest']}>
        <MarketplaceTabBar />
      </MemoryRouter>,
    );
    expect(screen.getByText('All Skills').closest('a')).toHaveAttribute('aria-current', 'page');
  });

  it('marks My Favorites as active when on /favorites', () => {
    render(
      <MemoryRouter initialEntries={['/favorites']}>
        <MarketplaceTabBar />
      </MemoryRouter>,
    );
    expect(screen.getByText('My Favorites').closest('a')).toHaveAttribute('aria-current', 'page');
  });

  it('does not mark Home as active when on /browse', () => {
    render(
      <MemoryRouter initialEntries={['/browse']}>
        <MarketplaceTabBar />
      </MemoryRouter>,
    );
    expect(screen.getByText('Home').closest('a')).not.toHaveAttribute('aria-current');
  });
});
