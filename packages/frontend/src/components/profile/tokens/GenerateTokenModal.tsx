import { useState } from 'react';
import { createPortal } from 'react-dom';
import { useQueryClient } from '@tanstack/react-query';
import { createPat } from '../../../services/api/tokens.js';
import { ApiError } from '../../../services/api/client.js';
import type { CreatePatResponse } from '../../../services/api/tokens.js';
import { queryKeys } from '../../../lib/queryKeys.js';
import Spinner from '../../common/Spinner.js';

// ─── Types ────────────────────────────────────────────────────────────────

type ModalPhase = 'form' | 'reveal';
type ExpiryPreset = '30d' | '90d' | '1y' | 'custom';

interface GenerateTokenModalProps {
  open: boolean;
  onClose: () => void;
}

// ─── Helpers ──────────────────────────────────────────────────────────────

/** Compute ISO expiresAt from a preset at submit time — NOT at mount. */
function computeExpiresAt(preset: ExpiryPreset, customDate: string): string {
  if (preset === 'custom') return new Date(customDate).toISOString();
  const d = new Date();
  if (preset === '30d') d.setDate(d.getDate() + 30);
  else if (preset === '90d') d.setDate(d.getDate() + 90);
  else if (preset === '1y') d.setFullYear(d.getFullYear() + 1);
  return d.toISOString();
}

function tomorrowDateString(): string {
  const t = new Date();
  t.setDate(t.getDate() + 1);
  return t.toISOString().split('T')[0];
}

const PRESET_LABELS: Record<ExpiryPreset, string> = {
  '30d': '30 days',
  '90d': '90 days',
  '1y': '1 year',
  custom: 'Custom',
};

// ─── Component ────────────────────────────────────────────────────────────

/**
 * Two-phase modal for generating a Personal Access Token.
 *
 * Phase 1 (form): name field + expiry preset buttons → disabled submit until valid.
 * Phase 2 (reveal): amber warning + monospace token box + copy button + 'I've copied it' close.
 *
 * Security invariants:
 * - Backdrop click blocked in reveal phase (user must explicitly acknowledge)
 * - rawToken cleared from state unconditionally on close
 * - queryKeys.tokens.all invalidated only after a token was successfully created
 */
