import { useCallback, useEffect, useState } from 'react';
import { useSearchParams } from 'react-router';
import {
  browseMarketplace,
  type MarketplaceListItem,
} from '../services/api/marketplace.js';
import { listCategories, type Category } from '../services/api/taxonomy.js';
import { useToast } from '../components/common/ToastContext.js';
import MarketplaceGrid from '../components/marketplace/MarketplaceGrid.js';
import { MarketplaceSortBar } from '../components/marketplace/MarketplaceSortBar.js';
import { MarketplacePagination } from '../components/marketplace/MarketplacePagination.js';
import { MarketplaceTabBar } from '../components/marketplace/MarketplaceTabBar.js';

const LIMIT = 30;
type SortValue = 'popular' | 'newest' | 'downloads' | 'upvotes' | 'name';

export default function MarketplaceBrowsePage() {
  const { addToast } = useToast();
  const [searchParams, setSearchParams] = useSearchParams();

  // Data
  const [items, setItems]     = useState<MarketplaceListItem[]>([]);
  const [total, setTotal]     = useState(0);
  const [loading, setLoading] = useState(true);
  const [error, setError]     = useState(false);

  // Taxonomy (for filter sidebar)
  const [categories, setCategories] = useState<Category[]>([]);

  // Derive filter state from URL
  const sort        = (searchParams.get('sort') as SortValue) || 'popular';
  const appliedSearch = searchParams.get('search') || '';
  const appliedCategories = searchParams.getAll('category');
  const page = Math.max(1, parseInt(searchParams.get('page') || '1', 10));

  // Staged categories — updated on sidebar Apply click, not on every checkbox change
  const [pendingCategories, setPendingCategories] = useState<string[]>(appliedCategories);

  // Sync pending cats when URL cats change (e.g. back/forward navigation)
  const appliedCatsKey = appliedCategories.join(',');
  useEffect(() => {
    setPendingCategories(appliedCategories);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [appliedCatsKey]);

  const hasUnappliedChanges =
    JSON.stringify([...pendingCategories].sort()) !== JSON.stringify([...appliedCategories].sort());

  // Load taxonomy on mount
  useEffect(() => {
    let cancelled = false;
    listCategories()
      .then((cats) => {
        if (!cancelled) setCategories(cats);
      })
      .catch(() => {
        // Non-blocking — sidebar will show empty sections gracefully
      });
    return () => { cancelled = true; };
  }, []);

  // Fetch when URL params change
  useEffect(() => {
    let cancelled = false;
    setLoading(true);
    setError(false);
    browseMarketplace({
      search: appliedSearch || undefined,
      categories: appliedCategories.length > 0 ? appliedCategories : undefined,
      sort,
      page,
      limit: LIMIT,
    })
      .then((data) => {
        if (!cancelled) {
          setItems(data.items);
          setTotal(data.total);
        }
      })
      .catch(() => {
        if (!cancelled) {
          setError(true);
          addToast('error', 'Failed to load marketplace');
        }
      })
      .finally(() => {
        if (!cancelled) setLoading(false);
      });
    return () => { cancelled = true; };
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [appliedSearch, appliedCatsKey, sort, page, addToast]);

  const handleCategoryToggle = useCallback((slug: string) => {
    setPendingCategories((prev) =>
      prev.includes(slug) ? prev.filter((s) => s !== slug) : [...prev, slug],
    );
  }, []);

  const handleApplyFilters = useCallback(() => {
    setSearchParams((prev) => {
      const next = new URLSearchParams(prev);
      next.delete('category');
      pendingCategories.forEach((cat) => next.append('category', cat));
      next.delete('page');
      return next;
    }, { replace: true });
  }, [pendingCategories, setSearchParams]);

  const handleSortChange = useCallback((value: SortValue) => {
    setSearchParams((prev) => {
      const next = new URLSearchParams(prev);
      next.set('sort', value);
      next.delete('page');
      return next;
    }, { replace: true });
  }, [setSearchParams]);

  const handleSearchChange = useCallback((search: string) => {
    setSearchParams((prev) => {
      const next = new URLSearchParams(prev);
      if (search) {
        next.set('search', search);
      } else {
        next.delete('search');
      }
      next.delete('page');
      return next;
    }, { replace: true });
  }, [setSearchParams]);

  const handlePageChange = useCallback((newPage: number) => {
    setSearchParams((prev) => {
      const next = new URLSearchParams(prev);
      if (newPage <= 1) {
        next.delete('page');
      } else {
        next.set('page', String(newPage));
      }
      return next;
    }, { replace: true });
  }, [setSearchParams]);


  return (
    <div className="flex h-full flex-col">
      <MarketplaceTabBar />
      <div className="flex flex-1 min-h-0">
        <MarketplaceGrid
          items={items}
          total={total}
          loading={loading}
          error={error}
          page={page}
          limit={LIMIT}
          categories={categories}
          pendingCategories={pendingCategories}
          appliedCategories={appliedCategories}
          hasUnappliedChanges={hasUnappliedChanges}
          onCategoryToggle={handleCategoryToggle}
          onApply={handleApplyFilters}
          onPageChange={handlePageChange}
          onSearchChange={handleSearchChange}
          sortBar={<MarketplaceSortBar value={sort} onSort={handleSortChange} />}
          pagination={<MarketplacePagination page={page} total={total} limit={LIMIT} onPage={handlePageChange} />}
        />
      </div>
    </div>
  );
}
