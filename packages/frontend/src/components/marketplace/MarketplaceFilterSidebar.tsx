import { ChevronLeftIcon, ChevronRightIcon } from '@heroicons/react/24/outline';
import type { Category } from '../../services/api/taxonomy.js';
import { Button } from '../common/Button.js';

interface MarketplaceFilterSidebarProps {
  categories: Category[];
  pendingCategories: string[];   // slugs
  onCategoryToggle: (slug: string) => void;
  onApply: () => void;
  hasUnappliedChanges: boolean;
  isCollapsed: boolean;
  onToggleCollapsed: () => void;
}

export default function MarketplaceFilterSidebar({
  categories,
  pendingCategories,
  onCategoryToggle,
  onApply,
  hasUnappliedChanges,
  isCollapsed,
  onToggleCollapsed,
}: MarketplaceFilterSidebarProps) {
  return (
    <div
      data-testid="filter-sidebar"
      className={`shrink-0 border-r border-slate-200 bg-white flex flex-col overflow-hidden transition-all duration-200 ${isCollapsed ? 'w-10' : 'w-48'}`}
    >
      {isCollapsed ? (
        /* Collapsed strip — just the toggle button */
        <div className="flex flex-col items-center pt-4">
          <button
            type="button"
            onClick={onToggleCollapsed}
            aria-label="Expand filters"
            title="Expand filters"
            className="flex h-7 w-7 items-center justify-center rounded-md text-slate-400 hover:bg-slate-100 hover:text-slate-600 transition-colors"
          >
            <ChevronRightIcon className="h-4 w-4" aria-hidden="true" />
          </button>
          {hasUnappliedChanges && (
            <span className="mt-2 h-2 w-2 rounded-full bg-indigo-500" aria-label="Unapplied filter changes" />
          )}
        </div>
      ) : (
        <>
          {/* Sidebar heading with collapse toggle */}
          <div className="flex items-center justify-between px-4 py-5 border-b border-slate-100">
            <h2 className="text-sm font-semibold text-slate-700">Filters</h2>
            <button
              type="button"
              onClick={onToggleCollapsed}
              aria-label="Collapse filters"
              title="Collapse filters"
              className="flex h-7 w-7 items-center justify-center rounded-md text-slate-400 hover:bg-slate-100 hover:text-slate-600 transition-colors"
            >
              <ChevronLeftIcon className="h-4 w-4" aria-hidden="true" />
            </button>
          </div>

          {/* Scrollable filter content */}
          <div className="flex-1 overflow-y-auto pb-4">
            {/* Categories section */}
            <div>
              <p className="text-xs font-semibold uppercase tracking-widest text-slate-500 px-4 pt-4 pb-2">
                Categories
              </p>
              {categories.length === 0 ? (
                <p className="px-4 text-xs text-slate-400">No categories defined</p>
              ) : (
                <ul>
                  {categories.map((cat) => (
                    <li key={cat.id}>
                      <label
                        htmlFor={`cat-${cat.id}`}
                        className="flex items-center gap-2 px-4 py-2 hover:bg-slate-50 rounded-lg cursor-pointer"
                      >
                        <input
                          id={`cat-${cat.id}`}
                          type="checkbox"
                          value={cat.slug}
                          checked={pendingCategories.includes(cat.slug)}
                          onChange={() => onCategoryToggle(cat.slug)}
                          className="h-4 w-4 rounded border-slate-300 accent-indigo-500"
                        />
                        <span className="text-sm text-slate-700 select-none flex-1">{cat.name}</span>
                      </label>
                    </li>
                  ))}
                </ul>
              )}
            </div>
          </div>

          {/* Sticky Apply button at bottom (D-04) */}
          <div className="sticky bottom-0 bg-white border-t border-slate-100 p-4">
            <Button
              type="button"
              onClick={onApply}
              disabled={!hasUnappliedChanges}
              variant="primary"
              size="md"
              className="relative w-full"
            >
              {/* Pending indicator dot — visible when hasUnappliedChanges */}
              {hasUnappliedChanges && (
                <span className="absolute -top-1 -right-1 h-2 w-2 rounded-full bg-indigo-500" aria-hidden="true" />
              )}
              Apply Filters
            </Button>
          </div>
        </>
      )}
    </div>
  );
}
