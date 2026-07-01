import { useNavigate } from 'react-router';
import {
  ArrowDownTrayIcon,
  HandThumbUpIcon,
  StarIcon,
} from '@heroicons/react/24/outline';
import {
  HandThumbUpIcon as HandThumbUpSolidIcon,
  StarIcon as StarSolidIcon,
} from '@heroicons/react/24/solid';
import type { MarketplaceListItem } from '../../services/api/marketplace.js';
import { Tooltip } from '../common/Tooltip.js';
// IN-002: extracted custom hooks for the optimistic-update toggle pattern
import { useUpvoteToggle, useFavoriteToggle } from '../../hooks/useMarketplaceToggles.js';

const MAX_VISIBLE_CHIPS = 2;

interface MarketplaceSkillCardProps {
  item: MarketplaceListItem;
  categoryMap?: Record<string, string>; // slug → display name
}

export default function MarketplaceSkillCard({ item, categoryMap }: MarketplaceSkillCardProps) {
  const navigate = useNavigate();

  // IN-002: use extracted hooks for optimistic-update toggle pattern
  const { upvoteCount, isUpvoted, handleUpvote: toggleUpvoteState } = useUpvoteToggle(
    item.skillId,
    { upvoteCount: item.upvoteCount ?? 0, isUpvoted: item.isUpvoted ?? false },
  );
  const { isFavorited, handleFavorite: toggleFavoriteState } = useFavoriteToggle(
    item.skillId,
    item.isFavorited ?? false,
  );

  const handleUpvote = (e: React.MouseEvent) => {
    e.preventDefault();
    e.stopPropagation();
    void toggleUpvoteState();
  };

  const handleFavorite = (e: React.MouseEvent) => {
    e.preventDefault();
    e.stopPropagation();
    void toggleFavoriteState();
  };

  const visibleChips   = item.categories.slice(0, MAX_VISIBLE_CHIPS);
  const overflowCount  = item.categories.length - MAX_VISIBLE_CHIPS;

  return (
    <div className="group relative flex flex-col rounded-xl border border-slate-200 bg-white p-6 text-left shadow-sm hover:shadow-md hover:border-indigo-200 hover:bg-indigo-50/20 transition-all duration-200 w-full h-full">
      {/* Stretched button — covers the entire card for navigation */}
      <button
        type="button"
        onClick={() => navigate(`/marketplace/${item.skillId}`)}
        aria-label={`View ${item.name}`}
        className="absolute inset-0 rounded-xl focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-indigo-500 focus-visible:ring-offset-1"
      />

      {/* Header: name + version badge */}
      <div className="flex items-start justify-between gap-3">
        <h3 className="text-sm font-bold text-slate-800 group-hover:text-indigo-700 transition-colors leading-snug">
          {item.name}
        </h3>
        <span className="shrink-0 rounded-full bg-slate-100 px-2 py-0.5 text-[10px] font-medium text-slate-500">
          v{item.version}
        </span>
      </div>

      {/* Creator */}
      {item.submittedByName && (
        <p className="mt-1 text-[11px] text-slate-400">
          by <span className="font-medium text-slate-500">{item.submittedByName}</span>
        </p>
      )}

      {/* Description */}
      <p className="mt-2.5 text-xs leading-relaxed text-slate-500 line-clamp-3">
        {item.description}
      </p>

      {/* Footer: [↓ count] [👍 count] [★]  ·  [cat] [cat] [+N] */}
      <div className="relative z-10 mt-auto pt-4 flex items-center justify-between gap-2">
        {/* Left: engagement */}
        <div className="flex items-center gap-2">
          <span className="flex items-center gap-1.5 text-xs text-slate-400">
            <ArrowDownTrayIcon className="h-3.5 w-3.5" aria-hidden="true" />
            {item.downloadCount.toLocaleString()}
          </span>

          <Tooltip label="Upvote">
            <button
              type="button"
              aria-label={isUpvoted ? 'Upvote (active)' : 'Upvote'}
              onClick={handleUpvote}
              className={`flex items-center gap-1 rounded px-2 py-0.5 text-xs font-medium transition-colors hover:bg-slate-100 ${
                isUpvoted ? 'text-indigo-600' : 'text-slate-400'
              }`}
            >
              {isUpvoted
                ? <HandThumbUpSolidIcon className="h-3.5 w-3.5" aria-hidden="true" />
                : <HandThumbUpIcon className="h-3.5 w-3.5" aria-hidden="true" />
              }
              <span>{upvoteCount}</span>
            </button>
          </Tooltip>

          <Tooltip label={isFavorited ? 'Remove from favorites' : 'Add to favorites'}>
            <button
              type="button"
              aria-label={isFavorited ? 'Remove from favorites' : 'Add to favorites'}
              onClick={handleFavorite}
              className={`flex items-center justify-center rounded p-0.5 transition-colors hover:bg-slate-100 ${
                isFavorited ? 'text-amber-400' : 'text-slate-300 hover:text-amber-300'
              }`}
            >
              {isFavorited
                ? <StarSolidIcon className="h-3.5 w-3.5" aria-hidden="true" />
                : <StarIcon className="h-3.5 w-3.5" aria-hidden="true" />
              }
            </button>
          </Tooltip>
        </div>

        {/* Right: category chips */}
        {item.categories.length > 0 && (
          <div className="flex items-center gap-1">
            {visibleChips.map((slug) => (
              <span
                key={slug}
                className="inline-flex items-center rounded-full px-2 py-0.5 text-[10px] font-normal ring-1 ring-inset bg-indigo-50 text-indigo-700 ring-indigo-100"
              >
                {categoryMap?.[slug] ?? slug}
              </span>
            ))}
            {overflowCount > 0 && (
              <span className="inline-flex items-center rounded-full bg-slate-100 px-2 py-0.5 text-[10px] font-normal text-slate-500">
                +{overflowCount}
              </span>
            )}
          </div>
        )}
      </div>
    </div>
  );
}
