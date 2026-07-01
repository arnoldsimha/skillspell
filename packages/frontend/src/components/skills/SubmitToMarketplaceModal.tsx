import { useEffect, useState } from 'react';
import { createPortal } from 'react-dom';
import Spinner from '../common/Spinner.js';
import { fetchSubmissionEligibility } from '../../services/api/marketplace';
import type { SubmissionRequirement } from '@skillspell/shared';
import SubmissionRequirementsChecklist from './SubmissionRequirementsChecklist';

interface SubmitToMarketplaceModalProps {
  open: boolean;
  skillId: string;
  skillName: string;
  currentVersion: number;
  /** Currently published marketplace version — when set and currentVersion is older, a reason is required. */
  marketplaceVersion?: number;
  onConfirm: (version: string, submitterNote?: string) => Promise<void>;
  onCancel: () => void;
}

export default function SubmitToMarketplaceModal({
  open,
  skillId,
  skillName,
  currentVersion,
  marketplaceVersion,
  onConfirm,
  onCancel,
}: SubmitToMarketplaceModalProps) {
  const [submitting, setSubmitting] = useState(false);
  const [note, setNote] = useState('');
  const [requirements, setRequirements] = useState<SubmissionRequirement[]>([]);
  const [eligibilityLoading, setEligibilityLoading] = useState(false);

  useEffect(() => {
    if (!open) return;
    setEligibilityLoading(true);
    fetchSubmissionEligibility(skillId)
      .then(setRequirements)
      .catch(() => setRequirements([]))
      .finally(() => setEligibilityLoading(false));
  }, [open, skillId]);

  const isDowngrade = marketplaceVersion != null && currentVersion < marketplaceVersion;

  useEffect(() => {
    if (!open) setNote('');
  }, [open]);

  useEffect(() => {
    if (!isDowngrade) setNote('');
  }, [isDowngrade]);

  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape' && !submitting) onCancel();
    };
    document.addEventListener('keydown', onKey);
    return () => document.removeEventListener('keydown', onKey);
  }, [open, onCancel, submitting]);

  if (!open) return null;

  const requiredUnmet = requirements.some((r) => r.required && !r.met);
  const canSubmit = !requiredUnmet && (!isDowngrade || note.trim().length > 0);

  const handleSubmit = async () => {
    if (!canSubmit) return;
    setSubmitting(true);
    try {
      await onConfirm(String(currentVersion), isDowngrade ? note.trim() : undefined);
    } finally {
      setSubmitting(false);
    }
  };

  return createPortal(
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 backdrop-blur-sm animate-backdrop"
      onClick={() => { if (!submitting) onCancel(); }}
    >
      <div
        role="dialog"
        aria-modal="true"
        aria-labelledby="submit-marketplace-dialog-title"
        className="mx-4 w-full max-w-md rounded-2xl bg-white p-6 shadow-2xl animate-scale-in"
        onClick={(e) => e.stopPropagation()}
      >
        <h3
          id="submit-marketplace-dialog-title"
          className="mb-2 text-lg font-bold text-slate-800"
        >
          Submit to Marketplace
        </h3>

        {isDowngrade && (
          <div className="mb-4 rounded-xl border border-amber-200 bg-amber-50 px-4 py-3 text-sm text-amber-800">
            <span className="font-semibold">Downgrade submission — </span>
            v{currentVersion} is older than the current marketplace version (v{marketplaceVersion}).
          </div>
        )}

        <p className="mb-4 text-sm text-slate-600">
          You&rsquo;re about to submit <span className="font-semibold text-slate-800">&ldquo;{skillName}&rdquo;</span> version{' '}
          <span className="font-semibold text-indigo-600">v{currentVersion}</span> for review.
          Once submitted, it will be visible to the marketplace team for approval.
        </p>

        {eligibilityLoading && (
          <div className="animate-pulse space-y-2 mb-4" aria-label="Loading requirements...">
            <div className="h-4 bg-gray-200 rounded w-3/4" />
            <div className="h-4 bg-gray-200 rounded w-1/2" />
          </div>
        )}
        {!eligibilityLoading && requirements.length > 0 && (
          <SubmissionRequirementsChecklist requirements={requirements} />
        )}

        {isDowngrade && (
          <div className="mb-5">
            <label className="block text-sm font-medium text-slate-700 mb-1">
              Reason for submitting an older version <span className="text-red-500">*</span>
            </label>
            <textarea
              className="w-full rounded-lg border border-slate-300 px-3 py-2 text-sm text-slate-800 placeholder-slate-400 focus:border-indigo-500 focus:outline-none focus:ring-1 focus:ring-indigo-500"
              rows={3}
              placeholder="e.g. Rolling back due to a bug introduced in v9…"
              value={note}
              onChange={(e) => setNote(e.target.value)}
              disabled={submitting}
            />
          </div>
        )}

        <div className="flex justify-end gap-2">
          <button
            type="button"
            onClick={onCancel}
            disabled={submitting}
            className="rounded-xl px-4 py-2 text-sm font-medium text-slate-700 hover:bg-slate-100 transition-all duration-200 disabled:opacity-50"
          >
            Cancel
          </button>
          <button
            type="button"
            onClick={handleSubmit}
            disabled={submitting || !canSubmit}
            className="rounded-xl px-4 py-2 text-sm font-semibold transition-all duration-200 bg-indigo-600 hover:bg-indigo-700 text-white disabled:opacity-50 disabled:cursor-not-allowed"
          >
            {submitting ? <Spinner className="h-4 w-4" /> : 'Submit for Review'}
          </button>
        </div>
      </div>
    </div>,
    document.body,
  );
}
