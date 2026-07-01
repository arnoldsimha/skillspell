import { useState, useEffect, useRef } from 'react';
import { useNavigate } from 'react-router';
import type { SkillSummary, SkillVersionSummary, SkillVersionSnapshot } from '@skillspell/shared';
import { fetchSkillMetadata, updateSkill, publishSkill, fetchVersionHistory, fetchVersionSnapshot } from '../../services/api/index.js';
import { generateSharedDiagram } from '../../services/api/sharing.js';
import { useToast } from '../common/ToastContext.js';
import { buildSkillPath } from '../../utils/parseVersionParam.js';
import VersionDiffViewer from './VersionDiffViewer.js';
import VersionBrowser from './VersionBrowser.js';
import { formatDateWithPrefs } from '../../utils/formatDate.js';
import { useUserPreferences } from '../../hooks/useUserPreferences.js';
import { useAuth } from '../../hooks/useAuth.js';
import DropdownMenu from '../common/DropdownMenu.js';
import type { DropdownMenuEntry } from '../common/DropdownMenu.js';
import ConfirmDialog from '../common/ConfirmDialog.js';
import Spinner from '../common/Spinner.js';
import Select from 'react-select';
import type { MultiSelectOption } from '../common/MultiSelectCombobox.js';
import {
  listCategories,
  getSkillTaxonomy,
  setSkillMetadata,
  type Category,
} from '../../services/api/taxonomy.js';
import { submitSkill, requestMarketplaceRemoval, getMarketplaceVersions } from '../../services/api/marketplace.js';
import type { MarketplaceVersion } from '../../services/api/marketplace.js';
import SubmitToMarketplaceModal from './SubmitToMarketplaceModal.js';
import SkillTabBar from './SkillTabBar.js';
import type { SkillDetailView } from './SkillTabBar.js';
import SkillFileBrowser from './SkillFileBrowser.js';
import SkillDiagramViewer from './SkillDiagramViewer.js';

interface SkillDetailProps {
  skillId: string;
  pinnedVersion?: number;
  onOptimize: (skill: SkillSummary) => void;
  onExport: (skill: SkillSummary, version?: number) => void;
  onDelete: (id: string) => void | Promise<void>;
  onBack: () => void;
  onUpdate?: (skill: SkillSummary) => void;
  onTests?: (skillId: string) => void;
  /** When true, hides all edit controls (Share button, name edit, publish toggle, Optimize, Delete). */
  readOnly?: boolean;
  /** Pre-fetched skill metadata — skips the ownership-gated fetchSkillMetadata call. Required for readOnly share views. */
  preloadedSkill?: SkillSummary;
  /** Pre-fetched version snapshot — skips the ownership-gated fetchVersionSnapshot call. Required for readOnly share views. */
  preloadedSnapshot?: SkillVersionSnapshot;
}

const STATUS_STYLES: Record<string, { bg: string; text: string; dot: string }> = {
  draft:     { bg: 'bg-amber-50',   text: 'text-amber-700',  dot: 'bg-amber-400' },
  ready:     { bg: 'bg-emerald-50', text: 'text-emerald-700',dot: 'bg-emerald-400' },
  in_review: { bg: 'bg-sky-50',     text: 'text-sky-700',    dot: 'bg-sky-400' },
  published: { bg: 'bg-purple-50',  text: 'text-purple-700', dot: 'bg-purple-400' },
};

const DEFAULT_STATUS = { bg: 'bg-slate-50', text: 'text-slate-600', dot: 'bg-slate-400' };

