import { useState, useRef, useEffect, useId } from 'react';

export interface MultiSelectOption {
  id: string;
  name: string;
}

interface MultiSelectComboboxProps {
  options: MultiSelectOption[];
  selected: MultiSelectOption[];
  onChange: (next: MultiSelectOption[]) => void;
  placeholder?: string;
  /** Optional chip style override. Default: indigo chip (bg-indigo-50 text-indigo-700 border-indigo-200). */
  chipClassName?: string;
}

/**
 * Searchable multi-select combobox with chip display.
 *
 * IMPORTANT: Dropdown dismissal uses document.addEventListener('mousedown', ...)
 * on the container ref — NOT a blur handler on the input. This matches the
 * DropdownMenu.tsx pattern and prevents option clicks from being swallowed
 * (Pitfall 4: blur fires before click in browser event order).
 *
 * Option buttons use onMouseDown + e.preventDefault() so that the input does not
 * lose focus before the selection is registered.
 */
export default function MultiSelectCombobox({
  options,
  selected,
  onChange,
  placeholder = 'Search...',
  chipClassName,
}: MultiSelectComboboxProps) {
  const [query, setQuery] = useState('');
  const [open, setOpen] = useState(false);
  const containerRef = useRef<HTMLDivElement>(null);
  const listboxIdSuffix = useId();
  const listboxId = `mscombo-listbox-${listboxIdSuffix}`;

  // Click-outside and Escape dismiss — MUST use mousedown on document, not a blur handler (Pitfall 4)
  useEffect(() => {
    if (!open) return;

    const handleClickOutside = (e: MouseEvent) => {
      if (containerRef.current && !containerRef.current.contains(e.target as Node)) {
        setOpen(false);
      }
    };

    const handleEscape = (e: KeyboardEvent) => {
      if (e.key === 'Escape') setOpen(false);
    };

    document.addEventListener('mousedown', handleClickOutside);
    document.addEventListener('keydown', handleEscape);
    return () => {
      document.removeEventListener('mousedown', handleClickOutside);
      document.removeEventListener('keydown', handleEscape);
    };
  }, [open]);

  const filtered = options.filter(
    (opt) =>
      !selected.some((s) => s.id === opt.id) &&
      opt.name.toLowerCase().includes(query.toLowerCase()),
  );

  const toggleOption = (option: MultiSelectOption) => {
    const isSelected = selected.some((s) => s.id === option.id);
    if (isSelected) {
      onChange(selected.filter((s) => s.id !== option.id));
    } else {
      onChange([...selected, option]);
      setQuery('');
    }
  };

  const defaultChipClass =
    'inline-flex items-center gap-1 rounded-full px-2 py-1 text-xs font-medium bg-indigo-50 text-indigo-700 border border-indigo-200';

  return (
    <div className="relative" ref={containerRef}>
      <input
        role="combobox"
        type="text"
        value={query}
        onChange={(e) => {
          setQuery(e.target.value);
          setOpen(true);
        }}
        onFocus={() => setOpen(true)}
        onClick={() => setOpen(true)}
        placeholder={placeholder}
        aria-haspopup="listbox"
        aria-expanded={open}
        aria-autocomplete="list"
        aria-controls={listboxId}
        aria-label={placeholder}
        className="w-full rounded-lg border border-slate-300 px-3 py-2 text-sm text-slate-800 placeholder:text-slate-400 focus:border-indigo-500 focus:outline-none focus:ring-1 focus:ring-indigo-500"
      />

      {open && (
        <div
          id={listboxId}
          role="listbox"
          className="absolute left-0 top-full z-20 mt-1 max-h-48 w-full overflow-y-auto rounded-xl border border-slate-200/80 bg-white py-1 shadow-xl animate-scale-in origin-top-left"
        >
          {filtered.length > 0 ? (
            filtered.map((option) => (
              <button
                key={option.id}
                type="button"
                role="option"
                aria-selected={false}
                // onMouseDown + preventDefault: fires before blur, so the dropdown
                // stays open just long enough to register the selection (Pitfall 4)
                onMouseDown={(e) => {
                  e.preventDefault();
                  toggleOption(option);
                }}
                className="flex w-full items-center gap-2 px-3.5 py-2 text-left text-sm text-slate-700 hover:bg-slate-50 transition-colors"
              >
                {option.name}
              </button>
            ))
          ) : query ? (
            <p className="px-4 py-3 text-center text-sm text-slate-400">
              No matches for &apos;{query}&apos;
            </p>
          ) : (
            <p className="px-4 py-3 text-center text-sm text-slate-400">
              No options available
            </p>
          )}
        </div>
      )}

      {/* Selected chips */}
      {selected.length > 0 && (
        <div className="mt-2 flex flex-wrap gap-1.5">
          {selected.map((item) => (
            <span key={item.id} className={chipClassName ?? defaultChipClass}>
              {item.name}
              <button
                type="button"
                onClick={() => toggleOption(item)}
                aria-label={`Remove ${item.name}`}
                className="ml-0.5 h-4 w-4 rounded-full opacity-60 hover:opacity-100 transition-opacity flex items-center justify-center"
              >
                <svg
                  className="h-3 w-3"
                  viewBox="0 0 12 12"
                  fill="none"
                  stroke="currentColor"
                  strokeWidth={2}
                >
                  <path d="M1 1l10 10M11 1L1 11" strokeLinecap="round" />
                </svg>
              </button>
            </span>
          ))}
        </div>
      )}
    </div>
  );
}
