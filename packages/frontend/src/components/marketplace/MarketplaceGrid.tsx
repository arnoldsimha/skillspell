import { type ReactNode, useEffect, useRef, useState } from 'react';
import { BuildingStorefrontIcon, MagnifyingGlassIcon, XMarkIcon } from '@heroicons/react/24/outline';
import type { MarketplaceListItem } from '../../services/api/marketplace.js';
import type { Category } from '../../services/api/taxonomy.js';
import MarketplaceSkillCard from './MarketplaceSkillCard.js';
import MarketplaceSkeletonCard from './MarketplaceSkeletonCard.js';
import MarketplaceFilterSidebar from './MarketplaceFilterSidebar.js';

const SKELETON_COUNT = 6;
const DEBOUNCE_MS = 400;

interface MarketplaceGridProps {
  items: MarketplaceListItem[];
  total: number;
  loading: boolean;
  error: boolean;
  page: number;
  limit: number;
  categories: Category[];
  pendingCategories: string[];
  appliedCategories: string[];
  hasUnappliedChanges: boolean;
  onCategoryToggle: (slug: string) => void;
  onApply: () => void;
  onPageChange: (page: number) => void;
  onSearchChange: (search: string) => void;
  sortBar?: ReactNode;
  pagination?: ReactNode;
}

export default function MarketplaceGrid({
  items,
  total,
  loading,
  error,
  page,
  limit: _limit,
  categories,
  pendingCategories,
  appliedCategories,
  hasUnappliedChanges,
  onCategoryToggle,
  onApply,
  onPageChange: _onPageChange,
  onSearchChange,
  sortBar,
  pagination,
}: MarketplaceGridProps) {
  const categoryMap = Object.fromEntries(categories.map(c => [c.slug, c.name]));
  const [searchInput, setSearchInput] = useState('');
  const [sidebarCollapsed, setSidebarCollapsed] = useState(false);
  const debounceRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const scrollRef = useRef<HTMLDivElement>(null);

  // Scroll the skill list back to top when page changes
  useEffect(() => {
    scrollRef.current?.scrollTo({ top: 0 });
  }, [page]);

  function handleSearchChange(value: string) {
    setSearchInput(value);
    if (debounceRef.current) clearTimeout(debounceRef.current);
    debounceRef.current = setTimeout(() => {
      onSearchChange(value);  // D-05: 400ms debounce; fires independently of Apply
    }, DEBOUNCE_MS);
  }

  // Use applied (query-driving) state so the empty message matches what actually filtered the results
  const isFiltered = searchInput.length > 0 || appliedCategories.length > 0;

  return (
    <div className="flex h-full w-full flex-col">
      {/* Full-width page header — title only, spans above the sidebar/content split */}
      <div
        data-testid="page-header"
        className="shrink-0 border-b border-slate-200 bg-white px-6 py-5"
      >
        <div className="flex items-center justify-between gap-4">
          <div>
            <h1 className="text-xl font-semibold text-slate-800">Marketplace</h1>
            <p className="mt-0.5 text-sm text-slate-500">Browse your org's approved skills</p>
          </div>
          {!loading && total > 0 && (
            <span className="text-sm text-slate-400">{total} skill{total === 1 ? '' : 's'}</span>
          )}
        </div>
      </div>

      {/* Two-column body: sidebar + content */}
      <div className="flex flex-1 overflow-hidden">
        {/* Filter sidebar (D-01: categories in sidebar) */}
        <MarketplaceFilterSidebar
          categories={categories}
          pendingCategories={pendingCategories}
          onCategoryToggle={onCategoryToggle}
          onApply={onApply}
          hasUnappliedChanges={hasUnappliedChanges}
          isCollapsed={sidebarCollapsed}
          onToggleCollapsed={() => setSidebarCollapsed(v => !v)}
        />

        {/* Main content: search + sort bar + grid + pagination (D-02) */}
        <div className="flex flex-1 flex-col overflow-hidden">
          {/* Search bar — stays in content column, just below the full-width header */}
          <div className="shrink-0 border-b border-slate-200 bg-white px-6 py-4">
            <div className="relative max-w-lg">
              <MagnifyingGlassIcon
                className="absolute left-3.5 top-1/2 -translate-y-1/2 h-4 w-4 text-slate-400"
                aria-hidden="true"
              />
              <input
                type="text"
                placeholder="Search skills..."
                value={searchInput}
                onChange={(e) => handleSearchChange(e.target.value)}
                aria-label="Search marketplace skills"
                className="w-full rounded-xl border border-slate-200 bg-slate-50 py-2.5 pl-10 pr-4 text-sm text-slate-700 placeholder:text-slate-400 focus:border-indigo-400 focus:bg-white focus:outline-none focus:ring-2 focus:ring-indigo-500/20 transition-all duration-200"
              />
              {searchInput && (
                <button
                  type="button"
                  onClick={() => handleSearchChange('')}
                  aria-label="Clear search"
                  className="absolute right-3 top-1/2 -translate-y-1/2 text-slate-400 hover:text-slate-600"
                >
                  <XMarkIcon className="h-4 w-4" aria-hidden="true" />
                </button>
              )}
            </div>
          </div>

          {/* Sort bar */}
          {sortBar && (
            <div className="shrink-0 border-b border-slate-100 bg-white px-6 py-3">
              {sortBar}
            </div>
          )}

          {/* Grid scroll region */}
          <div ref={scrollRef} className="flex-1 overflow-y-auto px-6 py-6">
            {/* Error state */}
            {error && !loading && (
              <div className="rounded-xl border border-red-200 bg-red-50 p-4 text-sm text-red-700">
                Failed to load marketplace. Refresh the page to try again.
              </div>
            )}

            {/* Loading: skeleton cards */}
            {loading && (
              <div
                className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3"
                aria-label="Loading marketplace skills"
                aria-busy="true"
              >
                {Array.from({ length: SKELETON_COUNT }).map((_, i) => (
                  <MarketplaceSkeletonCard key={i} />
                ))}
              </div>
            )}

            {/* Loaded: items or empty state */}
            {!loading && !error && (
              <>
                {items.length === 0 ? (
                  <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3" role="status">
                    <div className="col-span-full flex flex-col items-center justify-center py-20 text-center animate-fade-in-up">
                      <div className="flex h-16 w-16 items-center justify-center rounded-2xl bg-slate-100 mb-4">
                        <BuildingStorefrontIcon className="h-8 w-8 text-slate-400" aria-hidden="true" />
                      </div>
                      {isFiltered ? (
                        <>
                          <p className="text-lg font-semibold text-slate-600">No skills found</p>
                          <p className="mt-1 text-sm text-slate-400">Try adjusting your search or clearing the filters.</p>
                        </>
                      ) : (
                        <>
                          <p className="text-lg font-semibold text-slate-600">No skills in the marketplace yet</p>
                          <p className="mt-1 text-sm text-slate-400">Approved skills from your org will appear here. Ask your admin to approve submissions.</p>
                        </>
                      )}
                    </div>
                  </div>
                ) : (
                  <>
                    <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3">
                      {items.map((item) => (
                        <MarketplaceSkillCard
                          key={item.skillId}
                          item={item}
                          categoryMap={categoryMap}
                        />
                      ))}
                    </div>
                    {pagination}
                  </>
                )}
              </>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}
