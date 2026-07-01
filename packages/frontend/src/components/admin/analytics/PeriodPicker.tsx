import { useState, useRef, useEffect } from 'react';
import type { AnalyticsPeriod } from '../../../services/api/analytics.js';
import { useUserPreferences } from '../../../hooks/useUserPreferences.js';
import { formatDateWithPrefs } from '../../../utils/formatDate.js';

interface PeriodPickerProps {
  value: AnalyticsPeriod;
  customFrom: string;
  customTo: string;
  onChange: (period: AnalyticsPeriod, from?: string, to?: string) => void;
}

const PRESETS: { label: string; value: Exclude<AnalyticsPeriod, 'custom'> }[] = [
  { label: '7d', value: '7d' },
  { label: '30d', value: '30d' },
  { label: '90d', value: '90d' },
];

export default function PeriodPicker({ value, customFrom, customTo, onChange }: PeriodPickerProps) {
  const { prefs } = useUserPreferences();
  const [open, setOpen] = useState(false);
  const [localFrom, setLocalFrom] = useState(customFrom);
  const [localTo, setLocalTo] = useState(customTo);
  const dropdownRef = useRef<HTMLDivElement>(null);

  // Close on outside click
  useEffect(() => {
    if (!open) return;
    function handleClick(e: MouseEvent) {
      if (dropdownRef.current && !dropdownRef.current.contains(e.target as Node)) {
        setOpen(false);
      }
    }
    document.addEventListener('mousedown', handleClick);
    return () => document.removeEventListener('mousedown', handleClick);
  }, [open]);

  // Sync local state when parent resets custom range
  useEffect(() => {
    setLocalFrom(customFrom);
    setLocalTo(customTo);
  }, [customFrom, customTo]);

  function handlePreset(preset: Exclude<AnalyticsPeriod, 'custom'>) {
    setOpen(false);
    onChange(preset);
  }

  function handleApply() {
    if (!localFrom || !localTo || localFrom >= localTo) return;
    const diffDays = (new Date(localTo).getTime() - new Date(localFrom).getTime()) / 86400000;
    if (diffDays > 365) return;
    setOpen(false);
    onChange('custom', localFrom, localTo);
  }

  const isApplyDisabled =
    !localFrom ||
    !localTo ||
    localFrom >= localTo ||
    (new Date(localTo).getTime() - new Date(localFrom).getTime()) / 86400000 > 365;

  const customLabel = value === 'custom' && customFrom && customTo
    ? `${formatDateWithPrefs(customFrom, prefs)} – ${formatDateWithPrefs(customTo, prefs)}`
    : 'Custom';

  return (
    <div className="relative" ref={dropdownRef}>
      {/* Pill tab bar */}
      <div className="flex gap-0.5 bg-slate-100 rounded-lg p-0.5">
        {PRESETS.map(p => (
          <button
            key={p.value}
            type="button"
            onClick={() => handlePreset(p.value)}
            className={`px-3 py-1.5 text-sm font-medium rounded-md transition-colors ${
              value === p.value
                ? 'bg-white text-indigo-600 shadow-sm'
                : 'text-slate-500 hover:text-slate-700'
            }`}
          >
            {p.label}
          </button>
        ))}
        <button
          type="button"
          onClick={() => setOpen(prev => !prev)}
          className={`px-3 py-1.5 text-sm font-medium rounded-md transition-colors flex items-center gap-1.5 ${
            value === 'custom' || open
              ? 'bg-white text-indigo-600 shadow-sm'
              : 'text-slate-500 hover:text-slate-700'
          }`}
        >
          {customLabel}
          <svg
            className={`h-3 w-3 transition-transform ${open ? 'rotate-180' : ''}`}
            xmlns="http://www.w3.org/2000/svg"
            fill="none"
            viewBox="0 0 24 24"
            strokeWidth={2.5}
            stroke="currentColor"
            aria-hidden="true"
          >
            <path strokeLinecap="round" strokeLinejoin="round" d="M19.5 8.25l-7.5 7.5-7.5-7.5" />
          </svg>
        </button>
      </div>

      {/* Dropdown panel */}
      {open && (
        <div className="absolute right-0 top-full mt-2 z-20 w-72 rounded-xl border border-slate-200 bg-white shadow-lg p-4">
          <p className="text-xs font-semibold uppercase tracking-widest text-slate-500 mb-3">Custom range</p>

          <div className="space-y-3">
            <div>
              <label className="block text-xs font-medium text-slate-600 mb-1" htmlFor="analytics-from">
                From
              </label>
              <input
                id="analytics-from"
                type="date"
                value={localFrom}
                onChange={e => setLocalFrom(e.target.value)}
                max={localTo || undefined}
                className="w-full rounded-lg border border-slate-200 bg-slate-50 px-3 py-2 text-sm text-slate-700 focus:border-indigo-400 focus:bg-white focus:outline-none focus:ring-2 focus:ring-indigo-500/20 transition-all"
              />
            </div>

            <div>
              <label className="block text-xs font-medium text-slate-600 mb-1" htmlFor="analytics-to">
                To
              </label>
              <input
                id="analytics-to"
                type="date"
                value={localTo}
                onChange={e => setLocalTo(e.target.value)}
                min={localFrom || undefined}
                className="w-full rounded-lg border border-slate-200 bg-slate-50 px-3 py-2 text-sm text-slate-700 focus:border-indigo-400 focus:bg-white focus:outline-none focus:ring-2 focus:ring-indigo-500/20 transition-all"
              />
            </div>
          </div>

          {localFrom && localTo && localFrom < localTo &&
            (new Date(localTo).getTime() - new Date(localFrom).getTime()) / 86400000 > 365 && (
            <p className="mt-2 text-xs text-red-500">Range cannot exceed 365 days.</p>
          )}

          <button
            type="button"
            onClick={handleApply}
            disabled={isApplyDisabled}
            className="mt-4 w-full rounded-lg bg-indigo-600 px-4 py-2 text-sm font-medium text-white transition-colors hover:bg-indigo-700 disabled:opacity-40 disabled:cursor-not-allowed"
          >
            Apply
          </button>
        </div>
      )}
    </div>
  );
}
