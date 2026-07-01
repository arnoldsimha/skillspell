import { useState } from 'react';
import type { SecretFinding } from '../../utils/secretScanner.js';

interface SecretWarningBannerProps {
  findings: SecretFinding[];
  className?: string;
  onDismiss: () => void;
}

export default function SecretWarningBanner({ findings, className = '', onDismiss }: SecretWarningBannerProps) {
  const [expanded, setExpanded] = useState(true);

  if (findings.length === 0) return null;

  return (
    <div className={`rounded-xl border-2 border-orange-400 bg-orange-50 p-4 shadow-md shadow-orange-100 animate-fade-in-up ${className}`}>
      <div className="flex items-start gap-3">
        {/* Warning icon — orange */}
        <svg className="h-5 w-5 text-orange-500 shrink-0 mt-0.5" fill="none" viewBox="0 0 24 24" strokeWidth={2} stroke="currentColor">
          <path strokeLinecap="round" strokeLinejoin="round" d="M12 9v3.75m-9.303 3.376c-.866 1.5.217 3.374 1.948 3.374h14.71c1.73 0 2.813-1.874 1.948-3.374L13.949 3.378c-.866-1.5-3.032-1.5-3.898 0L2.697 16.126Z" />
        </svg>
        <div className="flex-1 min-w-0">
          <div className="flex items-center justify-between gap-2">
            <p className="text-sm font-bold text-orange-900">
              {findings.length} potential secret{findings.length !== 1 ? 's' : ''} detected
            </p>
            <div className="flex items-center gap-2 shrink-0">
              <button
                type="button"
                onClick={() => setExpanded((v) => !v)}
                className="text-xs text-orange-600 hover:text-orange-800 transition-colors"
              >
                {expanded ? 'Hide details' : 'Show details'}
              </button>
              <button
                type="button"
                onClick={onDismiss}
                className="rounded-md bg-orange-100 px-2.5 py-1 text-xs font-medium text-orange-700 hover:bg-orange-200 transition-colors"
              >
                Dismiss
              </button>
            </div>
          </div>
          <p className="mt-0.5 text-xs text-orange-600">
            Review before importing — no scanner catches everything.
          </p>
          {expanded && (
            <ul className="mt-2 space-y-1">
              {findings.map((f, i) => (
                <li key={i} className="text-xs text-orange-700 font-mono">
                  <span className="font-semibold not-italic">{f.patternName}</span>
                  {' in '}
                  <span className="text-orange-800">{f.fileName}</span>
                  {' — '}
                  <span className="text-orange-900">{f.redactedValue}</span>
                </li>
              ))}
            </ul>
          )}
        </div>
      </div>
    </div>
  );
}
