import type { AdminSubmissionPreview } from '../services/api/marketplace.js';
import type { SkillVersionSnapshot } from '@skillspell/shared';

export function adminSubmissionToSnapshot(preview: AdminSubmissionPreview): SkillVersionSnapshot {
  return {
    skillId: preview.skillId,
    version: parseInt(preview.version, 10),
    description: preview.skillName ?? preview.description ?? '',
    skillContent: preview.skillContent,
    scripts: preview.scripts,
    references: preview.references,
    assets: preview.assets,
    createdAt: preview.snapshotCreatedAt ?? preview.submittedAt,
  };
}
