import React, { useEffect, useState, useCallback } from 'react';
import { useParams, useNavigate } from 'react-router';
import { Button } from '../components/common/Button.js';
import {
  getMarketplaceSkill,
  downloadMarketplaceSkill,
  removeMarketplaceSkill,
  getMarketplaceSkillDiagram,
  getMarketplaceVersions,
  type MarketplaceSkillDetail,
  type MarketplaceVersion,
} from '../services/api/marketplace.js';
// IN-002: extracted custom hooks for the optimistic-update toggle pattern
import { useUpvoteToggle, useFavoriteToggle } from '../hooks/useMarketplaceToggles.js';
import {
  HandThumbUpIcon,
  StarIcon,
} from '@heroicons/react/24/outline';
import {
  HandThumbUpIcon as HandThumbUpSolidIcon,
  StarIcon as StarSolidIcon,
} from '@heroicons/react/24/solid';
import { listCategories } from '../services/api/taxonomy.js';
import { useToast } from '../components/common/ToastContext.js';
import { useHasRole } from '../hooks/useHasRole.js';
import Spinner from '../components/common/Spinner.js';
import { formatDateWithPrefs } from '../utils/formatDate.js';
import { useUserPreferences } from '../hooks/useUserPreferences.js';
import ConfirmDialog from '../components/common/ConfirmDialog.js';
import ExportDialog from '../components/export/ExportDialog.js';
import type { SkillVersionSnapshot, SkillSummary, ExportFormat } from '@skillspell/shared';
import SkillViewer from '../components/skills/SkillViewer.js';

