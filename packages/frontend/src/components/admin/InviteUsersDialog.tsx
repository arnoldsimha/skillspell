import { useState } from 'react';
import { createPortal } from 'react-dom';
import { inviteUsers } from '../../services/api/users.js';
import type { InviteResult, UserRole } from '@skillspell/shared';
import { Button } from '../common/Button.js';

interface InviteUsersDialogProps {
  onClose: () => void;
  onInvitesSent?: () => void;
}

const MAX_EMAILS = 5;

/**
 * Modal dialog for inviting users via email.
 *
 * Allows an admin to enter 1–5 email addresses and send invite emails.
 * Shows per-email results (success / already registered / error) after submission.
 */
export default function InviteUsersDialog({ onClose, onInvitesSent }: InviteUsersDialogProps) {
  const [emails, setEmails] = useState<string[]>(['']);
  const [role, setRole] = useState<UserRole>('user');
  const [sending, setSending] = useState(false);
  const [results, setResults] = useState<InviteResult[] | null>(null);
  const [error, setError] = useState<string | null>(null);

  // ─── Helpers ─────────────────────────────────────────────────────────

  const updateEmail = (index: number, value: string) => {
    setEmails((prev) => {
      const next = [...prev];
      next[index] = value;
      return next;
    });
  };

  const addRow = () => {
    if (emails.length < MAX_EMAILS) {
      setEmails((prev) => [...prev, '']);
    }
  };

  const removeRow = (index: number) => {
    if (emails.length > 1) {
      setEmails((prev) => prev.filter((_, i) => i !== index));
    }
  };

  const validEmails = emails
    .map((e) => e.trim().toLowerCase())
    .filter((e) => /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(e));

  const canSubmit = validEmails.length > 0 && !sending;

  // ─── Submit ──────────────────────────────────────────────────────────

  const handleSubmit = async () => {
    setError(null);
    setSending(true);
    try {
      const res = await inviteUsers({ emails: validEmails, role });
      setResults(res);
      const anySuccess = res.some((r) => r.success);
      if (anySuccess) {
        onInvitesSent?.();
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to send invites');
    } finally {
      setSending(false);
    }
  };

  const handleReset = () => {
    setEmails(['']);
    setResults(null);
    setError(null);
  };

  // ─── Render ──────────────────────────────────────────────────────────

  return createPortal(
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 backdrop-blur-sm">
      {/* Backdrop */}
      <div className="absolute inset-0" onClick={onClose} />

      {/* Dialog */}
      <div className="relative w-full max-w-lg rounded-xl border border-slate-200 bg-white p-6 shadow-xl">
        {/* Header */}
        <div className="mb-5 flex items-center justify-between">
          <h2 className="text-lg font-bold text-slate-800">Invite Users</h2>
          <button
            onClick={onClose}
            className="flex h-7 w-7 items-center justify-center rounded-lg text-slate-400 hover:bg-slate-100 hover:text-slate-600 transition-colors"
            aria-label="Close dialog"
          >
            <svg className="h-4 w-4" fill="none" viewBox="0 0 24 24" strokeWidth={2} stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" d="M6 18 18 6M6 6l12 12" />
            </svg>
          </button>
        </div>

        {/* Results view */}
        {results ? (
          <div>
            <div className="mb-4 space-y-2">
              {results.map((r, i) => (
                <div
                  key={i}
                  className={`flex items-center gap-3 rounded-lg px-3 py-2 text-sm ${
                    r.success
                      ? 'bg-emerald-50 text-emerald-700'
                      : 'bg-red-50 text-red-700'
                  }`}
                >
                  {r.success ? (
                    <svg className="h-4 w-4 flex-shrink-0" fill="none" viewBox="0 0 24 24" strokeWidth={2} stroke="currentColor">
                      <path strokeLinecap="round" strokeLinejoin="round" d="m4.5 12.75 6 6 9-13.5" />
                    </svg>
                  ) : (
                    <svg className="h-4 w-4 flex-shrink-0" fill="none" viewBox="0 0 24 24" strokeWidth={2} stroke="currentColor">
                      <path strokeLinecap="round" strokeLinejoin="round" d="M6 18 18 6M6 6l12 12" />
                    </svg>
                  )}
                  <span className="font-medium">{r.email}</span>
                  {!r.success && r.error && (
                    <span className="ml-auto text-xs opacity-75">{r.error}</span>
                  )}
                  {r.success && (
                    <span className="ml-auto text-xs opacity-75">Invitation sent</span>
                  )}
                </div>
              ))}
            </div>

            <div className="flex justify-end gap-2">
              <Button
                onClick={handleReset}
                variant="secondary"
                size="sm"
              >
                Invite More
              </Button>
              <Button
                onClick={onClose}
                variant="primary"
                size="sm"
              >
                Done
              </Button>
            </div>
          </div>
        ) : (
          /* Input form */
          <div>
            <p className="mb-4 text-sm text-slate-500">
              Enter up to {MAX_EMAILS} email addresses. Each person will receive an invitation link valid for 1 hour.
            </p>

            {/* Email rows */}
            <div className="mb-4 space-y-2">
              {emails.map((email, i) => (
                <div key={i} className="flex items-center gap-2">
                  <input
                    type="email"
                    value={email}
                    onChange={(e) => updateEmail(i, e.target.value)}
                    placeholder={`email${emails.length > 1 ? ` ${i + 1}` : ''}@example.com`}
                    aria-label={`Email address ${i + 1}`}
                    className="flex-1 rounded-lg border border-slate-300 px-3 py-2 text-sm text-slate-800 placeholder:text-slate-400 focus:border-indigo-500 focus:outline-none focus:ring-1 focus:ring-indigo-500"
                    disabled={sending}
                    autoFocus={i === 0}
                  />
                  {emails.length > 1 && (
                    <button
                      onClick={() => removeRow(i)}
                      disabled={sending}
                      className="flex h-8 w-8 items-center justify-center rounded-lg text-slate-400 hover:bg-red-50 hover:text-red-500 transition-colors disabled:opacity-50"
                      aria-label={`Remove email ${i + 1}`}
                    >
                      <svg className="h-4 w-4" fill="none" viewBox="0 0 24 24" strokeWidth={2} stroke="currentColor">
                        <path strokeLinecap="round" strokeLinejoin="round" d="M6 18 18 6M6 6l12 12" />
                      </svg>
                    </button>
                  )}
                </div>
              ))}
            </div>

            {/* Add another email */}
            {emails.length < MAX_EMAILS && (
              <Button
                onClick={addRow}
                disabled={sending}
                variant="link"
                size="sm"
                className="mb-4"
              >
                + Add another email
              </Button>
            )}

            {/* Role selector */}
            <div className="mb-5 flex items-center gap-3">
              <label className="text-sm font-medium text-slate-600">Role:</label>
              <select
                value={role}
                onChange={(e) => setRole(e.target.value as UserRole)}
                disabled={sending}
                aria-label="Role for invited users"
                className="rounded-lg border border-slate-300 bg-white px-3 py-1.5 text-sm text-slate-700 focus:border-indigo-500 focus:outline-none focus:ring-1 focus:ring-indigo-500 disabled:opacity-50"
              >
                <option value="user">User</option>
                <option value="admin">Admin</option>
              </select>
            </div>

            {/* Error message */}
            {error && (
              <div className="mb-4 rounded-lg bg-red-50 px-3 py-2 text-sm text-red-700">
                {error}
              </div>
            )}

            {/* Actions */}
            <div className="flex justify-end gap-2">
              <Button
                onClick={onClose}
                disabled={sending}
                variant="secondary"
                size="sm"
              >
                Cancel
              </Button>
              <Button
                onClick={handleSubmit}
                disabled={!canSubmit}
                variant="primary"
                size="md"
                loading={sending}
                loadingText="Sending…"
              >
                {`Send Invitation${validEmails.length > 1 ? 's' : ''}`}
              </Button>
            </div>
          </div>
        )}
      </div>
    </div>,
    document.body,
  );
}
