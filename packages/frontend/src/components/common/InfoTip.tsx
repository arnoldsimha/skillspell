import { useState, useRef, useEffect, useCallback } from 'react';
import { createPortal } from 'react-dom';

interface InfoTipProps {
  text: string;
  /** Size of the ? icon in Tailwind h/w classes. Default: 'h-3.5 w-3.5' */
  size?: string;
}

/**
 * A small circled "?" icon that shows an explanatory tooltip on hover/click.
 * Tooltip is rendered via portal into document.body so it is never clipped
 * by parent overflow or stacking-context boundaries.
 */
export function InfoTip({ text, size = 'h-3.5 w-3.5' }: InfoTipProps) {
  const [isOpen, setIsOpen] = useState(false);
  const buttonRef = useRef<HTMLSpanElement>(null);
  const wrapperRef = useRef<HTMLSpanElement>(null);
  const [position, setPosition] = useState<{ top: number; left: number } | null>(null);

  // Recalculate position whenever tooltip opens
  const updatePosition = useCallback(() => {
    if (!buttonRef.current) return;
    const rect = buttonRef.current.getBoundingClientRect();
    const tooltipWidth = 256; // w-64 = 16rem = 256px
    let left = rect.left + rect.width / 2 - tooltipWidth / 2;

    // Clamp so the tooltip doesn't overflow viewport edges
    const margin = 8;
    if (left < margin) left = margin;
    if (left + tooltipWidth > window.innerWidth - margin) {
      left = window.innerWidth - margin - tooltipWidth;
    }

    setPosition({
      top: rect.top + window.scrollY,
      left: left + window.scrollX,
    });
  }, []);

  useEffect(() => {
    if (!isOpen) return;
    updatePosition();

    // Reposition on scroll/resize so the tooltip tracks the button
    const handleReposition = () => updatePosition();
    window.addEventListener('scroll', handleReposition, true);
    window.addEventListener('resize', handleReposition);
    return () => {
      window.removeEventListener('scroll', handleReposition, true);
      window.removeEventListener('resize', handleReposition);
    };
  }, [isOpen, updatePosition]);

  // Close when clicking outside
  useEffect(() => {
    if (!isOpen) return;
    const handler = (e: MouseEvent) => {
      if (wrapperRef.current && !wrapperRef.current.contains(e.target as Node)) {
        setIsOpen(false);
      }
    };
    document.addEventListener('mousedown', handler);
    return () => document.removeEventListener('mousedown', handler);
  }, [isOpen]);

  const tooltip =
    isOpen && position
      ? createPortal(
          <span
            className="fixed z-[9999] w-64 rounded-lg border border-slate-200 bg-white px-3 py-2 text-xs text-slate-600 shadow-lg leading-relaxed pointer-events-none"
            role="tooltip"
            style={{
              top: position.top - window.scrollY,
              left: position.left - window.scrollX,
              transform: 'translateY(calc(-100% - 8px))',
            }}
          >
            {text}
            {/* Arrow pointing down */}
            <span className="absolute top-full left-1/2 -translate-x-1/2 -mt-px border-4 border-transparent border-t-white" />
            <span className="absolute top-full left-1/2 -translate-x-1/2 border-4 border-transparent border-t-slate-200" />
          </span>,
          document.body,
        )
      : null;

  return (
    <span ref={wrapperRef} className="relative inline-flex items-center">
      <span
        ref={buttonRef}
        role="button"
        tabIndex={0}
        onClick={() => setIsOpen(!isOpen)}
        onKeyDown={(e) => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); setIsOpen(!isOpen); } }}
        onMouseEnter={() => setIsOpen(true)}
        onMouseLeave={() => setIsOpen(false)}
        className={`inline-flex items-center justify-center rounded-full border border-slate-300 bg-slate-100 text-slate-500 hover:bg-indigo-50 hover:border-indigo-300 hover:text-indigo-600 transition-all duration-150 font-bold leading-none cursor-pointer select-none ${size}`}
        aria-label="More info"
        style={{ fontSize: size === 'h-3 w-3' ? '7px' : '9px' }}
      >
        ?
      </span>
      {tooltip}
    </span>
  );
}
