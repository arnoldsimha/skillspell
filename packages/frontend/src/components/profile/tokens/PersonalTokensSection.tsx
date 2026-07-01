/**
 * PersonalTokensSection — Token table with React Query, optimistic revoke, ConfirmDialog.
 *
 * Implements TOK-02 (view all active tokens) and TOK-03 (revoke with confirmation).
 * GenerateTokenModal (Plan 04) is triggered from this component.
 */

import { useState } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { listPats, revokePat } from '../../../services/api/tokens.js';
import type { PatListItem } from '../../../services/api/tokens.js';
import { queryKeys } from '../../../lib/queryKeys.js';
import { useToast } from '../../common/ToastContext.js';
import { useUserPreferences } from '../../../hooks/useUserPreferences.js';
import { formatRelativeWithPrefs, formatDateWithPrefs } from '../../../utils/formatDate.js';
import Spinner from '../../common/Spinner.js';
import ConfirmDialog from '../../common/ConfirmDialog.js';
import GenerateTokenModal from './GenerateTokenModal.js';

// ─── Date helpers ─────────────────────────────────────────────────────────

function expiryClass(dateStr: string): string {
  const ts = new Date(dateStr).getTime();
  if (isNaN(ts)) return 'text-slate-400';
  const daysUntil = (ts - Date.now()) / (1000 * 60 * 60 * 24);
  if (daysUntil <= 0) return 'text-red-600 font-bold line-through';
  if (daysUntil <= 7) return 'text-red-600 font-bold';
  return 'text-slate-400';
}

// ─── Component ────────────────────────────────────────────────────────────

