/**
 * MarketplaceSubmissionsSection — renders pending marketplace submissions for org admins.
 *
 * Features:
 * - Tab bar: Pending Review / Approved
 * - Table of pending submissions with Approve / Reject actions (inline and via dedicated review page)
 * - Row click navigates to /admin/review/:submissionId for full-page review
 * - Approved tab: lazy-loads approved skills, Remove Skill per row with ConfirmDialog
 * - Approve: sends POST approve, removes row on success, shows toast
 * - Reject: inline textarea for optional review note, then confirms via POST reject
 * - Loading spinners on in-flight requests; inline error on failure
 * - Loading skeleton while initial data is fetching; empty state when list is empty
 */

import React, { useCallback, useEffect, useState } from 'react';
import { useNavigate } from 'react-router';
import { useToast } from '../common/ToastContext.js';
import { Button } from '../common/Button.js';
import { useUserPreferences } from '../../hooks/useUserPreferences.js';
import { formatDateWithPrefs } from '../../utils/formatDate.js';
import {
  getAdminPendingSubmissions,
  approveSubmission,
  rejectSubmission,
  getAdminApprovedSkills,
  removeMarketplaceSkill,
  getAdminRemovalRequests,
} from '../../services/api/marketplace.js';
import type {
  PendingSubmissionItem,
  MarketplaceListItem,
  RemovalRequest,
} from '../../services/api/marketplace.js';
import ConfirmDialog from '../common/ConfirmDialog.js';
import { RemovalRequestsTab } from './RemovalRequestsTab.js';
import { ApprovedSkillRow } from './ApprovedSkillRow.js';

// ─── Types ───────────────────────────────────────────────────────────────────

interface RejectState {
  submissionId: string;
  note: string;
}

// ─── Skeleton ────────────────────────────────────────────────────────────────

function SkeletonRow() {
  return (
    <tr className="animate-pulse">
      {[1, 2, 3, 4].map((i) => (
        <td key={i} className="px-4 py-3">
          <div className="h-4 rounded bg-slate-200" style={{ width: `${60 + i * 10}%` }} />
        </td>
      ))}
      <td className="px-4 py-3">
        <div className="flex gap-2">
          <div className="h-7 w-16 rounded bg-slate-200" />
          <div className="h-7 w-16 rounded bg-slate-200" />
        </div>
      </td>
    </tr>
  );
}

// ─── Main Component ──────────────────────────────────────────────────────────

