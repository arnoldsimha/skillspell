/**
 * Route wrappers for skill-related pages.
 *
 * Each wrapper reads route params and outlet context, then passes
 * the correct props to the underlying component. This keeps the
 * actual components decoupled from React Router.
 */

import { useState, useEffect, lazy } from 'react';
import { useOutletContext, useParams, useNavigate, useLocation } from 'react-router';
import type { AuthenticatedContext } from '../components/layout/AuthenticatedLayout.js';
import type { SkillSummary } from '@skillspell/shared';
import { fetchSkillMetadata } from '../services/api/skills.js';
import { resolveSharedSkill, downloadSharedSkillZip, generateSharedDiagram, type SharedSkillResponse } from '../services/api/sharing.js';
import { Button } from '../components/common/Button.js';

import NotFoundPage from '../components/common/NotFoundPage.js';
import ExportDialog from '../components/export/ExportDialog.js';
import type { ExportFormat } from '@skillspell/shared';
import { parseVersionParam, buildSkillPath } from '../utils/parseVersionParam.js';
import SkillDetail from '../components/skills/SkillDetail.js';
import SkillViewer from '../components/skills/SkillViewer.js';
import SkillTestsPage from '../components/skills/SkillTestsPage.js';
import SkillsGrid from '../components/skills/SkillsGrid.js';
import SkillBuilder from '../components/builder/SkillBuilder.js';

const SkillOptimizer = lazy(() => import('../components/optimizer/SkillOptimizer.js'));
const DescriptionOptimizer = lazy(() => import('../components/optimizer/DescriptionOptimizer.js'));
const SkillContentOptimizer = lazy(() => import('../components/optimizer/SkillContentOptimizer.js'));

// ─── Skills Grid ────────────────────────────────────────────────────────

export function SkillsGridPage() {
  const { skills, loading, navigateToSkill, navigateToBuilder } =
    useOutletContext<AuthenticatedContext>();

  return (
    <SkillsGrid
      skills={skills}
      loading={loading}
      onSelectSkill={navigateToSkill}
      onCreateNew={navigateToBuilder}
    />
  );
}

// ─── Skill Detail ───────────────────────────────────────────────────────

export function SkillDetailPage() {
  const { skillId, version: versionParam } = useParams<{ skillId: string; version?: string }>();
  const pinnedVersion = parseVersionParam(versionParam);
  const {
    navigateToOptimizer,
    openExport,
    removeSkill,
    updateSkillInList,
    navigateToTests,
  } = useOutletContext<AuthenticatedContext>();
  const navigate = useNavigate();

  if (!skillId) return null;

  return (
    <SkillDetail
      skillId={skillId}
      pinnedVersion={pinnedVersion}
      onOptimize={navigateToOptimizer}
      onExport={openExport}
      onDelete={removeSkill}
      onBack={() => navigate('/')}
      onUpdate={(skill) => updateSkillInList(skill.id, { name: skill.name, description: skill.description })}
      onTests={navigateToTests}
    />
  );
}

// ─── Skill Tests ────────────────────────────────────────────────────────

export function SkillTestsPageWrapper() {
  const { skillId, version: versionParam } = useParams<{ skillId: string; version?: string }>();
  const pinnedVersion = parseVersionParam(versionParam);
  const { updateSkillInList } = useOutletContext<AuthenticatedContext>();
  const navigate = useNavigate();

  if (!skillId) return null;

  return (
    <SkillTestsPage
      skillId={skillId}
      pinnedVersion={pinnedVersion}
      onBack={() => navigate(buildSkillPath(skillId, pinnedVersion))}
      onUpdate={(skill) => updateSkillInList(skill.id, { name: skill.name, description: skill.description })}
      onOptimize={(skill) => navigate(`/skills/${skill.id}/auto-optimize`, { state: { skill } })}
    />
  );
}

// ─── Skill Builder ──────────────────────────────────────────────────────

export function SkillBuilderPage() {
  const { onBuilderComplete, refreshSkills } =
    useOutletContext<AuthenticatedContext>();
  const navigate = useNavigate();

  return (
    <SkillBuilder
      onComplete={onBuilderComplete}
      onCancel={() => navigate('/')}
      onSkillSaved={refreshSkills}
    />
  );
}

// ─── Description Optimizer ──────────────────────────────────────────────

