type SortValue = 'popular' | 'newest' | 'downloads' | 'upvotes' | 'name';

const SORT_OPTIONS: { value: SortValue; label: string }[] = [
  { value: 'popular',   label: 'Popular' },
  { value: 'newest',    label: 'Newest' },
  { value: 'downloads', label: 'Most Downloaded' },
  { value: 'upvotes',   label: 'Most Upvoted' },
  { value: 'name',      label: 'A to Z' },
];

interface Props {
  value: SortValue;
  onSort: (value: SortValue) => void;
}

export function MarketplaceSortBar({ value, onSort }: Props) {
  return (
    <div className="flex flex-wrap gap-2" role="group" aria-label="Sort skills">
      {SORT_OPTIONS.map(opt => (
        <button
          key={opt.value}
          type="button"
          aria-pressed={value === opt.value}
          onClick={() => onSort(opt.value)}
          className={`rounded-full px-3 py-1 text-sm font-medium transition-colors ${
            value === opt.value
              ? 'bg-indigo-600 text-white'
              : 'bg-slate-100 text-slate-600 hover:bg-slate-200'
          }`}
        >
          {opt.label}
        </button>
      ))}
    </div>
  );
}