export default function SkillDetail({
  skillId,
  pinnedVersion,
  onOptimize,
  onExport,
  onDelete,
  onBack,
  onUpdate,
  onTests,
  readOnly = false,
  preloadedSkill,
  preloadedSnapshot,
}: SkillDetailProps) {
  const navigate = useNavigate();
  const { addToast } = useToast();
  const { prefs } = useUserPreferences();
  const { organization } = useAuth();
  const marketplaceEnabled = organization?.marketplaceEnabled ?? true;
  const [skill, setSkill] = useState<SkillSummary | null>(preloadedSkill ?? null);
  const [loading, setLoading] = useState(!preloadedSkill);
  const [error, setError] = useState<string | null>(null);
  const [confirmDelete, setConfirmDelete] = useState(false);
  const [confirmPublish, setConfirmPublish] = useState<boolean | null>(null);
  const [publishSaving, setPublishSaving] = useState(false);
  const [confirmShare, setConfirmShare] = useState(false);
  const [shareCopying, setShareCopying] = useState(false);
  const [showOptimizeChoice, setShowOptimizeChoice] = useState(false);
  const [editingName, setEditingName] = useState(false);
  const [nameValue, setNameValue] = useState('');
  const [nameError, setNameError] = useState<string | null>(null);
  const [nameSaving, setNameSaving] = useState(false);
  const [detailView, setDetailView] = useState<SkillDetailView>('content');
  const [descExpanded, setDescExpanded] = useState(false);
  const nameInputRef = useRef<HTMLInputElement>(null);
  const isSavingNameRef = useRef(false);
  const [isEditingCategories, setIsEditingCategories] = useState(false);

  // Metadata section state (D-08: staged local changes, explicit Save button)
  const [metaCategories, setMetaCategories] = useState<MultiSelectOption[]>([]);
  const [selectedCategories, setSelectedCategories] = useState<MultiSelectOption[]>([]);
  const [savedCategories, setSavedCategories] = useState<MultiSelectOption[]>([]);
  const [metaLoading, setMetaLoading] = useState(false);
  const [metaSaving, setMetaSaving] = useState(false);

  // Marketplace submission state
  const [showSubmitModal, setShowSubmitModal] = useState(false);

  // Deletion guard / removal-request state
  const [blockMessage, setBlockMessage] = useState<string | null>(null);
  const [showRemovalConfirm, setShowRemovalConfirm] = useState(false);
  const [removalReason, setRemovalReason] = useState('');
  const [removalError, setRemovalError] = useState<string | null>(null);
  const [removalScope, setRemovalScope] = useState<'skill' | 'version'>('skill');
  const [removalTargetId, setRemovalTargetId] = useState<string>('');
  const [approvedMarketplaceVersions, setApprovedMarketplaceVersions] = useState<MarketplaceVersion[]>([]);

  const resetRemovalDialog = () => {
    setShowRemovalConfirm(false);
    setRemovalError(null);
    setRemovalReason('');
    setRemovalScope('skill');
    setRemovalTargetId('');
    setApprovedMarketplaceVersions([]);
  };

  // Version selector state
  const [versionList, setVersionList] = useState<SkillVersionSummary[]>([]);
  const [viewingVersion, setViewingVersion] = useState<number | null>(pinnedVersion ?? null);
  const [versionSnapshot, setVersionSnapshot] = useState<SkillVersionSnapshot | null>(preloadedSnapshot ?? null);
  const [showVersionNotes, setShowVersionNotes] = useState(false);

  // Sync viewingVersion when pinnedVersion changes (URL navigation)
  useEffect(() => {
    setViewingVersion(pinnedVersion ?? null);
  }, [pinnedVersion]);


  useEffect(() => {
    // Skip ownership-gated fetch when preloaded data is provided (e.g. readOnly share view)
    if (preloadedSkill) return;
    let cancelled = false;
    setLoading(true);
    setError(null);
    fetchSkillMetadata(skillId)
      .then((data) => {
        if (!cancelled) setSkill(data);
      })
      .catch((err) => {
        if (!cancelled)
          setError(err instanceof Error ? err.message : 'Failed to load skill');
      })
      .finally(() => {
        if (!cancelled) setLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, [skillId, preloadedSkill]);

  // Load version list when skill metadata is available
  useEffect(() => {
    if (!skill) return;
    let cancelled = false;
    fetchVersionHistory(skill.id)
      .then((data) => {
        if (!cancelled) setVersionList(data);
      })
      .catch(() => {
        // Silently ignore – version list is non-critical
      });
    return () => { cancelled = true; };
  }, [skill?.id, skill?.version]);

  // Load taxonomy for this skill. In readOnly mode, only fetch current assignments
  // (GET /taxonomy is open to any authenticated user). In edit mode, also fetch the
  // full category/tag lists so the comboboxes have options to offer.
  useEffect(() => {
    if (!skill?.id) return;
    let cancelled = false;
    setMetaLoading(true);

    const fetchTaxonomy = readOnly
      ? getSkillTaxonomy(skill.id).then((current) => {
          if (cancelled) return;
          setSelectedCategories(current.categories);
          setSavedCategories(current.categories);
        })
      : Promise.all([listCategories(), getSkillTaxonomy(skill.id)]).then(
          ([cats, current]) => {
            if (cancelled) return;
            setMetaCategories(cats);
            const selectedCats = cats.filter((c: Category) =>
              current.categories.some((cc) => cc.id === c.id),
            );
            setSelectedCategories(selectedCats);
            setSavedCategories(selectedCats);
          },
        );

    fetchTaxonomy
      .catch(() => {
        // Non-critical — taxonomy section gracefully degrades if load fails
      })
      .finally(() => {
        if (!cancelled) setMetaLoading(false);
      });

    return () => { cancelled = true; };
  }, [readOnly, skill?.id]);

  // Always load version snapshot for content — current version or historical.
  // Skip when preloaded snapshot is provided (e.g. readOnly share view — avoids ownership-gated fetch).
  useEffect(() => {
    if (preloadedSnapshot) return;
    if (!skill) {
      setVersionSnapshot(null);
      return;
    }
    // Determine which version to load: pinned/historical or current
    const targetVersion = viewingVersion ?? skill.version;
    let cancelled = false;
    fetchVersionSnapshot(skill.id, targetVersion)
      .then((data) => {
        if (!cancelled) setVersionSnapshot(data);
      })
      .catch((err) => {
        if (!cancelled) {
          setError(err instanceof Error ? err.message : 'Failed to load version content');
          if (viewingVersion !== null) setViewingVersion(null);
        }
      });
    return () => { cancelled = true; };
  }, [viewingVersion, skill?.id, skill?.version, preloadedSnapshot]);

  if (loading) {
    return (
      <div className="flex h-full items-center justify-center">
        <div className="h-10 w-10 animate-spin-ease rounded-full border-[3px] border-indigo-200 border-t-indigo-600" />
      </div>
    );
  }

  if (error || !skill) {
    return (
      <div className="flex h-full flex-col items-center justify-center gap-4">
        <div className="flex h-12 w-12 items-center justify-center rounded-xl bg-red-50">
          <svg className="h-6 w-6 text-red-500" fill="none" viewBox="0 0 24 24" strokeWidth={1.5} stroke="currentColor">
            <path strokeLinecap="round" strokeLinejoin="round" d="M12 9v3.75m9-.75a9 9 0 1 1-18 0 9 9 0 0 1 18 0Zm-9 3.75h.008v.008H12v-.008Z" />
          </svg>
        </div>
        <p className="text-sm text-red-600">{error ?? 'Skill not found'}</p>
        <button
          onClick={onBack}
          className="rounded-xl bg-slate-100 px-4 py-2 text-sm font-medium text-slate-700 hover:bg-slate-200 transition-all duration-200"
        >
          Go Back
        </button>
      </div>
    );
  }

  const namePattern = /^[a-z][a-z0-9-]*$/;

  const handlePublishConfirm = async () => {
    if (confirmPublish === null) return;
    setPublishSaving(true);
    try {
      await publishSkill(skill.id, confirmPublish);
      setSkill({ ...skill, isPublished: confirmPublish });
      onUpdate?.({ ...skill, isPublished: confirmPublish });
      setConfirmPublish(null);
    } catch (err) {
      addToast('error', err instanceof Error ? err.message : 'Failed to update publish state');
      // Keep dialog open so user can retry
    } finally {
      setPublishSaving(false);
    }
  };

  const handleShare = async (forcePublic = false) => {
    // Private skill — open the confirmation dialog instead of copying immediately.
    // Do NOT set shareCopying here; the dialog is non-async.
    if (!skill.isPublished && !forcePublic) {
      setConfirmShare(true);
      return;
    }

    setShareCopying(true);
    try {
      if (forcePublic && !skill.isPublished) {
        await publishSkill(skill.id, true);
        setSkill({ ...skill, isPublished: true });
        onUpdate?.({ ...skill, isPublished: true });
      }
      const url = `${window.location.origin}/skills/share/${skill.id}/v${skill.version}`;
      await navigator.clipboard.writeText(url);
      addToast('success', forcePublic ? 'Skill made public — link copied!' : 'Link copied!');
    } catch {
      addToast('error', 'Failed to copy link');
    } finally {
      setShareCopying(false);
      setConfirmShare(false);
    }
  };

  const handleStartEditName = () => {
    setNameValue(skill.name);
    setNameError(null);
    setEditingName(true);
    setTimeout(() => nameInputRef.current?.focus(), 0);
  };

  const handleCancelEditName = () => {
    setEditingName(false);
    setNameError(null);
  };

  const handleSaveName = async () => {
    if (isSavingNameRef.current) return;
    const trimmed = nameValue.trim();
    if (!trimmed || trimmed === skill.name) {
      setEditingName(false);
      setNameError(null);
      return;
    }
    if (!namePattern.test(trimmed)) {
      setNameError('Must be lowercase, start with a letter, and contain only lowercase letters, numbers, and hyphens.');
      return;
    }
    isSavingNameRef.current = true;
    setNameSaving(true);
    try {
      const updated = await updateSkill(skill.id, { name: trimmed });
      // Extract only metadata fields — state is SkillSummary, not full Skill
      const meta: SkillSummary = {
        id: updated.id,
        ownerId: updated.ownerId,
        name: updated.name,
        description: updated.description,
        status: updated.status,
        version: updated.version,
        createdAt: updated.createdAt,
        updatedAt: updated.updatedAt,
        isPublished: updated.isPublished,
      };
      setSkill(meta);
      setEditingName(false);
      setNameError(null);
      onUpdate?.(meta);
    } catch (err) {
      setNameError(err instanceof Error ? err.message : 'Failed to update name');
    } finally {
      isSavingNameRef.current = false;
      setNameSaving(false);
    }
  };

  const handleNameKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === 'Enter') {
      e.preventDefault();
      void handleSaveName();
    } else if (e.key === 'Escape') {
      handleCancelEditName();
    }
  };

  const handleSaveMetadata = async (): Promise<boolean> => {
    setMetaSaving(true);
    try {
      const result = await setSkillMetadata(skill.id, {
        categoryIds: selectedCategories.map((c) => c.id),
      });
      // Update saved state so hasMetaChanges resets to false
      const newSavedCats = metaCategories.filter((c) =>
        result.categoryIds.includes(c.id),
      );
      setSavedCategories(newSavedCats);
      addToast('success', 'Metadata saved.');
      return true;
    } catch (err) {
      addToast('error', err instanceof Error ? err.message : 'Failed to save metadata. Please try again.');
      return false;
    } finally {
      setMetaSaving(false);
    }
  };

  const hasCategoryChanges =
    selectedCategories.map((c) => c.id).sort().join(',') !==
    savedCategories.map((c) => c.id).sort().join(',');

  // Handle marketplace submission from modal
  async function handleMarketplaceSubmit(version: string, submitterNote?: string) {
    try {
      await submitSkill(skill!.id, version, submitterNote);
      addToast('success', 'Skill submitted to the marketplace.');
      setShowSubmitModal(false);
      // Refresh skill metadata to get updated status (now in_review)
      const updated = await fetchSkillMetadata(skill!.id);
      setSkill(prev => prev ? {
        ...prev,
        status: updated.status,
      } : prev);
    } catch (err: unknown) {
      const message = err instanceof Error ? err.message : 'Submission failed. Please try again.';
      addToast('error', message);
      throw err;
    }
  }

  const handleDeleteClick = () => {
    if (skill.status === 'published') {
      setBlockMessage('This skill is published on the marketplace. Request removal before deleting.');
      return;
    }
    if (skill.status === 'in_review') {
      setBlockMessage('This skill has a pending marketplace submission. Wait for admin decision before deleting.');
      return;
    }
    setConfirmDelete(true);
  };

  const handleConfirmDelete = async () => {
    setConfirmDelete(false);
    try {
      // Parent (AuthenticatedLayout.handleDelete) owns the single DELETE call,
      // success toast, cache update, and redirect. Do NOT call deleteSkill here
      // as well — that produced a duplicate request (204 then a 404 on the
      // already-deleted skill).
      await onDelete(skill.id);
    } catch (err) {
      setBlockMessage(
        err instanceof Error
          ? err.message
          : 'Cannot delete this skill. It may be published on the marketplace.',
      );
    }
  };

  const handleRequestRemoval = async () => {
    setRemovalError(null);
    try {
      await requestMarketplaceRemoval(
        skill.id,
        removalScope,
        removalScope === 'version' ? removalTargetId : undefined,
        removalReason.trim() || undefined,
      );
      resetRemovalDialog();
      addToast('success', 'Removal request submitted.');
      const updated = await fetchSkillMetadata(skill.id);
      setSkill(prev => prev ? { ...prev, status: updated.status } : prev);
    } catch {
      setRemovalError('Failed to submit removal request. Please try again.');
    }
  };

  const openRemovalDialog = async () => {
    try {
      const versions = await getMarketplaceVersions(skill!.id);
      setApprovedMarketplaceVersions(versions.filter((v) => v.status === 'approved'));
    } catch {
      setApprovedMarketplaceVersions([]);
    }
    setShowRemovalConfirm(true);
  };

  const isViewingHistorical = viewingVersion !== null && viewingVersion !== skill.version;

  const effectiveVersion = viewingVersion ?? skill.version;
  const displayStatus = (() => {
    // Viewing a version that was approved on the marketplace → always show 'published'.
    if (skill.approvedVersions?.includes(effectiveVersion)) return 'published';
    // Skill is published (active listing) but we're viewing a newer draft → show 'ready'
    // so the user knows they have unpublished changes to submit.
    if (
      skill.status === 'published' &&
      skill.publishedVersion !== undefined &&
      effectiveVersion !== skill.publishedVersion
    ) return 'ready';
    return skill.status;
  })();
  const statusStyle = STATUS_STYLES[displayStatus] ?? DEFAULT_STATUS;

  // Build overflow menu items for the ⋯ dropdown
  const overflowItemsAll: DropdownMenuEntry[] = [
    {
      label: 'Tests',
      icon: (
        <svg className="h-4 w-4" fill="none" viewBox="0 0 24 24" strokeWidth={2} stroke="currentColor">
          <path strokeLinecap="round" strokeLinejoin="round" d="M9.75 3.104v5.714a2.25 2.25 0 0 1-.659 1.591L5 14.5M9.75 3.104c-.251.023-.501.05-.75.082m.75-.082a24.301 24.301 0 0 1 4.5 0m0 0v5.714c0 .597.237 1.17.659 1.591L19.8 15.3M14.25 3.104c.251.023.501.05.75.082M19.8 15.3l-1.57.393A9.065 9.065 0 0 1 12 15a9.065 9.065 0 0 0-6.23.693L5 14.5m14.8.8 1.402 1.402c1.232 1.232.65 3.318-1.067 3.611l-.772.13c-1.687.282-3.41.395-5.13.334l-.213-.01a8.86 8.86 0 0 1-2.89-.614L5 18.5" />
        </svg>
      ),
      onClick: () => {
        if (viewingVersion !== null && viewingVersion !== skill.version) {
          navigate(buildSkillPath(skill.id, viewingVersion, 'tests'));
        } else {
          onTests?.(skill.id);
        }
      },
    },
    {
      label: 'History',
      icon: (
        <svg className="h-4 w-4" fill="none" viewBox="0 0 24 24" strokeWidth={2} stroke="currentColor">
          <path strokeLinecap="round" strokeLinejoin="round" d="M12 6v6h4.5m4.5 0a9 9 0 1 1-18 0 9 9 0 0 1 18 0Z" />
        </svg>
      ),
      onClick: () => setDetailView('history'),
    },
    {
      label: 'Compare Versions',
      icon: (
        <svg className="h-4 w-4" fill="none" viewBox="0 0 24 24" strokeWidth={2} stroke="currentColor">
          <path strokeLinecap="round" strokeLinejoin="round" d="M7.5 21 3 16.5m0 0L7.5 12M3 16.5h13.5m0-13.5L21 7.5m0 0L16.5 12M21 7.5H7.5" />
        </svg>
      ),
      onClick: () => setDetailView('diff'),
    },
    { divider: true as const },
    {
      label: 'Edit categories',
      icon: (
        <svg className="h-4 w-4" fill="none" viewBox="0 0 24 24" strokeWidth={2} stroke="currentColor">
          <path strokeLinecap="round" strokeLinejoin="round" d="m16.862 4.487 1.687-1.688a1.875 1.875 0 1 1 2.652 2.652L10.582 16.07a4.5 4.5 0 0 1-1.897 1.13L6 18l.8-2.685a4.5 4.5 0 0 1 1.13-1.897l8.932-8.931Z" />
        </svg>
      ),
      onClick: () => { setIsEditingCategories(true); setDescExpanded(false); },
    },
    { divider: true as const },
    {
      label: 'Export',
      icon: (
        <svg className="h-4 w-4" fill="none" viewBox="0 0 24 24" strokeWidth={2} stroke="currentColor">
          <path strokeLinecap="round" strokeLinejoin="round" d="M3 16.5v2.25A2.25 2.25 0 0 0 5.25 21h13.5A2.25 2.25 0 0 0 21 18.75V16.5M16.5 12 12 16.5m0 0L7.5 12m4.5 4.5V3" />
        </svg>
      ),
      onClick: () => {
        const exportVersion = viewingVersion !== null && viewingVersion !== skill.version
          ? viewingVersion : undefined;
        onExport(skill, exportVersion);
      },
    },
    { divider: true as const },
    ...(() => {
      if (!marketplaceEnabled) return []; // marketplace disabled — no marketplace options
      const marketplaceIcon = (
        <svg className="h-4 w-4" fill="none" viewBox="0 0 24 24" strokeWidth={2} stroke="currentColor">
          <path strokeLinecap="round" strokeLinejoin="round" d="M13.5 21v-7.5a.75.75 0 0 1 .75-.75h3a.75.75 0 0 1 .75.75V21m-4.5 0H2.36m11.14 0H18m0 0h3.64m-1.39 0V9.349M3.75 21V9.35m0 0a3.001 3.001 0 0 0 3.75-.615A2.993 2.993 0 0 0 9.75 9.75c.896 0 1.7-.393 2.25-1.016a2.993 2.993 0 0 0 2.25 1.016c.896 0 1.7-.393 2.25-1.015a3.001 3.001 0 0 0 3.75.614m-16.5 0a3.004 3.004 0 0 1-.621-4.72l1.189-1.19A1.5 1.5 0 0 1 5.378 3h13.243a1.5 1.5 0 0 1 1.06.44l1.19 1.189a3 3 0 0 1-.621 4.72M6.75 18h3.75a.75.75 0 0 0 .75-.75V13.5a.75.75 0 0 0-.75-.75H6.75a.75.75 0 0 0-.75.75v3.75c0 .414.336.75.75.75Z" />
        </svg>
      );
      if (displayStatus === 'in_review') return []; // pending — no action available
      if (displayStatus === 'published') {
        return [{ label: 'Request Marketplace Removal', icon: marketplaceIcon, onClick: () => { void openRemovalDialog(); }, danger: true as const }];
      }
      // draft or ready — can submit
      return [{ label: 'Submit to Marketplace', icon: marketplaceIcon, onClick: () => setShowSubmitModal(true) }];
    })(),
    { divider: true as const },
    {
      label: 'Delete Skill',
      icon: (
        <svg className="h-4 w-4" fill="none" viewBox="0 0 24 24" strokeWidth={2} stroke="currentColor">
          <path strokeLinecap="round" strokeLinejoin="round" d="m14.74 9-.346 9m-4.788 0L9.26 9m9.968-3.21c.342.052.682.107 1.022.166m-1.022-.165L18.16 19.673a2.25 2.25 0 0 1-2.244 2.077H8.084a2.25 2.25 0 0 1-2.244-2.077L4.772 5.79m14.456 0a48.108 48.108 0 0 0-3.478-.397m-12 .562c.34-.059.68-.114 1.022-.165m0 0a48.11 48.11 0 0 1 3.478-.397m7.5 0v-.916c0-1.18-.91-2.164-2.09-2.201a51.964 51.964 0 0 0-3.32 0c-1.18.037-2.09 1.022-2.09 2.201v.916m7.5 0a48.667 48.667 0 0 0-7.5 0" />
        </svg>
      ),
      onClick: handleDeleteClick,
      danger: true,
    },
  ];

  // In readOnly mode keep only History and Export
  const overflowItems = readOnly ? [] : overflowItemsAll;

  return (
    <div className="flex h-full flex-col">
      {/* Skill Identity Bar */}
      <div className="border-b border-slate-200/80 bg-white px-6 py-3">
        {/* Row 1: name · status · version | [spacer] | public · share · optimize · ··· */}
        <div className="flex items-center gap-3 flex-wrap">
          <button
            onClick={onBack}
            className="rounded-xl p-2 text-slate-400 hover:bg-slate-100 hover:text-slate-700 md:hidden transition-all duration-200"
            aria-label="Back"
          >
            <svg className="h-5 w-5" fill="none" viewBox="0 0 24 24" strokeWidth={2} stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" d="M15.75 19.5 8.25 12l7.5-7.5" />
            </svg>
          </button>

          {/* Name */}
          {readOnly ? (
            <span className="text-xl font-bold text-slate-800">{skill.name}</span>
          ) : editingName ? (
            <div className="flex items-center gap-2">
              <input
                ref={nameInputRef}
                type="text"
                value={nameValue}
                onChange={(e) => { setNameValue(e.target.value); setNameError(null); }}
                onKeyDown={handleNameKeyDown}
                onBlur={() => { if (!nameSaving) void handleSaveName(); }}
                maxLength={64}
                disabled={nameSaving}
                aria-label="Skill name"
                placeholder="skill-name"
                className="rounded-xl border border-indigo-400 bg-white px-3 py-1 text-xl font-bold text-slate-800
                  focus:outline-none focus:ring-2 focus:ring-indigo-500/40 disabled:opacity-50 transition-all duration-200"
              />
              {nameSaving && (
                <div className="h-4 w-4 animate-spin-ease rounded-full border-2 border-indigo-600 border-t-transparent" />
              )}
            </div>
          ) : (
            <button
              type="button"
              onClick={handleStartEditName}
              className="group flex items-center gap-2 text-xl font-bold text-slate-800 hover:text-indigo-600 transition-colors"
              title="Click to rename"
            >
              {skill.name}
              <svg className="h-4 w-4 text-slate-300 group-hover:text-indigo-400 transition-colors" fill="none" viewBox="0 0 24 24" strokeWidth={2} stroke="currentColor">
                <path strokeLinecap="round" strokeLinejoin="round" d="m16.862 4.487 1.687-1.688a1.875 1.875 0 1 1 2.652 2.652L10.582 16.07a4.5 4.5 0 0 1-1.897 1.13L6 18l.8-2.685a4.5 4.5 0 0 1 1.13-1.897l8.932-8.931Zm0 0L19.5 7.125M18 14v4.75A2.25 2.25 0 0 1 15.75 21H5.25A2.25 2.25 0 0 1 3 18.75V8.25A2.25 2.25 0 0 1 5.25 6H10" />
              </svg>
            </button>
          )}

          {/* Status badge */}
          <span className={`flex items-center gap-1.5 rounded-full px-2.5 py-1 text-xs font-semibold ${statusStyle.bg} ${statusStyle.text}`}>
            <span className={`h-1.5 w-1.5 rounded-full ${statusStyle.dot}`} />
            {displayStatus === 'in_review' ? 'in review' : displayStatus}
          </span>

          {/* Version selector */}
          {versionList.length > 0 ? (
            <select
              aria-label="Select version to view"
              value={viewingVersion ?? skill.version}
              onChange={(e) => {
                const v = Number(e.target.value);
                if (v === skill.version) {
                  navigate(buildSkillPath(skillId));
                } else {
                  navigate(buildSkillPath(skillId, v));
                }
              }}
              className="rounded-lg border border-slate-200 bg-white px-3 py-1.5 text-sm font-medium text-slate-700 focus:border-indigo-400 focus:outline-none focus:ring-1 focus:ring-indigo-500/30 transition-all duration-200"
            >
              {versionList.map((v) => (
                <option key={v.version} value={v.version}>
                  v{v.version}{v.version === skill.version ? ' (current)' : ''} · {formatDateWithPrefs(v.createdAt, prefs)}
                </option>
              ))}
            </select>
          ) : (
            <span className="text-xs font-medium text-slate-400">v{skill.version}</span>
          )}

          <div className="flex-1" />

          {/* Right-side actions — owner only */}
          {!readOnly && (
            <div className="flex items-center gap-2">
              {/* Public / Private toggle */}
              <button
                type="button"
                onClick={() => setConfirmPublish(!skill.isPublished)}
                disabled={publishSaving}
                title={skill.isPublished ? 'Make private' : 'Make public'}
                className={`flex items-center gap-1.5 rounded-lg px-2.5 py-1.5 text-xs font-semibold transition-colors disabled:opacity-50
                  ${skill.isPublished
                    ? 'bg-emerald-50 text-emerald-700 hover:bg-emerald-100'
                    : 'bg-slate-100 text-slate-500 hover:bg-slate-200'}`}
              >
                {skill.isPublished ? (
                  <svg className="h-3.5 w-3.5" fill="none" viewBox="0 0 24 24" strokeWidth={2} stroke="currentColor">
                    <path strokeLinecap="round" strokeLinejoin="round" d="M12 21a9.004 9.004 0 0 0 8.716-6.747M12 21a9.004 9.004 0 0 1-8.716-6.747M12 21c2.485 0 4.5-4.03 4.5-9S14.485 3 12 3m0 18c-2.485 0-4.5-4.03-4.5-9S9.515 3 12 3m0 0a8.997 8.997 0 0 1 7.843 4.582M12 3a8.997 8.997 0 0 0-7.843 4.582m15.686 0A11.953 11.953 0 0 1 12 10.5c-2.998 0-5.74-1.1-7.843-2.918m15.686 0A8.959 8.959 0 0 1 21 12c0 .778-.099 1.533-.284 2.253M3 12c0 .778.099 1.533.284 2.253" />
                  </svg>
                ) : (
                  <svg className="h-3.5 w-3.5" fill="none" viewBox="0 0 24 24" strokeWidth={2} stroke="currentColor">
                    <path strokeLinecap="round" strokeLinejoin="round" d="M16.5 10.5V6.75a4.5 4.5 0 1 0-9 0v3.75m-.75 11.25h10.5a2.25 2.25 0 0 0 2.25-2.25v-6.75a2.25 2.25 0 0 0-2.25-2.25H6.75a2.25 2.25 0 0 0-2.25 2.25v6.75a2.25 2.25 0 0 0 2.25 2.25Z" />
                  </svg>
                )}
                {skill.isPublished ? 'Public' : 'Private'}
              </button>

              {/* Share — icon only (ChatGPT-style upload icon) */}
              <button
                type="button"
                onClick={() => { void handleShare(); }}
                disabled={shareCopying}
                title="Copy share link"
                className="flex items-center justify-center rounded-lg border border-slate-200 bg-white p-1.5 text-slate-500 hover:bg-slate-50 hover:text-slate-700 transition-colors disabled:opacity-50"
              >
                <svg className="h-4 w-4" fill="none" viewBox="0 0 24 24" strokeWidth={2} stroke="currentColor" strokeLinecap="round" strokeLinejoin="round">
                  <path d="M4 12v7a2 2 0 002 2h12a2 2 0 002-2v-7" />
                  <polyline points="16 6 12 2 8 6" />
                  <line x1="12" y1="2" x2="12" y2="15" />
                </svg>
              </button>

              {/* Optimize */}
              <button
                type="button"
                onClick={() => setShowOptimizeChoice(true)}
                className="flex items-center gap-1.5 rounded-lg bg-gradient-to-r from-indigo-600 to-purple-600 px-3.5 py-1.5 text-sm font-semibold text-white shadow-md shadow-indigo-500/20 hover:shadow-lg hover:brightness-110 transition-all duration-200"
              >
                <svg className="h-4 w-4" fill="none" viewBox="0 0 24 24" strokeWidth={2} stroke="currentColor">
                  <path strokeLinecap="round" strokeLinejoin="round" d="M9.813 15.904 9 18.75l-.813-2.846a4.5 4.5 0 0 0-3.09-3.09L2.25 12l2.846-.813a4.5 4.5 0 0 0 3.09-3.09L9 5.25l.813 2.846a4.5 4.5 0 0 0 3.09 3.09L15.75 12l-2.846.813a4.5 4.5 0 0 0-3.09 3.09Z" />
                </svg>
                Optimize
              </button>

              {/* Overflow menu */}
              <DropdownMenu items={overflowItems} />
            </div>
          )}

          {/* readOnly: Export button */}
          {readOnly && (
            <button
              type="button"
              onClick={() => {
                const exportVersion = viewingVersion !== null && viewingVersion !== skill.version
                  ? viewingVersion : undefined;
                onExport(skill, exportVersion);
              }}
              className="flex items-center gap-1.5 rounded-lg bg-gradient-to-r from-indigo-600 to-purple-600 px-3.5 py-1.5 text-sm font-semibold text-white shadow-md shadow-indigo-500/20 hover:shadow-lg hover:brightness-110 transition-all duration-200"
            >
              <svg className="h-4 w-4" fill="none" viewBox="0 0 24 24" strokeWidth={2} stroke="currentColor">
                <path strokeLinecap="round" strokeLinejoin="round" d="M3 16.5v2.25A2.25 2.25 0 0 0 5.25 21h13.5A2.25 2.25 0 0 0 21 18.75V16.5M16.5 12 12 16.5m0 0L7.5 12m4.5 4.5V3" />
              </svg>
              Export
            </button>
          )}
        </div>

        {nameError && (
          <p className="mt-1 text-xs text-red-500">{nameError}</p>
        )}

        {/* Row 2: description + category chips (editor) / description only (readOnly) */}
        <div className={`mt-1.5 flex gap-3 min-w-0 ${descExpanded && !isEditingCategories ? 'items-start' : 'items-center'}`}>
          {/* Description — flex:1, truncates when categories push in */}
          <button
            onClick={() => setDescExpanded(!descExpanded)}
            className={`group flex items-center gap-1 text-sm transition-colors text-left min-w-0 flex-1 ${isEditingCategories ? 'text-slate-300 pointer-events-none' : 'text-slate-600 hover:text-slate-800'}`}
          >
            <span className={descExpanded && !isEditingCategories ? 'whitespace-normal break-words' : 'truncate'}>
              {versionSnapshot?.description ?? skill.description}
            </span>
            <svg className={`h-3.5 w-3.5 shrink-0 transition-transform duration-200 ${isEditingCategories ? 'text-slate-200' : 'text-slate-400 group-hover:text-slate-600'} ${descExpanded ? 'rotate-180' : ''}`} fill="none" viewBox="0 0 24 24" strokeWidth={2.5} stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" d="m19.5 8.25-7.5 7.5-7.5-7.5" />
            </svg>
          </button>

          {/* Categories zone — editor only */}
          {!readOnly && (
            <div className="flex shrink-0 items-center gap-1.5">
              {isEditingCategories ? (
                /* Inline edit mode */
                <>
                  <Select
                    isMulti
                    unstyled
                    options={metaCategories}
                    value={selectedCategories}
                    onChange={(val) => setSelectedCategories(val as MultiSelectOption[])}
                    getOptionValue={(opt) => opt.id}
                    getOptionLabel={(opt) => opt.name}
                    placeholder="Search categories..."
                    classNames={{
                      container: () => 'w-[30vw]',
                      control: () => 'flex min-h-[32px] w-full items-center rounded-lg border border-slate-200 bg-white px-2 py-1 text-sm focus-within:border-indigo-400 focus-within:ring-1 focus-within:ring-indigo-500/30 cursor-text',
                      menu: () => 'absolute z-30 mt-1 w-full rounded-xl border border-slate-200/80 bg-white py-1 shadow-xl',
                      option: ({ isFocused }) => `px-3.5 py-2 text-sm text-slate-700 cursor-pointer ${isFocused ? 'bg-slate-50' : ''}`,
                      multiValue: () => 'inline-flex items-center gap-0.5 rounded-full border border-indigo-200 bg-indigo-50 px-2 py-0.5 text-xs font-medium text-indigo-700',
                      multiValueLabel: () => 'text-xs font-medium text-indigo-700',
                      multiValueRemove: () => 'ml-0.5 rounded-full p-0.5 text-indigo-400 hover:bg-indigo-100 hover:text-indigo-600 transition-colors',
                      placeholder: () => 'text-slate-400 text-sm',
                      input: () => 'text-sm text-slate-800',
                      noOptionsMessage: () => 'px-4 py-3 text-center text-sm text-slate-400',
                    }}
                  />
                  <button
                    type="button"
                    onClick={() => {
                      setIsEditingCategories(false);
                      setSelectedCategories(savedCategories);
                    }}
                    className="rounded-md border border-slate-200 bg-white px-2.5 py-1 text-xs font-medium text-slate-600 hover:bg-slate-50 transition-colors whitespace-nowrap"
                  >
                    Cancel
                  </button>
                  <button
                    type="button"
                    onClick={async () => {
                      const ok = await handleSaveMetadata();
                      if (ok) setIsEditingCategories(false);
                    }}
                    disabled={metaSaving || !hasCategoryChanges}
                    className="flex items-center gap-1.5 rounded-md bg-indigo-600 px-2.5 py-1 text-xs font-medium text-white hover:bg-indigo-700 disabled:opacity-50 transition-colors whitespace-nowrap"
                  >
                    {metaSaving && <Spinner size="sm" className="h-3 w-3" />}
                    Save
                  </button>
                </>
              ) : (
                /* Read state — chips + pencil */
                <>
                  {metaLoading ? (
                    <Spinner size="sm" className="h-3.5 w-3.5 text-slate-300" />
                  ) : selectedCategories.length === 0 ? (
                    <span className="text-xs italic text-slate-300">no categories</span>
                  ) : (
                    <>
                      {selectedCategories.slice(0, 3).map((c) => (
                        <span
                          key={c.id}
                          className="inline-flex items-center rounded-full border border-indigo-200 bg-indigo-50 px-2 py-0.5 text-xs font-medium text-indigo-700 whitespace-nowrap"
                        >
                          {c.name}
                        </span>
                      ))}
                      {selectedCategories.length > 3 && (
                        <span className="inline-flex items-center rounded-full bg-indigo-100 px-2 py-0.5 text-xs font-semibold text-indigo-700 whitespace-nowrap">
                          +{selectedCategories.length - 3}
                        </span>
                      )}
                    </>
                  )}
                  <button
                    type="button"
                    title="Edit categories"
                    onClick={() => { setIsEditingCategories(true); setDescExpanded(false); }}
                    className="rounded p-0.5 text-slate-400 hover:text-indigo-500 transition-colors"
                  >
                    <svg className="h-3.5 w-3.5" fill="none" viewBox="0 0 24 24" strokeWidth={2.2} stroke="currentColor">
                      <path strokeLinecap="round" strokeLinejoin="round" d="m16.862 4.487 1.687-1.688a1.875 1.875 0 1 1 2.652 2.652L10.582 16.07a4.5 4.5 0 0 1-1.897 1.13L6 18l.8-2.685a4.5 4.5 0 0 1 1.13-1.897l8.932-8.931Z" />
                    </svg>
                  </button>
                </>
              )}
            </div>
          )}
        </div>
      </div>

      {/* Delete confirmation dialog */}
      <ConfirmDialog
        open={confirmDelete}
        title="Delete Skill"
        confirmLabel="Yes, Delete"
        cancelLabel="Cancel"
        variant="danger"
        onConfirm={() => { void handleConfirmDelete(); }}
        onCancel={() => setConfirmDelete(false)}
      >
        <p>
          Are you sure you want to delete <strong>{skill.name}</strong>? All versions, test cases, and eval results will be permanently removed. This action cannot be undone.
        </p>
      </ConfirmDialog>

      {/* Publish / unpublish confirmation dialog */}
      <ConfirmDialog
        open={confirmPublish !== null}
        title={confirmPublish ? 'Make skill public?' : 'Make skill private?'}
        confirmLabel={confirmPublish ? 'Make public' : 'Make private'}
        cancelLabel="Keep as is"
        variant={confirmPublish ? 'primary' : 'danger'}
        onConfirm={() => { void handlePublishConfirm(); }}
        onCancel={() => setConfirmPublish(null)}
      >
        {confirmPublish ? (
          <div className="space-y-2">
            <p>Anyone in your organization will be able to discover and use <strong>{skill.name}</strong>.</p>
            <p className="text-slate-500">It will appear in the shared skills library and can be exported or evaluated by other team members.</p>
          </div>
        ) : (
          <div className="space-y-2">
            <p>Only you will be able to see and use <strong>{skill.name}</strong>.</p>
            <p className="text-slate-500">It will be removed from the shared skills library and hidden from other team members.</p>
          </div>
        )}
      </ConfirmDialog>

      {/* Share — make-public confirmation dialog */}
      <ConfirmDialog
        open={confirmShare}
        title="Make skill public to share?"
        confirmLabel="Make Public & Copy Link"
        cancelLabel="Cancel"
        variant="primary"
        onConfirm={() => { void handleShare(true); }}
        onCancel={() => setConfirmShare(false)}
      >
        <div className="space-y-2">
          <p>This skill is currently private. To share it, you need to make it public first.</p>
          <p className="text-slate-500">Anyone in your organization with the link will be able to view <strong>{skill.name}</strong> in read-only mode.</p>
        </div>
      </ConfirmDialog>

      {/* Optimize choice dialog */}
      {showOptimizeChoice && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 backdrop-blur-sm animate-backdrop" onClick={() => setShowOptimizeChoice(false)}>
          <div
            className="mx-4 w-full max-w-lg rounded-2xl bg-white p-6 shadow-2xl animate-scale-in"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="flex items-center gap-3 mb-5">
              <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-gradient-to-br from-indigo-500 to-purple-600 shadow-lg shadow-indigo-500/15">
                <svg className="h-5 w-5 text-white" fill="none" viewBox="0 0 24 24" strokeWidth={1.5} stroke="currentColor">
                  <path strokeLinecap="round" strokeLinejoin="round" d="M9.813 15.904 9 18.75l-.813-2.846a4.5 4.5 0 0 0-3.09-3.09L2.25 12l2.846-.813a4.5 4.5 0 0 0 3.09-3.09L9 5.25l.813 2.846a4.5 4.5 0 0 0 3.09 3.09L15.75 12l-2.846.813a4.5 4.5 0 0 0-3.09 3.09Z" />
                </svg>
              </div>
              <div>
                <h3 className="text-lg font-bold text-slate-800">Optimize Skill</h3>
                <p className="text-xs text-slate-500">Choose what you'd like to optimize</p>
              </div>
            </div>

            <div className="space-y-3">
              {/* Optimize Skill Content */}
              <button
                onClick={() => {
                  setShowOptimizeChoice(false);
                  onOptimize(skill);
                }}
                className="w-full rounded-xl border border-slate-200 bg-white p-4 text-left hover:border-indigo-300 hover:bg-indigo-50/50 hover:shadow-md transition-all duration-200 group"
              >
                <div className="flex items-start gap-3">
                  <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-lg bg-indigo-50 group-hover:bg-indigo-100 transition-colors">
                    <svg className="h-4.5 w-4.5 text-indigo-600" fill="none" viewBox="0 0 24 24" strokeWidth={2} stroke="currentColor">
                      <path strokeLinecap="round" strokeLinejoin="round" d="m16.862 4.487 1.687-1.688a1.875 1.875 0 1 1 2.652 2.652L10.582 16.07a4.5 4.5 0 0 1-1.897 1.13L6 18l.8-2.685a4.5 4.5 0 0 1 1.13-1.897l8.932-8.931Zm0 0L19.5 7.125M18 14v4.75A2.25 2.25 0 0 1 15.75 21H5.25A2.25 2.25 0 0 1 3 18.75V8.25A2.25 2.25 0 0 1 5.25 6H10" />
                    </svg>
                  </div>
                  <div>
                    <p className="text-sm font-semibold text-slate-800">Optimize Skill Content</p>
                    <p className="mt-0.5 text-xs text-slate-500 leading-relaxed">
                      Improve the skill's SKILL.md, scripts, references, and overall structure. Use AI to refine instructions, add missing sections, or enhance examples.
                    </p>
                  </div>
                </div>
              </button>

              {/* Optimize Description */}
              <button
                onClick={() => {
                  setShowOptimizeChoice(false);
                  navigate(`/skills/${skill.id}/optimize-description`, {
                    state: { skill },
                  });
                }}
                className="w-full rounded-xl border border-slate-200 bg-white p-4 text-left hover:border-purple-300 hover:bg-purple-50/50 hover:shadow-md transition-all duration-200 group"
              >
                <div className="flex items-start gap-3">
                  <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-lg bg-purple-50 group-hover:bg-purple-100 transition-colors">
                    <svg className="h-4.5 w-4.5 text-purple-600" fill="none" viewBox="0 0 24 24" strokeWidth={2} stroke="currentColor">
                      <path strokeLinecap="round" strokeLinejoin="round" d="M9.813 15.904 9 18.75l-.813-2.846a4.5 4.5 0 0 0-3.09-3.09L2.25 12l2.846-.813a4.5 4.5 0 0 0 3.09-3.09L9 5.25l.813 2.846a4.5 4.5 0 0 0 3.09 3.09L15.75 12l-2.846.813a4.5 4.5 0 0 0-3.09 3.09ZM18.259 8.715 18 9.75l-.259-1.035a3.375 3.375 0 0 0-2.455-2.456L14.25 6l1.036-.259a3.375 3.375 0 0 0 2.455-2.456L18 2.25l.259 1.035a3.375 3.375 0 0 0 2.455 2.456L21.75 6l-1.036.259a3.375 3.375 0 0 0-2.455 2.456Z" />
                    </svg>
                  </div>
                  <div>
                    <p className="text-sm font-semibold text-slate-800">Optimize Description</p>
                    <p className="mt-0.5 text-xs text-slate-500 leading-relaxed">
                      Fine-tune the skill's description for better trigger accuracy. Uses automated eval queries to test and iteratively improve how well Claude discovers this skill.
                    </p>
                  </div>
                </div>
              </button>

              {/* Optimize Skill (C2) */}
              <button
                onClick={() => {
                  setShowOptimizeChoice(false);
                  navigate(`/skills/${skill.id}/auto-optimize`, {
                    state: { skill },
                  });
                }}
                className="w-full rounded-xl border border-slate-200 bg-white p-4 text-left hover:border-emerald-300 hover:bg-emerald-50/50 hover:shadow-md transition-all duration-200 group"
              >
                <div className="flex items-start gap-3">
                  <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-lg bg-emerald-50 group-hover:bg-emerald-100 transition-colors">
                    <svg className="h-4.5 w-4.5 text-emerald-600" fill="none" viewBox="0 0 24 24" strokeWidth={2} stroke="currentColor">
                      <path strokeLinecap="round" strokeLinejoin="round" d="M16.023 9.348h4.992v-.001M2.985 19.644v-4.992m0 0h4.992m-4.993 0 3.181 3.183a8.25 8.25 0 0 0 13.803-3.7M4.031 9.865a8.25 8.25 0 0 1 13.803-3.7l3.181 3.182" />
                    </svg>
                  </div>
                  <div>
                    <p className="text-sm font-semibold text-slate-800">Auto Optimize Skill</p>
                    <p className="mt-0.5 text-xs text-slate-500 leading-relaxed">
                      Automatically run test cases, analyze failures, and iteratively improve the skill content. Uses a train/test split to prevent overfitting.
                    </p>
                  </div>
                </div>
              </button>
            </div>

            <div className="mt-4 flex justify-end">
              <button
                onClick={() => setShowOptimizeChoice(false)}
                className="rounded-xl px-4 py-2 text-sm font-medium text-slate-600 hover:bg-slate-100 transition-all duration-200"
              >
                Cancel
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Submit to Marketplace modal (D-06) */}
      {!readOnly && skill && (
        <SubmitToMarketplaceModal
          open={showSubmitModal}
          skillId={skill.id}
          skillName={skill.name}
          currentVersion={viewingVersion ?? skill.version}
          marketplaceVersion={undefined}
          onConfirm={handleMarketplaceSubmit}
          onCancel={() => setShowSubmitModal(false)}
        />
      )}

      {/* Deletion block dialog — shown when delete is guarded by marketplace status */}
      <ConfirmDialog
        open={blockMessage !== null}
        title="Cannot Delete Skill"
        confirmLabel="OK"
        cancelLabel="Dismiss"
        variant="warning"
        onConfirm={() => setBlockMessage(null)}
        onCancel={() => setBlockMessage(null)}
      >
        <p>{blockMessage}</p>
      </ConfirmDialog>

      {/* Removal confirmation dialog */}
      <ConfirmDialog
        open={showRemovalConfirm}
        title="Request Marketplace Removal"
        confirmLabel="Request Removal"
        cancelLabel="Cancel"
        variant="warning"
        onConfirm={() => { void handleRequestRemoval(); }}
        onCancel={() => resetRemovalDialog()}
        confirmDisabled={
          (removalScope === 'version' && !removalTargetId)
        }
      >
        <div className="space-y-3">
          {/* Step 1: Scope */}
          <fieldset className="space-y-2">
            <legend className="text-sm font-medium text-slate-700">What would you like to remove?</legend>
            <label className="flex items-center gap-2 text-sm cursor-pointer">
              <input
                type="radio"
                name="removalScope"
                value="skill"
                checked={removalScope === 'skill'}
                onChange={() => { setRemovalScope('skill'); setRemovalTargetId(''); }}
                className="accent-indigo-600"
              />
              Remove entire skill from marketplace
            </label>
            <label className="flex items-center gap-2 text-sm cursor-pointer">
              <input
                type="radio"
                name="removalScope"
                value="version"
                checked={removalScope === 'version'}
                onChange={() => setRemovalScope('version')}
                className="accent-indigo-600"
              />
              Remove a specific version
            </label>
          </fieldset>

          {removalScope === 'version' && (
            <div>
              <label htmlFor="removal-version-select" className="block text-sm font-medium text-slate-700 mb-1">
                Version to remove <span className="text-red-500">*</span>
              </label>
              <select
                id="removal-version-select"
                className="w-full rounded border border-slate-300 px-3 py-2 text-sm"
                value={removalTargetId}
                onChange={(e) => setRemovalTargetId(e.target.value)}
              >
                <option value="">Select a version…</option>
                {approvedMarketplaceVersions.map((v) => (
                  <option key={v.id} value={v.id}>
                    v{v.version}
                  </option>
                ))}
              </select>
            </div>
          )}

          {/* Step 2: Reason (optional) */}
          <div>
            <label className="block text-sm font-medium text-slate-700 mb-1">
              Reason for removal <span className="text-slate-400 text-xs">(optional)</span>
            </label>
            <textarea
              value={removalReason}
              onChange={(e) => setRemovalReason(e.target.value)}
              placeholder="Explain why you want this skill removed from the marketplace…"
              rows={3}
              className="w-full rounded-lg border border-slate-300 px-3 py-2 text-sm text-slate-800 placeholder-slate-400 focus:border-indigo-400 focus:outline-none focus:ring-2 focus:ring-indigo-200 resize-none"
            />
          </div>

          {removalError && (
            <p className="text-red-600 text-sm">{removalError}</p>
          )}
        </div>
      </ConfirmDialog>

      {/* Tab Bar + inline readiness pipeline */}
      <SkillTabBar
        activeTab={detailView}
        onTabChange={setDetailView}
        skillId={readOnly ? undefined : skill.id}
      />

      {/* Historical version banner */}
      {isViewingHistorical && versionSnapshot && detailView === 'content' && (() => {
        const explanation = versionSnapshot.explanation || '';
        const bullets = explanation.split('• ').map(s => s.trim()).filter(Boolean);
        const hasBullets = bullets.length > 1;
        const summary = bullets[0]
          ? (bullets[0].length > 80 ? bullets[0].slice(0, 80) + '…' : bullets[0])
          : (versionSnapshot.description.slice(0, 60) || 'Snapshot');
        return (
          <div className="border-b border-amber-200/60 bg-amber-50/80">
            <div className="flex items-center gap-3 px-6 py-2.5">
              <div className="flex h-6 w-6 shrink-0 items-center justify-center rounded-lg bg-amber-100">
                <svg className="h-3.5 w-3.5 text-amber-600" fill="none" viewBox="0 0 24 24" strokeWidth={2} stroke="currentColor">
                  <path strokeLinecap="round" strokeLinejoin="round" d="M12 6v6h4.5m4.5 0a9 9 0 1 1-18 0 9 9 0 0 1 18 0Z" />
                </svg>
              </div>
              <span className="text-sm text-amber-800 min-w-0">
                <strong>v{viewingVersion}</strong>
                <span className="mx-1.5 text-amber-400">·</span>
                <span className="text-amber-700">{summary}</span>
                {(hasBullets || bullets[0]?.length > 80) && (
                  <button
                    type="button"
                    onClick={() => setShowVersionNotes(v => !v)}
                    className="ml-2 text-xs font-medium text-amber-600 hover:text-amber-800 underline underline-offset-2"
                  >
                    {showVersionNotes ? 'Hide notes' : 'Show notes'}
                  </button>
                )}
                <span className="ml-2 text-xs text-amber-500">({formatDateWithPrefs(versionSnapshot.createdAt, prefs)})</span>
              </span>
              <button
                type="button"
                onClick={() => navigate(buildSkillPath(skillId))}
                className="ml-auto shrink-0 rounded-lg border border-amber-300 bg-white px-3 py-1 text-xs font-semibold text-amber-800 hover:bg-amber-50 transition-all duration-200"
              >
                Back to v{skill.version}
              </button>
            </div>
            {showVersionNotes && (hasBullets || explanation) && (
              <div className="px-6 pb-3">
                {hasBullets ? (
                  <ul className="space-y-1 text-xs text-amber-800">
                    {bullets.map((b, i) => (
                      <li key={i} className="flex gap-2">
                        <span className="mt-0.5 shrink-0 text-amber-400">•</span>
                        <span>{b}</span>
                      </li>
                    ))}
                  </ul>
                ) : (
                  <p className="text-xs text-amber-800">{explanation}</p>
                )}
              </div>
            )}
          </div>
        );
      })()}

      {/* View Content Area */}
      <div className="flex-1 overflow-hidden">
        {detailView === 'content' && versionSnapshot && (
          <SkillFileBrowser snapshot={versionSnapshot} />
        )}
        {detailView === 'content' && !versionSnapshot && (
          <div className="flex h-full items-center justify-center">
            <div className="h-10 w-10 animate-spin-ease rounded-full border-[3px] border-indigo-200 border-t-indigo-600" />
          </div>
        )}
        {detailView === 'diagram' && (
          <SkillDiagramViewer
            skillId={skill.id}
            version={viewingVersion ?? undefined}
            generateFn={readOnly ? generateSharedDiagram : undefined}
            isOwner={!readOnly}
          />
        )}
        {detailView === 'diff' && (
          <VersionDiffViewer
            skillId={skill.id}
            currentVersion={skill.version}
            pinnedVersion={viewingVersion ?? undefined}
          />
        )}
        {detailView === 'history' && (
          <VersionBrowser
            skillId={skill.id}
            currentVersion={skill.version}
            pinnedVersion={viewingVersion ?? undefined}
          />
        )}
      </div>
    </div>
  );
}
