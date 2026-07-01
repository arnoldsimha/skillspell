import { useState, useRef, useEffect } from 'react';

export interface DropdownMenuItem {
  label: string;
  icon?: React.ReactNode;
  onClick: () => void;
  danger?: boolean;
  disabled?: boolean;
  disabledReason?: string;
}

export interface DropdownMenuDivider {
  divider: true;
}

export type DropdownMenuEntry = DropdownMenuItem | DropdownMenuDivider;

function isDivider(entry: DropdownMenuEntry): entry is DropdownMenuDivider {
  return 'divider' in entry && entry.divider === true;
}

interface DropdownMenuProps {
  items: DropdownMenuEntry[];
  /** Optional custom trigger element. Defaults to a ⋯ icon button. */
  trigger?: React.ReactNode;
}

/**
 * A generic dropdown menu triggered by a button.
 * Closes on click-outside or Escape key.
 */
export default function DropdownMenu({ items, trigger }: DropdownMenuProps) {
  const [open, setOpen] = useState(false);
  const containerRef = useRef<HTMLDivElement>(null);

  // Close on click outside
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

  return (
    <div className="relative" ref={containerRef}>
      {/* Trigger */}
      <button
        onClick={() => setOpen((prev) => !prev)}
        className="flex h-9 w-9 items-center justify-center rounded-xl text-slate-500 hover:bg-slate-100 hover:text-slate-700 transition-all duration-200"
        aria-label="More actions"
        aria-expanded={open}
        aria-haspopup="menu"
      >
        {trigger ?? (
          <svg className="h-5 w-5" fill="none" viewBox="0 0 24 24" strokeWidth={2} stroke="currentColor">
            <path strokeLinecap="round" strokeLinejoin="round" d="M6.75 12a.75.75 0 1 1-1.5 0 .75.75 0 0 1 1.5 0ZM12.75 12a.75.75 0 1 1-1.5 0 .75.75 0 0 1 1.5 0ZM18.75 12a.75.75 0 1 1-1.5 0 .75.75 0 0 1 1.5 0Z" />
          </svg>
        )}
      </button>

      {/* Dropdown */}
      {open && (
        <div
          role="menu"
          className="absolute right-0 top-full z-50 mt-1.5 min-w-[180px] rounded-xl border border-slate-200/80 bg-white py-1.5 shadow-xl shadow-slate-200/50 animate-scale-in origin-top-right"
        >
          {items.map((entry, i) => {
            if (isDivider(entry)) {
              return <div key={`divider-${i}`} className="my-1.5 border-t border-slate-100" />;
            }

            return (
              <button
                key={entry.label}
                role="menuitem"
                disabled={entry.disabled}
                title={entry.disabled ? entry.disabledReason : undefined}
                onClick={() => {
                  if (entry.disabled) return;
                  setOpen(false);
                  entry.onClick();
                }}
                className={`flex w-full items-center gap-2.5 px-3.5 py-2 text-left text-sm font-medium transition-all duration-150 ${
                  entry.disabled
                    ? 'text-slate-400 cursor-not-allowed'
                    : entry.danger
                      ? 'text-red-600 hover:bg-red-50'
                      : 'text-slate-700 hover:bg-slate-50'
                }`}
              >
                {entry.icon && <span className="shrink-0">{entry.icon}</span>}
                {entry.label}
              </button>
            );
          })}
        </div>
      )}
    </div>
  );
}
