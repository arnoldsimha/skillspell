import { useState } from 'react';
import { Button } from '../common/Button.js';
import ConfirmDialog from '../common/ConfirmDialog.js';

const STATUS_LABELS: Record<string, string> = {
  pending_review: 'Pending Review',
  approved: 'Approved',
  rejected: 'Rejected',
  removal_requested: 'Removal Requested',
};

const STATUS_COLORS: Record<string, string> = {
  pending_review: 'bg-amber-100 text-amber-800',
  approved: 'bg-green-100 text-green-800',
  rejected: 'bg-red-100 text-red-800',
  removal_requested: 'bg-orange-100 text-orange-800',
};

function formatRelativeTime(isoDate: string): string {
  const diffMs = Date.now() - new Date(isoDate).getTime();
  const diffDays = Math.floor(diffMs / 86400000);
  if (diffDays === 0) return 'today';
  if (diffDays === 1) return '1 day ago';
  return `${diffDays} days ago`;
}

interface AdminReviewHeaderProps {
  skillName: string;
  status: string;
  submitterName: string;
  submittedAt: string;
  version: string;
  onBack: () => void;
  onApprove: (reviewNote: string) => Promise<void>;
  onReject: (reviewNote: string) => Promise<void>;
}

export default function AdminReviewHeader({
  skillName,
  status,
  submitterName,
  submittedAt,
  version,
  onBack,
  onApprove,
  onReject,
}: AdminReviewHeaderProps) {
  const [reviewNote, setReviewNote] = useState('');
  const [inFlight, setInFlight] = useState(false);
  const [showApproveConfirm, setShowApproveConfirm] = useState(false);

  const handleAction = async (action: (note: string) => Promise<void>) => {
    setInFlight(true);
    try {
      await action(reviewNote);
    } finally {
      setInFlight(false);
    }
  };

  const handleApproveConfirm = async () => {
    setShowApproveConfirm(false);
    await handleAction(onApprove);
  };

  return (
    <>
      <div className="sticky top-0 z-10 bg-white border-b border-slate-200/80 px-6 py-3 flex items-center gap-3 flex-wrap">
        <Button
          type="button"
          onClick={onBack}
          variant="ghost"
          size="sm"
          className="shrink-0"
        >
          ← Back to Marketplace Submissions
        </Button>

        <span className="text-slate-300 shrink-0">|</span>

        <span className="font-semibold text-slate-800 truncate max-w-xs">{skillName}</span>

        <span
          className={`text-xs font-semibold px-2 py-0.5 rounded-full shrink-0 ${STATUS_COLORS[status] ?? 'bg-slate-100 text-slate-600'}`}
        >
          {STATUS_LABELS[status] ?? status}
        </span>

        <span className="text-sm text-slate-500 shrink-0">
          v{version} · submitted by {submitterName} · {formatRelativeTime(submittedAt)}
        </span>

        <div className="ml-auto flex items-center gap-2 shrink-0">
          <input
            type="text"
            value={reviewNote}
            onChange={e => setReviewNote(e.target.value)}
            placeholder="Review note (optional)"
            className="text-sm border border-slate-200 rounded-xl px-3 py-1.5 w-56 focus:outline-none focus:border-indigo-400 focus:ring-1 focus:ring-indigo-500/30 transition-all duration-200"
            disabled={inFlight}
          />
          <Button
            type="button"
            disabled={inFlight}
            onClick={() => setShowApproveConfirm(true)}
            variant="success"
            size="md"
          >
            Approve
          </Button>
          <Button
            type="button"
            disabled={inFlight}
            onClick={() => handleAction(onReject)}
            variant="destructive"
            size="md"
          >
            Reject
          </Button>
        </div>
      </div>

      {showApproveConfirm && (
        <ConfirmDialog
          open
          title="Approve this skill?"
          confirmLabel="Approve"
          variant="primary"
          onConfirm={handleApproveConfirm}
          onCancel={() => setShowApproveConfirm(false)}
        >
          <p className="text-sm text-slate-600">
            <strong>{skillName}</strong> v{version} will be published to the marketplace and visible to all users.
          </p>
          {reviewNote.trim() && (
            <p className="mt-2 text-sm text-slate-500">
              Review note: <span className="italic">{reviewNote}</span>
            </p>
          )}
        </ConfirmDialog>
      )}
    </>
  );
}
