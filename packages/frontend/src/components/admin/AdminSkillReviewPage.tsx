import { useState, useEffect, useCallback } from 'react';
import { useParams, useNavigate } from 'react-router';
import type { EvalBenchmark, SkillVersionSnapshot } from '@skillspell/shared';
import {
  getAdminSubmissionPreview,
  getAdminApprovedVersions,
  approveSubmission,
  rejectSubmission,
  type AdminSubmissionPreview,
} from '../../services/api/marketplace.js';
import { fetchBenchmark, fetchEvalRuns } from '../../services/api/evals.js';
import { adminSubmissionToSnapshot } from '../../utils/adminSubmissionAdapter.js';
import AdminReviewHeader from './AdminReviewHeader.js';
import AdminReviewTabBar, { type AdminReviewView } from './AdminReviewTabBar.js';
import SkillViewer from '../skills/SkillViewer.js';
import SubmissionRequirementsChecklist from '../skills/SubmissionRequirementsChecklist.js';
import { EvalViewer } from '../eval/EvalViewer.js';
import { EvalBenchmarkTab } from '../eval/EvalBenchmarkTab.js';
import VersionDiffViewer from '../skills/VersionDiffViewer.js';
import { useToast } from '../common/ToastContext.js';

export default function AdminSkillReviewPage() {
  const { submissionId } = useParams<{ submissionId: string }>();
  const navigate = useNavigate();
  const { addToast } = useToast();

  const [preview, setPreview] = useState<AdminSubmissionPreview | null>(null);
  const [snapshot, setSnapshot] = useState<SkillVersionSnapshot | null>(null);
  const [previousApprovedVersion, setPreviousApprovedVersion] = useState<number | null>(null);
  const [benchmark, setBenchmark] = useState<EvalBenchmark | null>(null);
  const [benchmarkLoading, setBenchmarkLoading] = useState(true);
  const [evalRunCount, setEvalRunCount] = useState(0);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [activeTab, setActiveTab] = useState<AdminReviewView>('skill');

  useEffect(() => {
    if (!submissionId) return;

    let cancelled = false;

    async function load() {
      setLoading(true);
      setError(null);
      try {
        const p = await getAdminSubmissionPreview(submissionId!);
        if (cancelled) return;

        setPreview(p);
        setSnapshot(adminSubmissionToSnapshot(p));

        const submittedVersion = parseInt(p.version, 10);

        // Find the currently published marketplace version (for diff tab).
        // Works for both upgrades and downgrades — compare live vs submitted regardless of direction.
        getAdminApprovedVersions(p.skillId)
          .then(versions => {
            if (cancelled) return;
            const parsed = versions
              .filter(mv => mv.version != null)
              .map(mv => parseInt(mv.version!, 10))
              .filter(v => v > 0 && v !== submittedVersion);
            // Pick the highest approved version that isn't the submitted one
            const liveVersion = parsed.sort((a, b) => b - a)[0] ?? null;
            setPreviousApprovedVersion(liveVersion);
          })
          .catch(() => { /* non-critical — diff tab stays hidden */ });

        // Fetch benchmark for submitted version
        fetchBenchmark(p.skillId, submittedVersion)
          .then(b => {
            if (cancelled) return;
            setBenchmark(b);
          })
          .catch(() => { if (!cancelled) setBenchmark(null); })
          .finally(() => { if (!cancelled) setBenchmarkLoading(false); });

        // WR-011: fetch actual eval run count for the submitted version so the
        // eval tab badge shows a real number instead of a hardcoded 0.
        fetchEvalRuns(p.skillId, submittedVersion)
          .then(runs => { if (!cancelled) setEvalRunCount(runs.length); })
          .catch(() => { /* non-critical — badge stays at 0 on error */ });

      } catch (err) {
        if (!cancelled) setError(err instanceof Error ? err.message : 'Failed to load submission');
      } finally {
        if (!cancelled) {
          setLoading(false);
        }
      }
    }

    load();
    return () => { cancelled = true; };
  }, [submissionId]);

  const handleApprove = useCallback(async (reviewNote: string) => {
    if (!submissionId) return;
    try {
      await approveSubmission(submissionId, reviewNote || undefined);
      addToast('success', 'Skill approved');
      navigate('/admin/organization/marketplace-submissions');
    } catch (err) {
      addToast('error', err instanceof Error ? err.message : 'Approve failed');
    }
  }, [submissionId, navigate, addToast]);

  const handleReject = useCallback(async (reviewNote: string) => {
    if (!submissionId) return;
    try {
      await rejectSubmission(submissionId, reviewNote || undefined);
      addToast('success', 'Skill rejected');
      navigate('/admin/organization/marketplace-submissions');
    } catch (err) {
      addToast('error', err instanceof Error ? err.message : 'Reject failed');
    }
  }, [submissionId, navigate, addToast]);

  const handleBack = () => navigate('/admin/organization/marketplace-submissions');

  if (loading) {
    return (
      <div className="flex items-center justify-center h-full text-slate-400 text-sm">
        Loading submission…
      </div>
    );
  }

  if (error || !preview || !snapshot) {
    return (
      <div className="flex flex-col items-center justify-center h-full gap-3">
        <p className="text-red-500 text-sm">{error ?? 'Submission not found'}</p>
        <button type="button" onClick={handleBack} className="text-sm text-indigo-600 hover:underline">
          ← Back to Marketplace Submissions
        </button>
      </div>
    );
  }

  const submittedVersion = parseInt(preview.version, 10);

  return (
    <div className="flex flex-col h-full overflow-hidden">
      <AdminReviewHeader
        skillName={preview.skillName}
        status={preview.status}
        submitterName={preview.submitterName}
        submittedAt={preview.submittedAt}
        version={preview.version}
        onBack={handleBack}
        onApprove={handleApprove}
        onReject={handleReject}
      />

      <AdminReviewTabBar
        activeTab={activeTab}
        onTabChange={setActiveTab}
        showDiff={previousApprovedVersion !== null}
        previousVersion={previousApprovedVersion}
        submittedVersion={submittedVersion}
        evalRunCount={evalRunCount}
      />

      {preview.submitterNote && (
        <div className="shrink-0 border-b border-amber-200 bg-amber-50 px-5 py-3 text-sm text-amber-800">
          <span className="font-semibold">Submitter note: </span>
          {preview.submitterNote}
        </div>
      )}

      <div className="flex-1 overflow-auto">
        {activeTab === 'skill' && (
          <div className="h-full flex flex-col">
            {preview.requirementsMet != null ? (
              <section className="mb-6 shrink-0 px-5 pt-5">
                <SubmissionRequirementsChecklist
                  requirements={preview.requirementsMet}
                  note="Requirements checked at time of submission."
                />
              </section>
            ) : (
              <section className="mb-6 shrink-0 px-5 pt-5">
                <p className="text-sm text-gray-500 italic">
                  Requirements not captured — submitted before this feature was introduced.
                </p>
              </section>
            )}
            <div className="flex-1 overflow-auto">
              <SkillViewer snapshot={snapshot} skillId={preview.skillId} isOwner={false} />
            </div>
          </div>
        )}

        {activeTab === 'diff' && previousApprovedVersion !== null && (
          <VersionDiffViewer
            skillId={preview.skillId}
            pinnedVersion={previousApprovedVersion}
            currentVersion={submittedVersion}
            locked
          />
        )}

        {activeTab === 'evals' && (
          <EvalViewer skillId={preview.skillId} selectedVersion={submittedVersion} />
        )}

        {activeTab === 'benchmark' && (
          <EvalBenchmarkTab
            benchmark={benchmark}
            isLoading={benchmarkLoading}
            selectedVersion={submittedVersion}
          />
        )}
      </div>
    </div>
  );
}