export function MarketplaceDetailPage() {
  const { skillId } = useParams<{ skillId: string }>();
  const navigate = useNavigate();
  const { addToast } = useToast();
  const { prefs } = useUserPreferences();

  const [loading, setLoading] = useState(true);
  const [skill, setSkill] = useState<MarketplaceSkillDetail | null>(null);
  const [snapshot, setSnapshot] = useState<SkillVersionSnapshot | null>(null);
  const [error, setError] = useState(false);
  const [downloading, setDownloading] = useState(false);
  const [downloadCount, setDownloadCount] = useState(0);

  // WR-006: only 'admin' role can force-remove from marketplace — the backend
  // DELETE /api/admin/marketplace/:skillId endpoint is @Roles('admin') only.
  // Including 'owner' here would show the button but produce a 403 on click,
  // and also conflicts with the owner-initiated requestRemoval approval flow.
  const isAdmin = useHasRole('admin');

  const diagramFn = useCallback(
    (id: string, force: boolean) => getMarketplaceSkillDiagram(id, force),
    [],
  );

  const [versions, setVersions] = useState<MarketplaceVersion[]>([]);

  const [showExportDialog, setShowExportDialog] = useState(false);
  const [exportVersion, setExportVersion] = useState<number | undefined>(undefined);
  const [removeConfirm, setRemoveConfirm] = useState(false);
  const [removing, setRemoving] = useState(false);
  const [removeReason, setRemoveReason] = useState('');
  const [categoryMap, setCategoryMap] = useState<Record<string, string>>({});
  // IN-002: use extracted hooks (initial values synced after async skill load below)
  const { upvoteCount, isUpvoted, handleUpvote, syncUpvoteState } = useUpvoteToggle(
    skillId ?? '',
    { upvoteCount: 0, isUpvoted: false },
  );
  const { isFavorited, handleFavorite, syncFavoriteState } = useFavoriteToggle(
    skillId ?? '',
    false,
  );

  useEffect(() => {
    listCategories()
      .then(cats => setCategoryMap(Object.fromEntries(cats.map(c => [c.slug, c.name]))))
      .catch(() => { /* silent — slugs shown as fallback */ });
  }, []);

  useEffect(() => {
    if (!skillId) return;
    let cancelled = false;
    setLoading(true);
    setError(false);
    getMarketplaceSkill(skillId)
      .then((data) => {
        if (!cancelled) {
          setSkill(data);
          setDownloadCount(data.downloadCount ?? 0);
          // Sync initial values from the loaded skill into the toggle hooks
          syncUpvoteState(data.upvoteCount ?? 0, data.isUpvoted ?? false);
          syncFavoriteState(data.isFavorited ?? false);
        }
      })
      .catch(() => {
        if (!cancelled) setError(true);
      })
      .finally(() => {
        if (!cancelled) setLoading(false);
      });
    return () => { cancelled = true; };
  }, [skillId]);

  useEffect(() => {
    if (!skillId) return;
    getMarketplaceVersions(skillId)
      .then(setVersions)
      .catch(() => setVersions([]));
  }, [skillId]);

  useEffect(() => {
    if (!skill) return;
    setSnapshot({
      skillId: skill.skillId,
      version: Number(skill.version),
      description: skill.description,
      skillContent: skill.skillContent,
      scripts: skill.scripts ?? [],
      references: skill.references ?? [],
      assets: skill.assets ?? [],
      createdAt: skill.createdAt ?? skill.submittedAt,
    });
  }, [skill]);

  async function handleDownload(_format: ExportFormat, version?: number) {
    if (!skill || downloading) return;
    setDownloading(true);
    try {
      const versionStr = version != null ? String(version) : skill.version;
      await downloadMarketplaceSkill(skill.skillId, versionStr);
      setDownloadCount((c) => c + 1);
    } catch {
      addToast('error', 'Download failed. Please try again.');
    } finally {
      setDownloading(false);
    }
  }

  async function handleRemove() {
    if (!skill || removing || !removeReason.trim()) return;
    setRemoving(true);
    try {
      await removeMarketplaceSkill(skill.skillId, removeReason);
      addToast('success', 'Skill removed from marketplace');
      navigate('/marketplace');
    } catch {
      addToast('error', 'Failed to remove skill. Try again.');
      setRemoving(false);
    }
  }

  if (loading) {
    return (
      <div className="flex h-full items-center justify-center bg-slate-50">
        <Spinner />
      </div>
    );
  }

  if (error || !skill) {
    return (
      <div className="flex h-full items-center justify-center bg-slate-50">
        <div className="text-center">
          <p className="text-lg font-semibold text-slate-600">Skill not found</p>
          <Button
            type="button"
            onClick={() => navigate('/marketplace')}
            variant="link"
            size="sm"
            className="mt-4"
          >
            Back to Marketplace
          </Button>
        </div>
      </div>
    );
  }

  const displayName = skill.submittedByName ?? skill.submittedBy;

  // handleUpvote and handleFavorite are now provided by useUpvoteToggle / useFavoriteToggle
  // (see IN-002 — extracted custom hooks above)

  const detailRows: { label: string; value: React.ReactNode }[] = [
    { label: 'Version', value: <span className="font-mono text-slate-800">v{skill.version}</span> },
    { label: 'Downloads', value: <span className="text-slate-800 font-medium">{downloadCount.toLocaleString()}</span> },
    { label: 'Publisher', value: <span className="text-indigo-600 font-medium">{displayName}</span> },
    ...(skill.createdAt ? [{ label: 'Created', value: <span className="text-slate-800">{formatDateWithPrefs(skill.createdAt, prefs)}</span> }] : []),
    ...(skill.updatedAt ? [{ label: 'Updated', value: <span className="text-slate-800">{formatDateWithPrefs(skill.updatedAt, prefs)}</span> }] : []),
  ];

  const skillSummary: SkillSummary = {
    id: skill.skillId,
    name: skill.name,
    description: skill.description,
    ownerId: skill.submittedBy,
    status: 'ready',
    version: parseInt(skill.version, 10) || 1,
    createdAt: skill.createdAt ?? skill.submittedAt,
    updatedAt: skill.updatedAt ?? skill.submittedAt,
    isPublished: true,
  };

  return (
    <div className="min-h-full bg-slate-50">
      {/* Two-column layout */}
      <div className="grid grid-cols-1 lg:grid-cols-[1fr_300px] min-h-[calc(100vh-80px)]">

        {/* LEFT COLUMN */}
        <div className="flex flex-col min-w-0 overflow-hidden px-6 pt-5 pb-8 border-r border-slate-200 bg-white">
          {/* Back link */}
          <Button
            type="button"
            onClick={() => navigate('/marketplace')}
            variant="link"
            size="sm"
            className="mb-4 self-start"
            leftIcon={
              <svg className="h-4 w-4" xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" strokeWidth={2} stroke="currentColor" aria-hidden="true">
                <path strokeLinecap="round" strokeLinejoin="round" d="M10.5 19.5L3 12m0 0l7.5-7.5M3 12h18" />
              </svg>
            }
          >
            Back to Marketplace
          </Button>
          {/* Skill name */}
          <h1 className="text-2xl font-semibold text-slate-800">{skill.name}</h1>
          {/* Description */}
          <p className="mt-2 text-sm text-slate-500 leading-relaxed">{skill.description}</p>

          {snapshot ? (
            <SkillViewer
              snapshot={snapshot}
              skillId={skill.skillId}
              diagramFn={diagramFn}
              isOwner={false}
              className="flex flex-col flex-1 mt-4 min-h-0"
            />
          ) : (
            <div className="flex flex-1 mt-4 items-center justify-center">
              <Spinner />
            </div>
          )}
        </div>

        {/* RIGHT COLUMN */}
        <div className="flex flex-col gap-4 p-5 bg-slate-50">

          {/* Download button */}
          <Button
            type="button"
            onClick={() => { setExportVersion(undefined); setShowExportDialog(true); }}
            disabled={downloading}
            aria-label={`Download ${skill.name}`}
            variant="primary-gradient"
            size="lg"
            className="w-full"
          >
            <svg className="h-4 w-4" xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" strokeWidth={2} stroke="currentColor" aria-hidden="true">
              <path strokeLinecap="round" strokeLinejoin="round" d="M3 16.5v2.25A2.25 2.25 0 005.25 21h13.5A2.25 2.25 0 0021 18.75V16.5M16.5 12L12 16.5m0 0L7.5 12m4.5 4.5V3" />
            </svg>
            Download Skill
          </Button>

          {/* Upvote + Favorite */}
          <div className="flex gap-2">
            <button
              type="button"
              onClick={handleUpvote}
              aria-label={isUpvoted ? 'Remove upvote' : 'Upvote'}
              className={`flex flex-1 items-center justify-center gap-2 rounded-lg border px-3 py-2 text-sm font-medium transition-colors ${
                isUpvoted
                  ? 'border-indigo-300 bg-indigo-50 text-indigo-700 hover:bg-indigo-100'
                  : 'border-slate-200 bg-white text-slate-600 hover:bg-slate-50'
              }`}
            >
              {isUpvoted
                ? <HandThumbUpSolidIcon className="h-4 w-4" aria-hidden="true" />
                : <HandThumbUpIcon className="h-4 w-4" aria-hidden="true" />}
              <span>{upvoteCount}</span>
            </button>
            <button
              type="button"
              onClick={handleFavorite}
              aria-label={isFavorited ? 'Remove from favorites' : 'Add to favorites'}
              className={`flex flex-1 items-center justify-center gap-2 rounded-lg border px-3 py-2 text-sm font-medium transition-colors ${
                isFavorited
                  ? 'border-amber-300 bg-amber-50 text-amber-700 hover:bg-amber-100'
                  : 'border-slate-200 bg-white text-slate-600 hover:bg-slate-50'
              }`}
            >
              {isFavorited
                ? <StarSolidIcon className="h-4 w-4 text-amber-400" aria-hidden="true" />
                : <StarIcon className="h-4 w-4" aria-hidden="true" />}
              <span>{isFavorited ? 'Favorited' : 'Favorite'}</span>
            </button>
          </div>

          {/* Details card */}
          <div className="rounded-xl border border-slate-200 bg-white p-4 shadow-sm">
            <p className="mb-3 text-xs font-semibold uppercase tracking-widest text-slate-400">Details</p>
            <dl className="flex flex-col divide-y divide-slate-100">
              {detailRows.map(({ label, value }) => (
                <div key={label} className="flex flex-col py-2.5 first:pt-0 last:pb-0">
                  <dt className="sr-only">{label}</dt>
                  <dd className="flex items-center justify-between text-sm m-0">
                    <span className="text-slate-400">{label}</span>
                    {value}
                  </dd>
                </div>
              ))}
            </dl>
          </div>

          {/* Categories */}
          {(skill.categories ?? []).length > 0 && (
            <div className="rounded-xl border border-slate-200 bg-white p-4 shadow-sm">
              <p className="mb-3 text-xs font-semibold uppercase tracking-widest text-slate-400">Categories</p>
              <div className="flex flex-wrap gap-1.5">
                {(skill.categories ?? []).map((slug) => (
                  <span key={slug} className="inline-flex items-center rounded-full bg-indigo-50 px-2.5 py-1 text-xs font-normal text-indigo-700 ring-1 ring-inset ring-indigo-100">
                    {categoryMap[slug] ?? slug}
                  </span>
                ))}
              </div>
            </div>
          )}

          {/* Version history */}
          {versions.length > 1 && (
            <section aria-label="Version history" className="rounded-xl border border-slate-200 bg-white p-4 shadow-sm">
              <p className="mb-3 text-xs font-semibold uppercase tracking-widest text-slate-400">Version History</p>
              <div className="divide-y divide-gray-100">
                {versions.map((v) => {
                  const isLatest = v.version === skill.version;
                  return (
                    <div key={v.id} className="flex items-center justify-between py-2.5 first:pt-0 last:pb-0">
                      <div className="flex flex-col gap-0.5">
                        <div className="flex items-center gap-2">
                          <span className="font-mono text-sm text-slate-800">v{v.version}</span>
                          {isLatest && (
                            <span className="text-xs bg-green-100 text-green-700 px-2 py-0.5 rounded-full">
                              Latest
                            </span>
                          )}
                        </div>
                        <span className="text-xs text-slate-400">
                          Approved {formatDateWithPrefs(v.reviewedAt ?? v.submittedAt, prefs)}
                        </span>
                      </div>
                      <Button
                        type="button"
                        onClick={() => {
                          setExportVersion(parseInt(v.version!, 10));
                          setShowExportDialog(true);
                        }}
                        variant="secondary"
                        size="xs"
                      >
                        Download
                      </Button>
                    </div>
                  );
                })}
              </div>
            </section>
          )}

          {/* Admin remove */}
          {isAdmin && (
            <Button
              type="button"
              onClick={() => { setRemoveReason(''); setRemoveConfirm(true); }}
              disabled={removing}
              aria-label={`Remove ${skill.name} from marketplace`}
              variant="destructive-outline"
              size="md"
              className="w-full"
            >
              Remove from Marketplace
            </Button>
          )}
        </div>
      </div>

      {showExportDialog && (
        <ExportDialog
          skill={skillSummary}
          version={exportVersion ?? (parseInt(skill.version, 10) || 1)}
          exportFn={handleDownload}
          onClose={() => { setShowExportDialog(false); setExportVersion(undefined); }}
        />
      )}

      <ConfirmDialog
        open={removeConfirm}
        title="Remove from Marketplace?"
        variant="danger"
        confirmLabel="Remove from Marketplace"
        cancelLabel="Keep Skill"
        onConfirm={handleRemove}
        onCancel={() => { setRemoveConfirm(false); setRemoveReason(''); }}
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
  );
}