export function DescriptionOptimizerPage() {
  const { skillId } = useParams<{ skillId: string }>();
  const { refreshSkills } = useOutletContext<AuthenticatedContext>();
  const navigate = useNavigate();
  const location = useLocation();

  // The skill metadata is passed via navigation state (lightweight SkillSummary)
  const skill = (location.state as { skill?: SkillSummary } | null)?.skill ?? null;

  if (!skillId) return null;

  // If no skill in state (e.g. direct URL access), redirect to detail page
  if (!skill) {
    return (
      <div className="flex h-full flex-col items-center justify-center gap-4">
        <div className="flex h-12 w-12 items-center justify-center rounded-xl bg-slate-100">
          <svg className="h-6 w-6 text-slate-400" fill="none" viewBox="0 0 24 24" strokeWidth={1.5} stroke="currentColor">
            <path strokeLinecap="round" strokeLinejoin="round" d="M12 9v3.75m9-.75a9 9 0 1 1-18 0 9 9 0 0 1 18 0Zm-9 3.75h.008v.008H12v-.008Z" />
          </svg>
        </div>
        <p className="text-sm text-slate-500">
          Navigate to the skill detail page to optimize its description.
        </p>
        <Button
          type="button"
          onClick={() => navigate(`/skills/${skillId}`)}
          variant="primary"
          size="md"
        >
          Go to Skill
        </Button>
      </div>
    );
  }

  return (
    <DescriptionOptimizer
      skill={skill}
      onComplete={() => {
        refreshSkills();
        navigate(`/skills/${skillId}`);
      }}
      onCancel={() => navigate(`/skills/${skillId}`)}
    />
  );
}

// ─── Skill Optimizer ────────────────────────────────────────────────────

export function SkillOptimizerPage() {
  const { skillId } = useParams<{ skillId: string }>();
  const { onOptimizeComplete, refreshSkills } =
    useOutletContext<AuthenticatedContext>();
  const navigate = useNavigate();
  const location = useLocation();

  // The skill metadata is passed via navigation state (lightweight SkillSummary)
  const skill = (location.state as { skill?: SkillSummary } | null)?.skill ?? null;

  if (!skillId) return null;

  // If no skill in state (e.g. direct URL access), redirect to detail page
  // so user can click "Optimize" from there.
  if (!skill) {
    return (
      <div className="flex h-full flex-col items-center justify-center gap-4">
        <div className="flex h-12 w-12 items-center justify-center rounded-xl bg-slate-100">
          <svg className="h-6 w-6 text-slate-400" fill="none" viewBox="0 0 24 24" strokeWidth={1.5} stroke="currentColor">
            <path strokeLinecap="round" strokeLinejoin="round" d="M12 9v3.75m9-.75a9 9 0 1 1-18 0 9 9 0 0 1 18 0Zm-9 3.75h.008v.008H12v-.008Z" />
          </svg>
        </div>
        <p className="text-sm text-slate-500">
          Navigate to the skill detail page to start optimizing.
        </p>
        <Button
          type="button"
          onClick={() => navigate(`/skills/${skillId}`)}
          variant="primary"
          size="md"
        >
          Go to Skill
        </Button>
      </div>
    );
  }

  return (
    <SkillOptimizer
      skill={skill}
      onComplete={onOptimizeComplete}
      onCancel={() => navigate(`/skills/${skillId}`)}
      onSkillSaved={refreshSkills}
    />
  );
}

// ─── Skill Content Optimizer (C2) ───────────────────────────────────────

export function SkillContentOptimizerPage() {
  const { skillId } = useParams<{ skillId: string }>();
  const { refreshSkills } = useOutletContext<AuthenticatedContext>();
  const navigate = useNavigate();
  const location = useLocation();

  // Use location.state if available (navigated from tests page), otherwise fetch from API
  const stateSkill = (location.state as { skill?: SkillSummary } | null)?.skill ?? null;
  const [skill, setSkill] = useState<SkillSummary | null>(stateSkill);
  const [loading, setLoading] = useState(!stateSkill);

  useEffect(() => {
    if (stateSkill || !skillId) return;
    setLoading(true);
    fetchSkillMetadata(skillId)
      .then(setSkill)
      .catch(() => setSkill(null))
      .finally(() => setLoading(false));
  }, [skillId, stateSkill]);

  if (!skillId) return null;

  if (loading) {
    return (
      <div className="flex h-full items-center justify-center">
        <div className="h-6 w-6 animate-spin rounded-full border-2 border-indigo-200 border-t-indigo-600" />
      </div>
    );
  }

  if (!skill) {
    return (
      <div className="flex h-full flex-col items-center justify-center gap-4">
        <div className="flex h-12 w-12 items-center justify-center rounded-xl bg-slate-100">
          <svg className="h-6 w-6 text-slate-400" fill="none" viewBox="0 0 24 24" strokeWidth={1.5} stroke="currentColor">
            <path strokeLinecap="round" strokeLinejoin="round" d="M12 9v3.75m9-.75a9 9 0 1 1-18 0 9 9 0 0 1 18 0Zm-9 3.75h.008v.008H12v-.008Z" />
          </svg>
        </div>
        <p className="text-sm text-slate-500">
          Skill not found. Navigate to the skill tests page to start auto-optimization.
        </p>
        <Button
          type="button"
          onClick={() => navigate(`/skills/${skillId}/tests`)}
          variant="primary"
          size="md"
        >
          Go to Tests
        </Button>
      </div>
    );
  }

  return (
    <SkillContentOptimizer
      skill={skill}
      onComplete={() => {
        refreshSkills();
        navigate(`/skills/${skillId}/tests`);
      }}
      onCancel={() => navigate(`/skills/${skillId}/tests`)}
    />
  );
}

