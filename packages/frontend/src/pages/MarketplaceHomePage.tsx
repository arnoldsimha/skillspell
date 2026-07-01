import { useEffect, useState } from 'react';
import { Link } from 'react-router';
import { FireIcon, StarIcon } from '@heroicons/react/24/solid';
import { browseMarketplace, fetchFavorites, type MarketplaceListItem } from '../services/api/marketplace.js';
import { listCategories } from '../services/api/taxonomy.js';
import { MarketplaceTabBar } from '../components/marketplace/MarketplaceTabBar.js';
import MarketplaceSkillCard from '../components/marketplace/MarketplaceSkillCard.js';
import MarketplaceSkeletonCard from '../components/marketplace/MarketplaceSkeletonCard.js';

const SECTION_LIMIT = 6;

export default function MarketplaceHomePage() {
  const [popular, setPopular]                     = useState<MarketplaceListItem[]>([]);
  const [favorites, setFavorites]                 = useState<MarketplaceListItem[]>([]);
  const [totalFavorites, setTotalFavorites]       = useState(0);
  const [loadingPopular, setLoadingPopular]       = useState(true);
  const [loadingFavorites, setLoadingFavorites]   = useState(true);
  const [categoryMap, setCategoryMap]             = useState<Record<string, string>>({});

  useEffect(() => {
    listCategories()
      .then(cats => setCategoryMap(Object.fromEntries(cats.map(c => [c.slug, c.name]))))
      .catch(() => { /* silent — slugs shown as fallback */ });
  }, []);

  useEffect(() => {
    let cancelled = false;
    browseMarketplace({ sort: 'popular', limit: SECTION_LIMIT, page: 1 })
      .then(res => { if (!cancelled) setPopular(res.items); })
      .catch(() => { /* silent — empty state shown */ })
      .finally(() => { if (!cancelled) setLoadingPopular(false); });
    return () => { cancelled = true; };
  }, []);

  useEffect(() => {
    let cancelled = false;
    fetchFavorites({ limit: SECTION_LIMIT })
      .then(res => {
        if (!cancelled) {
          setFavorites(res.items);
          setTotalFavorites(res.total);
        }
      })
      .catch(() => { /* silent — empty state shown */ })
      .finally(() => { if (!cancelled) setLoadingFavorites(false); });
    return () => { cancelled = true; };
  }, []);


  return (
    <div className="flex flex-col">
      <MarketplaceTabBar />
      <div className="p-6 space-y-10">

        {/* Popular Skills */}
        <section>
          <h2 className="flex items-center gap-2 text-lg font-semibold text-slate-800 mb-4">
            <FireIcon className="h-5 w-5 text-orange-500" aria-hidden="true" />
            Popular Skills
          </h2>
          {loadingPopular ? (
            <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3">
              {Array.from({ length: SECTION_LIMIT }).map((_, i) => (
                <MarketplaceSkeletonCard key={i} />
              ))}
            </div>
          ) : popular.length === 0 ? (
            <p className="text-sm text-slate-500">No skills in the marketplace yet.</p>
          ) : (
            <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3">
              {popular.map(item => (
                <MarketplaceSkillCard key={item.skillId} item={item} categoryMap={categoryMap} />
              ))}
            </div>
          )}
        </section>

        {/* My Favorites */}
        <section>
          <div className="flex items-center justify-between mb-4">
            <h2 className="flex items-center gap-2 text-lg font-semibold text-slate-800">
              <StarIcon className="h-5 w-5 text-amber-400" aria-hidden="true" />
              My Favorites
            </h2>
            {totalFavorites > SECTION_LIMIT && (
              <Link to="/favorites" className="text-sm text-indigo-600 hover:underline">
                See all →
              </Link>
            )}
          </div>
          {loadingFavorites ? (
            <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3">
              {Array.from({ length: 3 }).map((_, i) => (
                <MarketplaceSkeletonCard key={i} />
              ))}
            </div>
          ) : favorites.length === 0 ? (
            <p className="text-sm text-slate-500">
              No favorites yet —{' '}
              <Link to="/browse" className="text-indigo-600 hover:underline">
                browse All Skills
              </Link>{' '}
              to save skills you want to return to.
            </p>
          ) : (
            <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3">
              {favorites.map(item => (
                <MarketplaceSkillCard key={item.skillId} item={item} categoryMap={categoryMap} />
              ))}
            </div>
          )}
        </section>

      </div>
    </div>
  );
}
