import React, { useState } from 'react';
import type { RemovalRequest } from '../../services/api/marketplace.js';
import {
  approveRemovalRequest,
  rejectRemovalRequest,
} from '../../services/api/marketplace.js';
import ConfirmDialog from '../common/ConfirmDialog.js';
import { Button } from '../common/Button.js';
import { useUserPreferences } from '../../hooks/useUserPreferences.js';
import { formatDateWithPrefs } from '../../utils/formatDate.js';

interface Props {
  requests: RemovalRequest[];
  onRequestResolved: (requestId: string) => void;
}

export function RemovalRequestsTab({ requests, onRequestResolved }: Props) {
  const { prefs } = useUserPreferences();
  const [inflight, setInflight] = useState<Set<string>>(new Set());
  const [errors, setErrors] = useState<Record<string, string>>({});
  const [approveConfirm, setApproveConfirm] = useState<RemovalRequest | null>(null);

  const setInflightFor = (id: string, active: boolean) =>
    setInflight((prev) => {
      const s = new Set(prev);
      active ? s.add(id) : s.delete(id);
      return s;
    });

  const handleApprove = async (req: RemovalRequest) => {
    setApproveConfirm(null);
    setInflightFor(req.id, true);
    try {
      await approveRemovalRequest(req.id);
      onRequestResolved(req.id);
    } catch {
      setErrors((prev) => ({ ...prev, [req.id]: 'Approval failed. Please try again.' }));
    } finally {
      setInflightFor(req.id, false);
    }
  };

  const handleReject = async (req: RemovalRequest) => {
    setInflightFor(req.id, true);
    try {
      await rejectRemovalRequest(req.id);
      onRequestResolved(req.id);
    } catch {
      setErrors((prev) => ({ ...prev, [req.id]: 'Rejection failed. Please try again.' }));
    } finally {
      setInflightFor(req.id, false);
    }
  };

  return (
    <div className="overflow-hidden rounded-xl border border-slate-200 bg-white shadow-sm">
      <table className="min-w-full divide-y divide-slate-100">
        <thead className="bg-slate-50">
          <tr>
            <th className="px-4 py-3 text-left text-xs font-semibold uppercase tracking-wide text-slate-500">
              Skill
            </th>
            <th className="px-4 py-3 text-left text-xs font-semibold uppercase tracking-wide text-slate-500">
              Scope
            </th>
            <th className="px-4 py-3 text-left text-xs font-semibold uppercase tracking-wide text-slate-500">
              Requested by
            </th>
            <th className="px-4 py-3 text-left text-xs font-semibold uppercase tracking-wide text-slate-500">
              Date
            </th>
            <th className="px-4 py-3 text-left text-xs font-semibold uppercase tracking-wide text-slate-500">
              Actions
            </th>
          </tr>
        </thead>
        <tbody className="divide-y divide-slate-100">
          {requests.length === 0 ? (
            <tr>
              <td colSpan={5} className="px-4 py-10 text-center text-sm text-slate-400">
                No removal requests
              </td>
            </tr>
          ) : (
            requests.map((req) => {
              const busy = inflight.has(req.id);
              return (
                <React.Fragment key={req.id}>
                  <tr className="border-b border-slate-100">
                    <td className="px-4 py-3">
                      <p className="text-sm font-medium text-slate-800">{req.skillName ?? req.skillId}</p>
                      {req.reason && (
                        <p className="mt-0.5 text-xs text-slate-500 italic">&ldquo;{req.reason}&rdquo;</p>
                      )}
                    </td>
                    <td className="px-4 py-3 text-sm text-slate-600">
                      {req.scope === 'version'
                        ? `v${req.targetVersion ?? '?'} only`
                        : 'All versions'}
                    </td>
                    <td className="px-4 py-3 text-sm text-slate-600">
                      {req.submitterName ?? req.submittedBy}
                    </td>
                    <td className="px-4 py-3 text-sm text-slate-600">
                      {formatDateWithPrefs(req.createdAt, prefs)}
                    </td>
                    <td className="px-4 py-3" onClick={(e) => e.stopPropagation()}>
                      <div className="flex items-center gap-2">
                        {/* Approve removal */}
                        <Button
                          type="button"
                          disabled={busy}
                          onClick={() => setApproveConfirm(req)}
                          variant="destructive"
                          size="xs"
                          loading={busy}
                          loadingText="Approve Removal"
                        >
                          Approve Removal
                        </Button>

                        {/* Reject removal request */}
                        <Button
                          type="button"
                          disabled={busy}
                          onClick={() => handleReject(req)}
                          variant="secondary"
                          size="xs"
                        >
                          {busy ? '…' : 'Reject'}
                        </Button>
                      </div>
                    </td>
                  </tr>
                  {errors[req.id] && (
                    <tr>
                      <td colSpan={5} className="px-4 py-2">
                        <p className="text-xs text-red-600">{errors[req.id]}</p>
                      </td>
                    </tr>
                  )}
                </React.Fragment>
              );
            })
          )}
        </tbody>
      </table>

      {approveConfirm && (
        <ConfirmDialog
          open
          title="Approve Removal?"
          confirmLabel="Approve Removal"
          onConfirm={() => handleApprove(approveConfirm)}
          onCancel={() => setApproveConfirm(null)}
          variant="warning"
        >
          {approveConfirm.scope === 'version'
            ? <>
                <strong>v{approveConfirm.targetVersion ?? '?'}</strong> of{' '}
                <strong>{approveConfirm.skillName ?? approveConfirm.skillId}</strong> will be removed.
                {' '}The listing will fall back to the previous approved version.
              </>
            : <>
                All versions of{' '}
                <strong>{approveConfirm.skillName ?? approveConfirm.skillId}</strong> will be removed
                from the marketplace immediately.
              </>
          }
        </ConfirmDialog>
      )}
    </div>
  );
}