// ─── Shared Skill (read-only) ────────────────────────────────────────────────

/**
 * Page for /skills/share/:skillId/:version (e.g. /skills/share/uuid/v2)
 *
 * Resolves the shared skill from the API and renders SkillDetail in readOnly mode.
 * Uses a share-scoped export endpoint (org-gated, not ownership-gated).
 * Requires authentication (enforced by ProtectedRoute). Returns 403 if private.
 */
export function SharedSkillPage() {
  const { skillId, version: versionParam } = useParams<{ skillId: string; version: string }>();

  const [loading, setLoading] = useState(true);
  const [errorReason, setErrorReason] = useState<'private' | 'not-found' | null>(null);
  const [sharedData, setSharedData] = useState<SharedSkillResponse | null>(null);
  const [exportDialogVersion, setExportDialogVersion] = useState<number | undefined>();

  useEffect(() => {
    if (!skillId || !versionParam) return;
    const version = parseVersionParam(versionParam);
    if (!version) { setErrorReason('not-found'); setLoading(false); return; }

    resolveSharedSkill(skillId, version)
      .then((res) => setSharedData(res))
      .catch(() => setErrorReason('not-found'))
      .finally(() => setLoading(false));
  }, [skillId, versionParam]);

  if (loading) {
    return (
      <div className="flex h-full items-center justify-center">
        <div className="h-6 w-6 animate-spin rounded-full border-2 border-indigo-200 border-t-indigo-600" />
      </div>
    );
  }

  if (errorReason || !sharedData || !skillId || !versionParam) {
    return (
      <NotFoundPage
        subtitle="Skill Not Found"
        message="This skill link is no longer valid. It may have been deleted or the link is incorrect."
      />
    );
  }

  const version = parseVersionParam(versionParam)!;
  const preloadedSkill: SkillSummary = {
    id: skillId,
    ownerId: '',
    name: sharedData.name,
    description: sharedData.description,
    status: 'ready',
    version,
    isPublished: true,
    createdAt: sharedData.snapshot.createdAt,
    updatedAt: sharedData.snapshot.createdAt,
  };

  return (
    <div className="flex flex-col h-full">
      {/* Shared skill header */}
      <div className="flex items-center gap-4 border-b border-slate-200/80 bg-white px-6 py-4 shrink-0">
        <div className="flex-1 min-w-0">
          <h1 className="text-lg font-semibold text-slate-800 truncate">{sharedData.name}</h1>
          {sharedData.description && (
            <p className="mt-0.5 text-sm text-slate-500 truncate">{sharedData.description}</p>
          )}
        </div>
        <Button
          type="button"
          onClick={() => setExportDialogVersion(version)}
          variant="secondary"
          size="md"
          className="shrink-0"
          leftIcon={
            <svg className="h-4 w-4" fill="none" viewBox="0 0 24 24" strokeWidth={2} stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" d="M3 16.5v2.25A2.25 2.25 0 005.25 21h13.5A2.25 2.25 0 0021 18.75V16.5M16.5 12L12 16.5m0 0L7.5 12m4.5 4.5V3" />
            </svg>
          }
        >
          Export
        </Button>
      </div>

      <SkillViewer
        snapshot={sharedData.snapshot}
        skillId={skillId}
        diagramFn={(id, force, ver) => generateSharedDiagram(id, force, ver ?? version)}
        isOwner={false}
        className="flex flex-col flex-1 min-h-0"
      />

      {exportDialogVersion !== undefined && (
        <ExportDialog
          skill={preloadedSkill}
          version={exportDialogVersion}
          onClose={() => setExportDialogVersion(undefined)}
          exportFn={(format: ExportFormat, ver?: number) =>
            downloadSharedSkillZip(skillId, ver ?? version, format)
          }
        />
      )}
    </div>
  );
}