export default function GenerateTokenModal({ open, onClose }: GenerateTokenModalProps) {
  const [phase, setPhase] = useState<ModalPhase>('form');
  const [rawToken, setRawToken] = useState('');
  const [name, setName] = useState('');
  const [expiryPreset, setExpiryPreset] = useState<ExpiryPreset | null>(null);
  const [customDate, setCustomDate] = useState('');
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [copied, setCopied] = useState(false);
  const [clipboardUnavailable, setClipboardUnavailable] = useState(false);
  const [tokenCreated, setTokenCreated] = useState(false);

  const queryClient = useQueryClient();

  // ─── Handlers ───────────────────────────────────────────────────────────

  const handleSubmit = async () => {
    if (!expiryPreset) return;
    setError(null);
    setSubmitting(true);
    try {
      if (expiryPreset === 'custom') {
        const chosen = new Date(customDate);
        const tomorrow = new Date();
        tomorrow.setDate(tomorrow.getDate() + 1);
        tomorrow.setHours(0, 0, 0, 0);
        if (isNaN(chosen.getTime()) || chosen < tomorrow) {
          setError('Expiry date must be at least tomorrow.');
          setSubmitting(false);
          return;
        }
      }
      const expiresAt = computeExpiresAt(expiryPreset, customDate);
      const res: CreatePatResponse = await createPat({ name: name.trim(), expiresAt });
      setRawToken(res.rawToken);
      setTokenCreated(true);
      setPhase('reveal');
    } catch (err) {
      setError(err instanceof ApiError ? err.message : 'Failed to generate token. Please try again.');
    } finally {
      setSubmitting(false);
    }
  };

  /** Clear all state — rawToken MUST be cleared before calling onClose (T-4-07). */
  const handleClose = () => {
    const wasCreated = tokenCreated;
    setPhase('form');
    setRawToken('');
    setName('');
    setExpiryPreset(null);
    setCustomDate('');
    setError(null);
    setCopied(false);
    setClipboardUnavailable(false);
    setTokenCreated(false);
    // Invalidate before onClose so refetch is queued while the page is still mounted
    if (wasCreated) {
      queryClient.invalidateQueries({ queryKey: queryKeys.tokens.all });
    }
    onClose();
  };

  const handleCopy = async () => {
    try {
      await navigator.clipboard.writeText(rawToken);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    } catch {
      setClipboardUnavailable(true);
    }
  };

  // ─── Render ─────────────────────────────────────────────────────────────

  if (!open) return null;

  const canSubmit =
    name.trim().length > 0 &&
    expiryPreset !== null &&
    (expiryPreset !== 'custom' || customDate !== '') &&
    !submitting;

  return createPortal(
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 backdrop-blur-sm">
      {/* Backdrop: only dismiss in form phase — NOT in reveal phase (prevents accidental token loss) */}
      <div
        className="absolute inset-0"
        onClick={phase === 'form' ? handleClose : undefined}
      />

      {/* Dialog panel */}
      <div
        className="relative w-full max-w-lg rounded-xl border border-slate-200 bg-white p-6 shadow-xl"
        role="dialog"
        aria-modal="true"
        aria-labelledby="generate-token-modal-title"
        aria-describedby={phase === 'reveal' ? 'generate-token-warning' : undefined}
      >
        {/* Header */}
        <div className="mb-5 flex items-center justify-between">
          <h2 id="generate-token-modal-title" className="text-lg font-bold text-slate-800">
            {phase === 'form' ? 'Generate new token' : 'Your new token'}
          </h2>
          <button
            type="button"
            onClick={handleClose}
            className="flex h-7 w-7 items-center justify-center rounded-lg text-slate-400 hover:bg-slate-100 hover:text-slate-600 transition-colors"
            aria-label="Close"
          >
            <svg className="h-4 w-4" fill="none" viewBox="0 0 24 24" strokeWidth={2} stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" d="M6 18 18 6M6 6l12 12" />
            </svg>
          </button>
        </div>

        {/* ── Form phase ── */}
        {phase === 'form' && (
          <>
            {/* Token name */}
            <div className="mb-4">
              <label className="block text-sm font-normal text-slate-700 mb-2">Token name</label>
              <input
                type="text"
                value={name}
                onChange={(e) => setName(e.target.value)}
                placeholder="e.g. CI/CD pipeline, local dev"
                maxLength={100}
                disabled={submitting}
                autoFocus
                className="w-full rounded-lg border border-slate-300 px-3 py-2 text-sm text-slate-800 placeholder:text-slate-400 focus:border-indigo-500 focus:outline-none focus:ring-1 focus:ring-indigo-500 disabled:opacity-50"
              />
            </div>

            {/* Expiry preset buttons */}
            <div className="mb-4">
              <label className="block text-sm font-normal text-slate-700 mb-2">Expires in</label>
              <div className="flex gap-2 flex-wrap">
                {(['30d', '90d', '1y', 'custom'] as ExpiryPreset[]).map((preset) => (
                  <button
                    key={preset}
                    type="button"
                    onClick={() => setExpiryPreset(preset)}
                    disabled={submitting}
                    className={`rounded-lg border px-3 py-2 text-sm font-normal transition-colors disabled:opacity-50 ${
                      expiryPreset === preset
                        ? 'border-indigo-500 bg-indigo-50 text-indigo-700'
                        : 'border-slate-200 text-slate-600 hover:border-indigo-300 hover:text-indigo-600'
                    }`}
                  >
                    {PRESET_LABELS[preset]}
                  </button>
                ))}
              </div>

              {/* Custom date picker */}
              {expiryPreset === 'custom' && (
                <input
                  type="date"
                  value={customDate}
                  onChange={(e) => setCustomDate(e.target.value)}
                  min={tomorrowDateString()}
                  disabled={submitting}
                  aria-label="Custom expiry date"
                  className="mt-2 w-full rounded-lg border border-slate-300 px-3 py-2 text-sm text-slate-800 focus:border-indigo-500 focus:outline-none focus:ring-1 focus:ring-indigo-500 disabled:opacity-50"
                />
              )}
            </div>

            {/* Error banner */}
            {error && (
              <div className="mb-4 rounded-lg bg-red-50 px-3 py-2 text-sm text-red-700">
                {error}
              </div>
            )}

            {/* Actions */}
            <div className="flex justify-end gap-2">
              <button
                type="button"
                onClick={handleClose}
                disabled={submitting}
                className="rounded-lg border border-slate-300 px-3 py-2 text-sm font-normal text-slate-600 hover:bg-slate-50 transition-colors disabled:opacity-50"
              >
                Discard
              </button>
              <button
                type="button"
                onClick={handleSubmit}
                disabled={!canSubmit}
                className="flex items-center gap-2 rounded-lg bg-indigo-600 px-4 py-1.5 text-sm font-medium text-white hover:bg-indigo-700 transition-colors disabled:opacity-50"
              >
                {submitting && <Spinner size="sm" />}
                {submitting ? 'Generating\u2026' : 'Generate token'}
              </button>
            </div>
          </>
        )}

        {/* ── Reveal phase ── */}
        {phase === 'reveal' && (
          <>
            {/* Amber one-time warning banner (D-03) */}
            <div id="generate-token-warning" className="flex items-center gap-2 rounded-lg border border-amber-200 bg-amber-50 px-4 py-3 text-sm text-amber-700 mb-4">
              <svg className="h-4 w-4 shrink-0" fill="none" viewBox="0 0 24 24" strokeWidth={2} stroke="currentColor">
                <path strokeLinecap="round" strokeLinejoin="round" d="M12 9v3.75m-9.303 3.376c-.866 1.5.217 3.374 1.948 3.374h14.71c1.73 0 2.813-1.874 1.948-3.374L13.949 3.378c-.866-1.5-3.032-1.5-3.898 0L2.697 16.126ZM12 15.75h.007v.008H12v-.008Z" />
              </svg>
              This token will not be shown again. Copy it now — you cannot retrieve it later.
            </div>

            {/* Monospace token box — select-all for manual copy fallback */}
            <div
              className="rounded-lg border border-slate-200 bg-slate-50 p-3 font-mono text-sm text-slate-800 break-all select-all mb-3"
              aria-label="Your new token"
            >
              {rawToken}
            </div>

            {/* Copy to clipboard button */}
            <button
              type="button"
              onClick={handleCopy}
              className="w-full flex items-center justify-center gap-2 rounded-lg bg-indigo-600 px-4 py-2 text-sm font-bold text-white hover:bg-indigo-700 transition-colors mb-4"
            >
              {copied ? (
                <svg className="h-4 w-4" fill="none" viewBox="0 0 24 24" strokeWidth={2} stroke="currentColor">
                  <path strokeLinecap="round" strokeLinejoin="round" d="m4.5 12.75 6 6 9-13.5" />
                </svg>
              ) : (
                <svg className="h-4 w-4" fill="none" viewBox="0 0 24 24" strokeWidth={2} stroke="currentColor">
                  <path strokeLinecap="round" strokeLinejoin="round" d="M15.666 3.888A2.25 2.25 0 0 0 13.5 2.25h-3c-1.03 0-1.9.693-2.166 1.638m7.332 0c.055.194.084.4.084.612v0a.75.75 0 0 1-.75.75H9a.75.75 0 0 1-.75-.75v0c0-.212.03-.418.084-.612m7.332 0c.646.049 1.288.11 1.927.184 1.1.128 1.907 1.077 1.907 2.185V19.5a2.25 2.25 0 0 1-2.25 2.25H6.75A2.25 2.25 0 0 1 4.5 19.5V6.257c0-1.108.806-2.057 1.907-2.185a48.208 48.208 0 0 1 1.927-.184" />
                </svg>
              )}
              {copied ? 'Copied!' : 'Copy to clipboard'}
            </button>

            {/* Screen reader live region for copy feedback (a11y) */}
            <span aria-live="polite" className="sr-only">
              {copied ? 'Token copied to clipboard.' : ''}
            </span>

            {/* Manual copy fallback message */}
            {clipboardUnavailable && (
              <p className="text-xs text-slate-500 mt-1 mb-4">
                Select the token above and press Ctrl+C / Cmd+C to copy manually.
              </p>
            )}

            {/* Explicit acknowledgement close — MUST use this exact label (D-03) */}
            <button
              type="button"
              onClick={handleClose}
              className="w-full rounded-lg border border-slate-300 px-4 py-2 text-sm font-bold text-slate-700 hover:bg-slate-50 transition-colors"
            >
              I've copied it
            </button>
          </>
        )}
      </div>
    </div>,
    document.body,
  );
}
