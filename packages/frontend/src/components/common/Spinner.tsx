interface SpinnerProps {
  /** Visual size preset. Defaults to 'md'. */
  size?: 'sm' | 'md' | 'lg';
  className?: string;
}

const SIZES = {
  sm: 'h-5 w-5 border-2',
  md: 'h-10 w-10 border-[3px]',
  lg: 'h-14 w-14 border-[3px]',
} as const;

/**
 * Reusable animated spinner.
 * Uses the `animate-spin-ease` class defined in index.css.
 */
export default function Spinner({ size = 'md', className = '' }: SpinnerProps) {
  return (
    <div
      className={`${SIZES[size]} animate-spin-ease rounded-full border-indigo-200 border-t-indigo-600 ${className}`}
      role="status"
      aria-label="Loading"
    />
  );
}
