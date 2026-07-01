export type AdminReviewView = 'skill' | 'diff' | 'evals' | 'benchmark';

interface AdminReviewTabBarProps {
  activeTab: AdminReviewView;
  onTabChange: (tab: AdminReviewView) => void;
  showDiff: boolean;
  previousVersion: number | null;
  submittedVersion: number;
  evalRunCount: number;
}

export default function AdminReviewTabBar({
  activeTab,
  onTabChange,
  showDiff,
  previousVersion,
  submittedVersion,
  evalRunCount,
}: AdminReviewTabBarProps) {
  const tabClass = (key: AdminReviewView) =>
    `flex items-center gap-1.5 whitespace-nowrap border-b-2 px-3.5 py-3 text-sm font-medium transition-all duration-200 ${
      activeTab === key
        ? 'border-indigo-500 text-indigo-600'
        : 'border-transparent text-slate-500 hover:text-slate-700 hover:border-slate-300'
    }`;

  return (
    <div className="flex items-center border-b border-slate-200/80 bg-white px-6">
      <div className="flex items-center gap-1 overflow-x-auto -mb-px">
        <button type="button" className={tabClass('skill')} onClick={() => onTabChange('skill')}>
          Skill
        </button>

        {showDiff && (
          <button type="button" className={tabClass('diff')} onClick={() => onTabChange('diff')}>
            Diff
            {previousVersion != null && (
              <span className={`ml-1 text-xs px-1.5 py-0.5 rounded-full ${
                submittedVersion < previousVersion
                  ? 'bg-amber-100 text-amber-700'
                  : 'bg-slate-100 text-slate-500'
              }`}>
                v{previousVersion} → v{submittedVersion}
                {submittedVersion < previousVersion && ' ↓'}
              </span>
            )}
          </button>
        )}

        <button type="button" className={tabClass('evals')} onClick={() => onTabChange('evals')}>
          Evals
          {evalRunCount > 0 && (
            <span className="ml-1 text-xs bg-slate-100 text-slate-500 px-1.5 py-0.5 rounded-full">
              {evalRunCount}
            </span>
          )}
        </button>

        <button type="button" className={tabClass('benchmark')} onClick={() => onTabChange('benchmark')}>
          Benchmark
        </button>
      </div>
    </div>
  );
}