export default function PersonalTokensSection() {
  const [revokeTarget, setRevokeTarget] = useState<PatListItem | null>(null);
  const [generateOpen, setGenerateOpen] = useState(false);
  const { prefs } = useUserPreferences();

  const { data: tokens = [], isLoading, error } = useQuery({
    queryKey: queryKeys.tokens.all,
    queryFn: listPats,
  });

  const queryClient = useQueryClient();
  const { addToast } = useToast();

  const revokeMutation = useMutation({
    mutationFn: (id: string) => revokePat(id),
    onMutate: async (id) => {
      await queryClient.cancelQueries({ queryKey: queryKeys.tokens.all });
      const prev = queryClient.getQueryData<PatListItem[]>(queryKeys.tokens.all);
      queryClient.setQueryData(queryKeys.tokens.all, (old: PatListItem[] = []) =>
        old.map((t) => t.id === id ? { ...t, revokedAt: new Date().toISOString() } : t),
      );
      return { prev };
    },
    onError: (_err, _id, context) => {
      if (context?.prev) {
        queryClient.setQueryData(queryKeys.tokens.all, context.prev);
      }
      addToast('error', 'Failed to revoke token. Please try again.');
    },
    onSuccess: () => {
      addToast('success', 'Token revoked');
      queryClient.invalidateQueries({ queryKey: queryKeys.tokens.all });
    },
  });

  // ─── Loading state ───────────────────────────────────────────────────

  if (isLoading) {
    return (
      <div className="flex items-center justify-center py-20">
        <Spinner size="md" />
      </div>
    );
  }

  // ─── Render ──────────────────────────────────────────────────────────

  return (
    <div>
      {/* Header row */}
      <div className="flex items-center justify-between mb-6">
        <div>
          <h1 className="text-xl font-bold text-slate-800">Personal Access Tokens</h1>
          <p className="text-sm text-slate-500 mt-1">
            Tokens let the SkillSpell CLI authenticate on your behalf. Treat them like passwords.
          </p>
        </div>
        <button
          onClick={() => setGenerateOpen(true)}
          className="rounded-lg bg-indigo-600 px-4 py-2 text-sm font-medium text-white hover:bg-indigo-700 transition-colors"
        >
          Generate new token
        </button>
      </div>

      {/* Error banner */}
      {error && (
        <div className="mb-5 flex items-center gap-2 rounded-lg border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700">
          <svg className="h-4 w-4 shrink-0" fill="none" viewBox="0 0 24 24" strokeWidth={2} stroke="currentColor">
            <path strokeLinecap="round" strokeLinejoin="round" d="M12 9v3.75m9-.75a9 9 0 1 1-18 0 9 9 0 0 1 18 0Zm-9 3.75h.008v.008H12v-.008Z" />
          </svg>
          Could not load your tokens. Check your connection and try again.
        </div>
      )}

      {/* Empty state */}
      {tokens.length === 0 && !isLoading && (
        <div className="rounded-xl border border-slate-200/80 bg-white p-6 shadow-sm">
          <div className="flex flex-col items-center justify-center py-10 text-center">
            <svg className="h-10 w-10 text-slate-300 mb-3" fill="none" viewBox="0 0 24 24" strokeWidth={1.5} stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" d="M15.75 5.25a3 3 0 0 1 3 3m3 0a6 6 0 0 1-7.029 5.912c-.563-.097-1.159.026-1.563.43L10.5 17.25H8.25v2.25H6v2.25H2.25v-2.818c0-.597.237-1.17.659-1.591l6.499-6.499c.404-.404.527-1 .43-1.563A6 6 0 0 1 21.75 8.25Z" />
            </svg>
            <h2 className="text-sm font-semibold text-slate-700 mb-1">No tokens yet</h2>
            <p className="text-sm text-slate-500 mb-4">
              Generate your first token to use the SkillSpell CLI.
            </p>
            <button
              onClick={() => setGenerateOpen(true)}
              className="rounded-lg bg-indigo-600 px-4 py-2 text-sm font-medium text-white hover:bg-indigo-700 transition-colors"
            >
              Generate new token
            </button>
          </div>
        </div>
      )}

      {/* Token table */}
      {tokens.length > 0 && (
        <div className="rounded-xl border border-slate-200/80 bg-white shadow-sm overflow-hidden">
          <table className="w-full text-sm">
            <thead className="bg-slate-50 border-b border-slate-200">
              <tr>
                <th className="px-4 py-3 text-left text-xs font-normal uppercase tracking-wider text-slate-400">Name</th>
                <th className="px-4 py-3 text-left text-xs font-normal uppercase tracking-wider text-slate-400">Prefix</th>
                <th className="px-4 py-3 text-left text-xs font-normal uppercase tracking-wider text-slate-400">Created</th>
                <th className="px-4 py-3 text-left text-xs font-normal uppercase tracking-wider text-slate-400">Last used</th>
                <th className="px-4 py-3 text-left text-xs font-normal uppercase tracking-wider text-slate-400">Expires</th>
                <th className="px-4 py-3 text-left text-xs font-normal uppercase tracking-wider text-slate-400"></th>
              </tr>
            </thead>
            <tbody>
              {tokens.map((token) => {
                return (
                  <tr key={token.id} className={`border-b border-slate-100 last:border-0 ${token.revokedAt ? 'opacity-50' : ''}`}>
                    <td className="px-4 py-3 text-sm text-slate-700">
                      <span>{token.name}</span>
                      {token.revokedAt && (
                        <span className="ml-2 inline-flex items-center rounded-full bg-red-100 px-2 py-0.5 text-xs font-medium text-red-700">
                          Revoked
                        </span>
                      )}
                    </td>
                    <td className="px-4 py-3">
                      <span className="font-mono text-xs text-slate-500 bg-slate-50 rounded px-2 py-1">
                        {token.prefix}
                      </span>
                    </td>
                    <td className="px-4 py-3 text-sm text-slate-500">
                      {formatRelativeWithPrefs(token.createdAt, prefs)}
                    </td>
                    <td className="px-4 py-3 text-sm text-slate-500">
                      {formatRelativeWithPrefs(token.lastUsedAt, prefs)}
                    </td>
                    <td className="px-4 py-3 text-sm">
                      <span className={expiryClass(token.expiresAt)}>
                        {formatDateWithPrefs(token.expiresAt, prefs)}
                      </span>
                    </td>
                    <td className="px-4 py-3">
                      <button
                        onClick={() => setRevokeTarget(token)}
                        aria-label={`Revoke token ${token.name}`}
                        disabled={revokeMutation.isPending || !!token.revokedAt}
                        className="text-red-600 hover:text-red-700 text-sm font-normal hover:underline disabled:opacity-40 disabled:cursor-not-allowed"
                      >
                        Revoke
                      </button>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      )}

      {/* Revoke confirmation dialog */}
      <ConfirmDialog
        open={revokeTarget !== null}
        title="Revoke token?"
        variant="danger"
        confirmLabel="Revoke token"
        cancelLabel="Keep token"
        onConfirm={() => {
          if (revokeTarget && !revokeMutation.isPending) revokeMutation.mutate(revokeTarget.id);
          setRevokeTarget(null);
        }}
        onCancel={() => setRevokeTarget(null)}
      >
        <strong className="font-bold">{revokeTarget?.name}</strong>
        {' will be permanently revoked. Any scripts or tools using this token will stop working immediately.'}
      </ConfirmDialog>

      {/* Generate token modal (Plan 04) */}
      <GenerateTokenModal open={generateOpen} onClose={() => setGenerateOpen(false)} />
    </div>
  );
}
