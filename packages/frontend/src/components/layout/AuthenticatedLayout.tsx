/**
 * Authenticated layout — sidebar + content area.
 *
 * Rendered inside ProtectedRoute (user is guaranteed to be non-null).
 * Manages skills list, export dialog, and global keyboard shortcuts.
 * Child routes are rendered via React Router's <Outlet />.
 */

import { useEffect, useCallback, useState } from 'react';
import { Outlet, useNavigate, useLocation, useParams } from 'react-router';
import type { Skill, SkillSummary } from '@skillspell/shared';
import { buildSkillPath } from '../../utils/parseVersionParam.js';
import { useSkills } from '../../hooks/useSkills.js';
import { useToast } from '../common/ToastContext.js';
import ErrorBoundary from '../common/ErrorBoundary.js';
import TopBar from './TopBar.js';
import ExportDialog from '../export/ExportDialog.js';

export default function AuthenticatedLayout() {
  const navigate = useNavigate();
  const location = useLocation();
  const params = useParams();
  const { skills, loading, error: skillsError, refreshSkills, removeSkill, updateSkillInList } = useSkills();
  const { addToast } = useToast();
  const [exportSkill, setExportSkill] = useState<SkillSummary | null>(null);
  const [exportVersion, setExportVersion] = useState<number | undefined>(undefined);

  // Show toast on skills loading error
  useEffect(() => {
    if (skillsError) {
      addToast('error', skillsError);
    }
  }, [skillsError, addToast]);

  // Derive selectedId from the current URL params
  const selectedSkillId = params.skillId ?? null;

  // ── Navigation callbacks (passed to child routes via Outlet context) ──

  const navigateToSkill = useCallback(
    (skill: SkillSummary) => navigate(`/skills/${skill.id}`),
    [navigate],
  );

  const navigateToBuilder = useCallback(() => navigate('/builder'), [navigate]);
  const navigateHome = useCallback(() => navigate('/'), [navigate]);
  const navigateToProfile = useCallback(() => navigate('/profile/details'), [navigate]);
  const navigateToOrgSettings = useCallback(() => navigate('/admin/organization'), [navigate]);

  const navigateToOptimizer = useCallback(
    (skill: SkillSummary) => navigate(`/optimizer/${skill.id}`, { state: { skill } }),
    [navigate],
  );

  const navigateToTests = useCallback(
    (skillId: string, version?: number) => navigate(buildSkillPath(skillId, version, 'tests')),
    [navigate],
  );

  const onBuilderComplete = useCallback(
    (skill: Skill) => {
      refreshSkills();
      addToast('success', `Skill "${skill.name}" created successfully`);
      navigate(`/skills/${skill.id}`);
    },
    [navigate, refreshSkills, addToast],
  );

  const onOptimizeComplete = useCallback(
    (skill: Skill) => {
      refreshSkills();
      addToast('success', `Skill "${skill.name}" optimized successfully`);
      navigate(`/skills/${skill.id}`);
    },
    [navigate, refreshSkills, addToast],
  );

  const openExport = useCallback((skill: SkillSummary, version?: number) => {
    setExportSkill(skill);
    setExportVersion(version);
  }, []);
  const closeExport = useCallback(() => {
    setExportSkill(null);
    setExportVersion(undefined);
  }, []);

  const handleDelete = useCallback(
    async (id: string) => {
      await removeSkill(id);
      addToast('success', 'Skill deleted successfully');
      navigate('/');
    },
    [removeSkill, addToast, navigate],
  );

  // ── Global keyboard shortcuts ──

  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        if (exportSkill) {
          closeExport();
        } else if (location.pathname === '/builder') {
          navigate('/');
        } else if (location.pathname.startsWith('/optimizer/')) {
          const skillId = params.skillId;
          navigate(skillId ? `/skills/${skillId}` : '/');
        } else if (location.pathname.match(/^\/skills\/(?:v\d+\/)?[^/]+\/tests/)) {
          // Versioned or unversioned tests → back to skill detail (drop version)
          const skillId = params.skillId;
          navigate(skillId ? `/skills/${skillId}` : '/');
        } else if (location.pathname.match(/^\/skills\/(?:v\d+\/)?[^/]+$/)) {
          // Versioned or unversioned skill detail → home
          navigate('/');
        } else if (location.pathname.startsWith('/admin/organization')) {
          navigate('/');
        } else if (location.pathname.startsWith('/profile')) {
          navigate('/');
        } else if (location.pathname === '/skills') {
          navigate('/');
        }
      }
    };

    document.addEventListener('keydown', handleKeyDown);
    return () => document.removeEventListener('keydown', handleKeyDown);
  }, [location.pathname, params.skillId, exportSkill, closeExport, navigate]);

  // ── Outlet context — shared with all child routes ──

  const outletContext: AuthenticatedContext = {
    skills,
    loading,
    selectedSkillId,
    refreshSkills,
    removeSkill: handleDelete,
    updateSkillInList,
    navigateToSkill,
    navigateToBuilder,
    navigateHome,
    navigateToOptimizer,
    navigateToTests,
    navigateToProfile,
    navigateToOrgSettings,
    onBuilderComplete,
    onOptimizeComplete,
    openExport,
    closeExport,
  };

  return (
    <div className="flex flex-col h-screen overflow-hidden bg-slate-50">
      {/* Top navigation bar */}
      <TopBar
        onCreateNew={navigateToBuilder}
        onTitleClick={navigateHome}
        onNavigateProfile={navigateToProfile}
        onNavigateOrgSettings={navigateToOrgSettings}
      />

      {/* Main content area */}
      <main className="flex-1 overflow-auto bg-slate-50">
        <ErrorBoundary>
          <Outlet context={outletContext} />
        </ErrorBoundary>
      </main>

      {/* Export dialog (modal overlay) */}
      {exportSkill && (
        <ExportDialog skill={exportSkill} version={exportVersion} onClose={closeExport} />
      )}
    </div>
  );
}

// ── Context type — used by child routes via useOutletContext() ──

export interface AuthenticatedContext {
  skills: SkillSummary[];
  loading: boolean;
  selectedSkillId: string | null;
  refreshSkills: () => void;
  removeSkill: (id: string) => Promise<void>;
  updateSkillInList: (id: string, data: Partial<SkillSummary>) => void;
  navigateToSkill: (skill: SkillSummary) => void;
  navigateToBuilder: () => void;
  navigateHome: () => void;
  navigateToOptimizer: (skill: SkillSummary) => void;
  navigateToTests: (skillId: string, version?: number) => void;
  navigateToProfile: () => void;
  navigateToOrgSettings: () => void;
  onBuilderComplete: (skill: Skill) => void;
  onOptimizeComplete: (skill: Skill) => void;
  openExport: (skill: SkillSummary, version?: number) => void;
  closeExport: () => void;
}
