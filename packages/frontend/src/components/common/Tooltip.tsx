import type { ReactNode } from 'react';

interface TooltipProps {
  label: string;
  children: ReactNode;
}

/**
 * Lightweight hover tooltip. Wraps any element and shows a label above it on hover.
 * Uses CSS-only positioning — no portal needed for small inline elements.
 */
export function Tooltip({ label, children }: TooltipProps) {
  return (
    <span className="relative group/tip inline-flex">
      {children}
      <span
        role="tooltip"
        className="pointer-events-none absolute bottom-full left-1/2 -translate-x-1/2 mb-1.5 whitespace-nowrap rounded bg-slate-800 px-2 py-1 text-[10px] leading-none text-white opacity-0 transition-opacity duration-150 group-hover/tip:opacity-100 z-20"
      >
        {label}
      </span>
    </span>
  );
}