export default function MarketplaceSubmissionsSection() {
  const { addToast } = useToast();
  const navigate = useNavigate();
  const { prefs } = useUserPreferences();

  // ─── Existing state (do not remove) ────────────────────────────────────
  const [submissions, setSubmissions] = useState<PendingSubmissionItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState<string | null>(null);

  // Track in-flight approve/reject per submission id
  const [approving, setApproving] = useState<Set<string>>(new Set());
  const [rejecting, setRejecting] = useState<Set<string>>(new Set());

  // Inline reject form state
  const [rejectState, setRejectState] = useState<RejectState | null>(null);

  // Per-row error messages
  const [rowErrors, setRowErrors] = useState<Record<string, string>>({});

  // --- Phase 24 additions ---
  const [activeTab, setActiveTab] = useState<'pending' | 'approved' | 'removal-requests'>('pending');
  const [removalRequests, setRemovalRequests] = useState<RemovalRequest[]>([]);
  const [removalRequestsLoading, setRemovalRequestsLoading] = useState(false);
  const [removalRequestsError, setRemovalRequestsError] = useState<string | null>(null);
  const [approvedSkills, setApprovedSkills] = useState<MarketplaceListItem[]>([]);
  const [approvedLoading, setApprovedLoading] = useState(false);
  const [approvedLoadError, setApprovedLoadError] = useState<string | null>(null);
  // IN-003: _removing was set but never read — ApprovedSkillRow manages its own
  // per-version loading state (removingVersion). The parent state is not needed.
  const [approveConfirm, setApproveConfirm] = useState<{ id: string; skillName?: string } | null>(null);
  const [removeConfirm, setRemoveConfirm] = useState<string | null>(null);
  const [removeReason, setRemoveReason] = useState('');
  const [approvedLoaded, setApprovedLoaded] = useState(false);

  // ─── Load pending submissions ───────────────────────────────────────────

  const loadSubmissions = useCallback(async () => {
    setLoading(true);
    setLoadError(null);
    try {
      const data = await getAdminPendingSubmissions();
      setSubmissions(data);
    } catch (err) {
      setLoadError(err instanceof Error ? err.message : 'Failed to load submissions');
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    loadSubmissions();
  }, [loadSubmissions]);

  // ─── Approved tab lazy load ─────────────────────────────────────────────

  const loadApproved = useCallback(async () => {
    setApprovedLoading(true);
    setApprovedLoadError(null);
    try {
      const { items } = await getAdminApprovedSkills();
      setApprovedSkills(items);
      setApprovedLoaded(true);
    } catch (err) {
      setApprovedLoadError(err instanceof Error ? err.message : 'Failed to load approved skills');
    } finally {
      setApprovedLoading(false);
    }
  }, []);

  useEffect(() => {
    if (activeTab === 'approved' && !approvedLoaded && !approvedLoading) {
      loadApproved();
    }
  }, [activeTab, approvedLoaded, approvedLoading, loadApproved]);

  // ─── Removal requests tab fetch ────────────────────────────────────────

  useEffect(() => {
    if (activeTab !== 'removal-requests') return;
    setRemovalRequestsLoading(true);
    setRemovalRequestsError(null);
    getAdminRemovalRequests()
      .then(setRemovalRequests)
      .catch(() => setRemovalRequestsError('Failed to load removal requests.'))
      .finally(() => setRemovalRequestsLoading(false));
  }, [activeTab]);

  // ─── Approve ───────────────────────────────────────────────────────────

  const handleApprove = useCallback(async (submissionId: string) => {
    setApproving((prev) => new Set(prev).add(submissionId));
    setRowErrors((prev) => {
      const next = { ...prev };
      delete next[submissionId];
      return next;
    });
    try {
      await approveSubmission(submissionId);
      setSubmissions((prev) => prev.filter((s) => s.id !== submissionId));
      addToast('success', 'Skill approved and now visible in the marketplace');
    } catch (err) {
      const msg = err instanceof Error ? err.message : 'Approve failed';
      setRowErrors((prev) => ({ ...prev, [submissionId]: msg }));
    } finally {
      setApproving((prev) => {
        const next = new Set(prev);
        next.delete(submissionId);
        return next;
      });
    }
  }, [addToast]);

  // ─── Reject ────────────────────────────────────────────────────────────

  const handleRejectClick = useCallback((submissionId: string) => {
    if (rejecting.size > 0) return;
    setRejectState({ submissionId, note: '' });
  }, [rejecting]);

  const handleRejectConfirm = useCallback(async () => {
    if (!rejectState) return;
    const { submissionId, note } = rejectState;

    setRejecting((prev) => new Set(prev).add(submissionId));
    setRowErrors((prev) => {
      const next = { ...prev };
      delete next[submissionId];
      return next;
    });
    try {
      await rejectSubmission(submissionId, note || undefined);
      setSubmissions((prev) => prev.filter((s) => s.id !== submissionId));
      setRejectState(null);
      addToast('success', 'Submission rejected');
    } catch (err) {
      const msg = err instanceof Error ? err.message : 'Reject failed';
      setRowErrors((prev) => ({ ...prev, [submissionId]: msg }));
    } finally {
      setRejecting((prev) => {
        const next = new Set(prev);
        next.delete(submissionId);
        return next;
      });
    }
  }, [rejectState, addToast]);

  // ─── Remove (Approved tab) ──────────────────────────────────────────────

  const handleRemove = useCallback(async (skillId: string, reason: string) => {
    try {
      await removeMarketplaceSkill(skillId, reason);
      setApprovedSkills((prev) => prev.filter((s) => s.skillId !== skillId));
      setRemoveConfirm(null);
      setRemoveReason('');
      addToast('success', 'Skill removed from marketplace');
    } catch (err) {
      addToast('error', err instanceof Error ? err.message : 'Failed to remove skill. Try again.');
    }
  }, [addToast]);

  // ─── Remove skill from approved list (sets confirm dialog) ─────────────

  const handleRemoveSkill = useCallback((skillId: string) => {
    setRemoveReason('');
    setRemoveConfirm(skillId);
  }, []);

  // ─── Render ────────────────────────────────────────────────────────────

  return (
    <div>
      <div className="mb-6">
        <h3 className="text-lg font-semibold text-slate-900">Marketplace Submissions</h3>
        <p className="mt-1 text-sm text-slate-500">
          Review and approve pending skill submissions for your organization's marketplace.
        </p>
      </div>

      {/* Tab bar — Pending Review / Approved / Removal Requests */}
      <div className="mb-4 flex items-center gap-1 border-b border-slate-200">
        {(['pending', 'approved', 'removal-requests'] as const).map((tab) => (
          <button
            type="button"
            key={tab}
            onClick={() => setActiveTab(tab)}
            className={`relative px-4 py-2.5 text-sm font-semibold transition-colors ${
              activeTab === tab ? 'text-indigo-600' : 'text-slate-500 hover:text-slate-700'
            }`}
          >
            {tab === 'pending' ? 'Pending Review' : tab === 'approved' ? 'Approved' : (
              <>
                Removal Requests
                {removalRequests.length > 0 && (
                  <span className="ml-1.5 inline-flex items-center rounded-full bg-amber-100 px-1.5 py-0.5 text-xs font-semibold text-amber-700">
                    {removalRequests.length}
                  </span>
                )}
              </>
            )}
            {activeTab === tab && (
              <span className="absolute inset-x-0 -bottom-0 h-1 rounded-full bg-indigo-600" />
            )}
          </button>
        ))}
      </div>

      {/* ─── Pending tab ─────────────────────────────────────────────────── */}
      {activeTab === 'pending' && (
        <>
          {loadError && (
            <div className="mb-4 rounded-lg border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700">
              {loadError}
              <button
                type="button"
                onClick={loadSubmissions}
                className="ml-2 underline hover:no-underline"
              >
                Retry
              </button>
            </div>
          )}

          <div className="overflow-hidden rounded-xl border border-slate-200 bg-white shadow-sm">
            <table className="min-w-full divide-y divide-slate-100">
              <thead className="bg-slate-50">
                <tr>
                  <th className="px-4 py-3 text-left text-xs font-semibold uppercase tracking-wide text-slate-500">
                    Skill
                  </th>
                  <th className="px-4 py-3 text-left text-xs font-semibold uppercase tracking-wide text-slate-500">
                    Version
                  </th>
                  <th className="px-4 py-3 text-left text-xs font-semibold uppercase tracking-wide text-slate-500">
                    Submitted by
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
                {loading ? (
                  <>
                    <SkeletonRow />
                    <SkeletonRow />
                    <SkeletonRow />
                  </>
                ) : submissions.length === 0 ? (
                  <tr>
                    <td colSpan={5} className="px-4 py-10 text-center text-sm text-slate-400">
                      No pending submissions
                    </td>
                  </tr>
                ) : (
                  submissions.map((sub) => {
                    const isApproving = approving.has(sub.id);
                    const isRejecting = rejecting.has(sub.id);
                    const isRejectOpen = rejectState?.submissionId === sub.id;
                    const rowError = rowErrors[sub.id];

                    return (
                      <React.Fragment key={sub.id}>
                        <tr
                          onClick={() => navigate(`/admin/review/${sub.id}`)}
                          className="cursor-pointer border-b border-slate-100 hover:bg-slate-50 transition-colors"
                        >
                          <td className="px-4 py-3 text-sm font-medium text-slate-800">
                            {sub.skillName ?? sub.skillId}
                          </td>
                          <td className="px-4 py-3 text-sm text-slate-600">v{sub.version}</td>
                          <td className="px-4 py-3 text-sm text-slate-600">{sub.submitterName ?? sub.submittedBy}</td>
                          <td className="px-4 py-3 text-sm text-slate-600">
                            {formatDateWithPrefs(sub.submittedAt, prefs)}
                          </td>
                          <td className="px-4 py-3" onClick={(e) => e.stopPropagation()}>
                            <div className="flex items-center gap-2">
                              {/* Approve */}
                              <Button
                                type="button"
                                onClick={() => setApproveConfirm({ id: sub.id, skillName: sub.skillName })}
                                disabled={isApproving || isRejecting}
                                variant="success"
                                size="xs"
                                loading={isApproving}
                                loadingText="Approve"
                              >
                                Approve
                              </Button>

                              {/* Reject toggle */}
                              {!isRejectOpen ? (
                                <Button
                                  type="button"
                                  onClick={() => handleRejectClick(sub.id)}
                                  disabled={isApproving || isRejecting}
                                  variant="destructive-outline"
                                  size="xs"
                                >
                                  Reject
                                </Button>
                              ) : (
                                <Button
                                  type="button"
                                  onClick={() => setRejectState(null)}
                                  variant="secondary"
                                  size="xs"
                                >
                                  Cancel
                                </Button>
                              )}
                            </div>

                            {/* Row-level error */}
                            {rowError && (
                              <p className="mt-1.5 text-xs text-red-600">{rowError}</p>
                            )}
                          </td>
                        </tr>

                        {/* Inline reject form */}
                        {isRejectOpen && (
                          <tr key={`${sub.id}-reject`} className="bg-red-50">
                            <td colSpan={5} className="px-4 py-3">
                              <div className="flex flex-col gap-2 sm:flex-row sm:items-end">
                                <div className="flex-1">
                                  <label
                                    htmlFor={`reject-note-${sub.id}`}
                                    className="mb-1 block text-xs font-medium text-slate-700"
                                  >
                                    Review note (optional)
                                  </label>
                                  <textarea
                                    id={`reject-note-${sub.id}`}
                                    rows={2}
                                    value={rejectState?.note ?? ''}
                                    onChange={(e) =>
                                      setRejectState((prev) =>
                                        prev ? { ...prev, note: e.target.value } : prev,
                                      )
                                    }
                                    placeholder="Explain why this submission is being rejected…"
                                    className="w-full rounded-lg border border-slate-200 px-3 py-2 text-sm text-slate-800 placeholder:text-slate-400 focus:border-indigo-400 focus:outline-none focus:ring-2 focus:ring-indigo-200"
                                  />
                                </div>
                                <Button
                                  type="button"
                                  onClick={handleRejectConfirm}
                                  disabled={isRejecting}
                                  variant="destructive"
                                  size="md"
                                  loading={isRejecting}
                                  loadingText="Confirm Reject"
                                >
                                  Confirm Reject
                                </Button>
                              </div>
                            </td>
                          </tr>
                        )}
                      </React.Fragment>
                    );
                  })
                )}
              </tbody>
            </table>
          </div>
        </>
      )}

      {/* ─── Approved tab ─────────────────────────────────────────────────── */}
      {activeTab === 'approved' && (
        <div>
          {approvedLoading && (
            <div aria-label="Loading approved skills">
              {[0, 1, 2].map((i) => (
                <div key={i} className="h-10 rounded bg-slate-100 animate-pulse mb-2" />
              ))}
            </div>
          )}
          {approvedLoadError && !approvedLoading && (
            <p className="text-sm text-red-600">{approvedLoadError}</p>
          )}
          {!approvedLoading && !approvedLoadError && approvedSkills.length === 0 && (
            <div className="py-12 text-center">
              <p className="text-sm font-semibold text-slate-700">No approved skills yet</p>
              <p className="mt-1 text-xs text-slate-400">Skills approved by your org's admins will appear here.</p>
            </div>
          )}
          {!approvedLoading && approvedSkills.length > 0 && (
            <div className="overflow-hidden rounded-xl border border-slate-200 bg-white shadow-sm">
              <table className="min-w-full divide-y divide-slate-100">
                <thead className="bg-slate-50">
                  <tr>
                    <th className="px-4 py-3 text-left text-xs font-semibold uppercase tracking-wide text-slate-500">Name</th>
                    <th className="px-4 py-3 text-left text-xs font-semibold uppercase tracking-wide text-slate-500">Version</th>
                    <th className="px-4 py-3 text-left text-xs font-semibold uppercase tracking-wide text-slate-500">Downloads</th>
                    <th className="px-4 py-3 text-left text-xs font-semibold uppercase tracking-wide text-slate-500">Approved</th>
                    <th className="px-4 py-3"><span className="sr-only">Actions</span></th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-100">
                  {Array.from(
                    approvedSkills.reduce((map, s) => {
                      const existing = map.get(s.skillId);
                      if (!existing || s.submittedAt > existing.submittedAt) map.set(s.skillId, s);
                      return map;
                    }, new Map<string, MarketplaceListItem>()).values()
                  ).map((skill) => (
                    <ApprovedSkillRow
                      key={skill.skillId}
                      skill={skill}
                      onSkillRemove={handleRemoveSkill}
                    />
                  ))}
                </tbody>
              </table>
            </div>
          )}
          <ConfirmDialog
            open={removeConfirm !== null}
            title="Remove from Marketplace?"
            variant="danger"
            confirmLabel="Remove from Marketplace"
            cancelLabel="Keep Skill"
            onConfirm={() => removeConfirm && handleRemove(removeConfirm, removeReason)}
            onCancel={() => { setRemoveConfirm(null); setRemoveReason(''); }}
            confirmDisabled={removeReason.trim() === ''}
          >
            <p className="mb-3">Remove this skill from the marketplace? This cannot be undone.</p>
            <label className="block text-sm font-medium text-slate-700 mb-1">
              Reason <span className="text-red-500">*</span>
            </label>
            <textarea
              className="w-full rounded-lg border border-slate-300 px-3 py-2 text-sm text-slate-800 placeholder-slate-400 focus:border-indigo-500 focus:outline-none focus:ring-1 focus:ring-indigo-500"
              rows={3}
              placeholder="Explain why this skill is being removed (policy violation, etc.)"
              value={removeReason}
              onChange={(e) => setRemoveReason(e.target.value)}
            />
          </ConfirmDialog>
        </div>
      )}

      {/* ─── Removal Requests tab ─────────────────────────────────────────── */}
      {activeTab === 'removal-requests' && (
        <div>
          {removalRequestsLoading && (
            <div aria-label="Loading removal requests">
              {[0, 1, 2].map((i) => (
                <div key={i} className="h-10 rounded bg-slate-100 animate-pulse mb-2" />
              ))}
            </div>
          )}
          {removalRequestsError && !removalRequestsLoading && (
            <p className="text-sm text-red-600">{removalRequestsError}</p>
          )}
          {!removalRequestsLoading && !removalRequestsError && (
            <RemovalRequestsTab
              requests={removalRequests}
              onRequestResolved={(id) =>
                setRemovalRequests((prev) => prev.filter((r) => r.id !== id))
              }
            />
          )}
        </div>
      )}

      <ConfirmDialog
        open={approveConfirm !== null}
        title="Approve this skill?"
        variant="primary"
        confirmLabel="Approve"
        onConfirm={() => { if (approveConfirm) { handleApprove(approveConfirm.id); setApproveConfirm(null); } }}
        onCancel={() => setApproveConfirm(null)}
      >
        <p className="text-sm text-slate-600">
          {approveConfirm?.skillName
            ? <><strong>{approveConfirm.skillName}</strong> will be published to the marketplace and visible to all users.</>
            : <>This skill will be published to the marketplace and visible to all users.</>}
        </p>
      </ConfirmDialog>
    </div>
  );
}
