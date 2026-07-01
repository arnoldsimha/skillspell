import React, { useState } from 'react';
import type {
  MarketplaceListItem,
  MarketplaceVersion,
} from '../../services/api/marketplace';
import {
  getMarketplaceVersions,
  removeMarketplaceVersion,
} from '../../services/api/marketplace';
import ConfirmDialog from '../common/ConfirmDialog.js';
import { Button } from '../common/Button.js';
import { useUserPreferences } from '../../hooks/useUserPreferences.js';
import { formatDateWithPrefs } from '../../utils/formatDate.js';

interface Props {
  skill: MarketplaceListItem;
  onSkillRemove: (skillId: string) => void;
}

export function ApprovedSkillRow({ skill, onSkillRemove }: Props) {
  const { prefs } = useUserPreferences();
  const [expanded, setExpanded] = useState(false);
  const [versions, setVersions] = useState<MarketplaceVersion[]>([]);
  const [loadingVersions, setLoadingVersions] = useState(false);
  const [removingVersion, setRemovingVersion] = useState<Set<string>>(new Set());
  const [versionErrors, setVersionErrors] = useState<Record<string, string>>({});
  const [confirmVersion, setConfirmVersion] = useState<MarketplaceVersion | null>(null);

  const loadVersions = async () => {
    if (versions.length > 0) {
      setExpanded((e) => !e);
      return;
    }
    setLoadingVersions(true);
    try {
      const vs = await getMarketplaceVersions(skill.skillId);
      setVersions(vs);
      setExpanded(true);
    } catch {
      setVersionErrors((prev) => ({ ...prev, _load: 'Failed to load versions.' }));
    } finally {
      setLoadingVersions(false);
    }
  };

  const handleRemoveVersion = async (v: MarketplaceVersion) => {
    setConfirmVersion(null);
    setRemovingVersion((prev) => new Set(prev).add(v.id));
    try {
      await removeMarketplaceVersion(v.id);
      const remaining = versions.filter((x) => x.id !== v.id);
      if (remaining.length === 0) {
        onSkillRemove(skill.skillId);
      } else {
        setVersions(remaining);
      }
    } catch {
      setVersionErrors((prev) => ({ ...prev, [v.id]: 'Remove failed. Please try again.' }));
    } finally {
      setRemovingVersion((prev) => {
        const s = new Set(prev);
        s.delete(v.id);
        return s;
      });
    }
  };

  return (
    <>
      <tr className="hover:bg-slate-50 transition-colors">
        <td className="px-4 py-3 text-sm font-medium text-slate-800">{skill.name}</td>
        <td className="px-4 py-3 text-sm text-slate-600">v{skill.version}</td>
        <td className="px-4 py-3 text-sm text-slate-600">{skill.downloadCount ?? 0}</td>
        <td className="px-4 py-3 text-sm text-slate-500">
          {skill.reviewedAt ? formatDateWithPrefs(skill.reviewedAt, prefs) : '—'}
        </td>
        <td className="px-4 py-3">
          <div className="flex items-center gap-2">
            <Button
              type="button"
              onClick={loadVersions}
              variant="secondary"
              size="xs"
            >
              {loadingVersions ? '…' : expanded ? 'Hide Versions' : 'Show Versions'}
            </Button>
            <Button
              type="button"
              onClick={() => onSkillRemove(skill.skillId)}
              variant="destructive-outline"
              size="xs"
            >
              Remove from Marketplace
            </Button>
          </div>
        </td>
      </tr>

      {expanded && versions.map((v) => (
        <React.Fragment key={v.id}>
          <tr className="bg-slate-50">
            <td className="px-4 py-2 pl-10 text-sm text-slate-600">
              v{v.version ?? '—'}
            </td>
            <td className="px-4 py-2 text-sm text-slate-500">
              {formatDateWithPrefs(v.reviewedAt ?? v.submittedAt, prefs)}
            </td>
            <td className="px-4 py-2 text-sm text-slate-600">{v.downloadCount}</td>
            <td className="px-4 py-2" colSpan={2}>
              <Button
                type="button"
                disabled={removingVersion.has(v.id)}
                onClick={() => setConfirmVersion(v)}
                variant="destructive-outline"
                size="xs"
              >
                {removingVersion.has(v.id) ? '…' : 'Remove Version'}
              </Button>
              {versionErrors[v.id] && (
                <p className="mt-1 text-xs text-red-600">{versionErrors[v.id]}</p>
              )}
            </td>
          </tr>
        </React.Fragment>
      ))}

      {versionErrors['_load'] && (
        <tr>
          <td colSpan={5} className="px-4 py-2">
            <p className="text-xs text-red-600">{versionErrors['_load']}</p>
          </td>
        </tr>
      )}

      <ConfirmDialog
        open={confirmVersion !== null}
        title={`Remove v${confirmVersion?.version ?? ''} from the marketplace?`}
        variant="danger"
        onConfirm={() => confirmVersion && handleRemoveVersion(confirmVersion)}
        onCancel={() => setConfirmVersion(null)}
      >
        {versions.length === 1
          ? `This is the only version. Removing it will remove ${skill.name} from the marketplace entirely.`
          : `Users will no longer be able to download v${confirmVersion?.version ?? ''}. The listing will fall back to the previous version.`}
      </ConfirmDialog>
    </>
  );
}
