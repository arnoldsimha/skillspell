import { useEffect, useState } from 'react';
import { Link, useSearchParams } from 'react-router';
import { StarIcon } from '@heroicons/react/24/solid';
import type { MarketplaceListItem } from '../services/api/marketplace.js';
import { fetchFavorites } from '../services/api/marketplace.js';
import { listCategories } from '../services/api/taxonomy.js';
import { MarketplaceTabBar } from '../components/marketplace/MarketplaceTabBar.js';
import MarketplaceSkillCard from '../components/marketplace/MarketplaceSkillCard.js';
import { MarketplacePagination } from '../components/marketplace/MarketplacePagination.js';
import MarketplaceSkeletonCard from '../components/marketplace/MarketplaceSkeletonCard.js';

const LIMIT = 30;

export default function MarketplaceFavoritesPage() {
  const [searchParams, setSearchParams] = useSearchParams();
  const page = Math.max(1, parseInt(searchParams.get('page') || '1', 10));

  const [items, setItems]         = useState<MarketplaceListItem[]>([]);
  const [total, setTotal]         = useState(0);
  const [loading, setLoading]     = useState(true);
  const [error, setError]         = useState(false);
  const [categoryMap, setCategoryMap] = useState<Record<string, string>>({});

  useEffect(() => {
    listCategories()
      .then(cats => setCategoryMap(Object.fromEntries(cats.map(c => [c.slug, c.name]))))
      .catch(() => { /* silent — slugs shown as fallback */ });
  }, []);

  useEffect(() => {
    let cancelled = false;
    setLoading(true);
    setError(false);
    fetchFavorites({ limit: LIMIT, page })
      .then(res => {
        if (!cancelled) {
          setItems(res.items);
          setTotal(res.total);
        }
      })
      // WR-010: surface fetch errors so user sees an error state instead of the
      // misleading "You haven't favorited any skills yet" empty-state message.
      .catch(() => { if (!cancelled) setError(true); })
      .finally(() => { if (!cancelled) setLoading(false); });
    return () => { cancelled = true; };
  }, [page]);

  const handlePage = (newPage: number) => {
    setSearchParams(prev => {
      const next = new URLSearchParams(prev);
      if (newPage <= 1) {
        next.delete('page');
      } else {
        next.set('page', String(newPage));
      }
      return next;
    }, { replace: true });
  };


  return (
    <div className="flex flex-col">
      <MarketplaceTabBar />
      <div className="p-6">
        <h1 className="flex items-center gap-2 text-xl font-semibold text-slate-800 mb-6">
          <StarIcon className="h-5 w-5 text-amber-400" aria-hidden="true" />
          My Favorites
        </h1>
        {loading ? (
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
            {Array.from({ length: 6 }).map((_, i) => <MarketplaceSkeletonCard key={i} />)}
          </div>
        ) : error ? (
          <p className="text-sm text-red-600">
            Failed to load your favorites. Please refresh the page and try again.
          </p>
        ) : items.length === 0 ? (
          <p className="text-sm text-slate-500">
            You haven&apos;t favorited any skills yet.{' '}
            <Link to="/browse" className="text-indigo-600 hover:underline">
              Browse All Skills
            </Link>{' '}
            to get started.
          </p>
        ) : (
          <>
            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
              {items.map(item => (
                <MarketplaceSkillCard
                  key={item.skillId}
                  item={item}
                  categoryMap={categoryMap}
                />
              ))}
            </div>
            <MarketplacePagination
              page={page}
              total={total}
              limit={LIMIT}
              onPage={handlePage}
            />
          </>
        )}
      </div>
    </div>
  );
}
