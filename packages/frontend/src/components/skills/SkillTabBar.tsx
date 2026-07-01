import { SkillReadinessBar } from './SkillReadinessBar.js';

/** The different views available in the skill detail page. */
export type SkillDetailView = 'content' | 'diff' | 'history' | 'diagram' | 'tests';

interface Tab {
  key: SkillDetailView;
  label: string;
  icon: React.ReactNode;
}

const TABS: Tab[] = [
  {
    key: 'content',
    label: 'Content',
    icon: (
      <svg className="h-4 w-4" fill="none" viewBox="0 0 24 24" strokeWidth={2} stroke="currentColor">
        <path strokeLinecap="round" strokeLinejoin="round" d="M19.5 14.25v-2.625a3.375 3.375 0 0 0-3.375-3.375h-1.5A1.125 1.125 0 0 1 13.5 7.125v-1.5a3.375 3.375 0 0 0-3.375-3.375H8.25m2.25 0H5.625c-.621 0-1.125.504-1.125 1.125v17.25c0 .621.504 1.125 1.125 1.125h12.75c.621 0 1.125-.504 1.125-1.125V11.25a9 9 0 0 0-9-9Z" />
      </svg>
    ),
  },
  {
    key: 'diagram',
    label: 'Diagram',
    icon: (
      <svg className="h-4 w-4" fill="none" viewBox="0 0 24 24" strokeWidth={2} stroke="currentColor">
        <path strokeLinecap="round" strokeLinejoin="round" d="M3.75 6A2.25 2.25 0 0 1 6 3.75h2.25A2.25 2.25 0 0 1 10.5 6v2.25a2.25 2.25 0 0 1-2.25 2.25H6a2.25 2.25 0 0 1-2.25-2.25V6ZM3.75 15.75A2.25 2.25 0 0 1 6 13.5h2.25a2.25 2.25 0 0 1 2.25 2.25V18a2.25 2.25 0 0 1-2.25 2.25H6A2.25 2.25 0 0 1 3.75 18v-2.25ZM13.5 6a2.25 2.25 0 0 1 2.25-2.25H18A2.25 2.25 0 0 1 20.25 6v2.25A2.25 2.25 0 0 1 18 10.5h-2.25a2.25 2.25 0 0 1-2.25-2.25V6ZM13.5 15.75a2.25 2.25 0 0 1 2.25-2.25H18a2.25 2.25 0 0 1 2.25 2.25V18A2.25 2.25 0 0 1 18 20.25h-2.25a2.25 2.25 0 0 1-2.25-2.25v-2.25Z" />
      </svg>
    ),
  },
];

interface SkillTabBarProps {
  activeTab: SkillDetailView;
  onTabChange: (tab: SkillDetailView) => void;
  /** When provided, renders the readiness pipeline inline on the right. */
  skillId?: string;
}

/**
 * Tab bar for the skill detail page.
 * Left: navigation tabs (Content, Diagram)
 * Right: readiness pipeline (Generated → Test Cases → Eval → Optimized)
 */
export default function SkillTabBar({
  activeTab,
  onTabChange,
  skillId,
}: SkillTabBarProps) {
  return (
    <div className="flex items-center border-b border-slate-200/80 bg-white px-6">
      {/* Tabs */}
      <div className="flex items-center gap-1 overflow-x-auto -mb-px">
        {TABS.map((tab) => {
          const isActive = activeTab === tab.key;
          return (
            <button
              key={tab.key}
              type="button"
              onClick={() => onTabChange(tab.key)}
              className={`flex items-center gap-1.5 whitespace-nowrap border-b-2 px-3.5 py-3 text-sm font-medium transition-all duration-200 ${
                isActive
                  ? 'border-indigo-500 text-indigo-600'
                  : 'border-transparent text-slate-500 hover:text-slate-700 hover:border-slate-300'
              }`}
            >
              <span className={isActive ? 'text-indigo-500' : 'text-slate-400'}>{tab.icon}</span>
              {tab.label}
            </button>
          );
        })}
      </div>

      {/* Right side: readiness pipeline */}
      {skillId && (
        <div className="ml-auto flex items-center py-2 pl-4 border-l border-slate-200/80">
          <SkillReadinessBar skillId={skillId} inline />
        </div>
      )}
    </div>
  );
}
