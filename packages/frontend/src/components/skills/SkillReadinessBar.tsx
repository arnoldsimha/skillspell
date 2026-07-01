import { useState, useEffect } from 'react';
import { fetchEvalCases, fetchEvalRuns } from '../../services/api/evals.js';

interface SkillReadinessBarProps {
  skillId: string;
  /** When true, renders steps inline without the container row wrapper. */
  inline?: boolean;
}

type StepKey = 'generated' | 'test-cases' | 'eval' | 'optimized';

const STEPS: { key: StepKey; label: string }[] = [
  { key: 'generated', label: 'Generated' },
  { key: 'test-cases', label: 'Test Cases' },
  { key: 'eval', label: 'Eval' },
  { key: 'optimized', label: 'Optimized' },
];

interface ReadinessData {
  hasTestCases: boolean;
  hasEvalRuns: boolean;
  hasOptimizationRuns: boolean;
}

function isStepDone(key: StepKey, r: ReadinessData): boolean {
  switch (key) {
    case 'generated': return true;
    case 'test-cases': return r.hasTestCases;
    case 'eval': return r.hasEvalRuns;
    case 'optimized': return r.hasOptimizationRuns;
  }
}

export function SkillReadinessBar({ skillId, inline = false }: SkillReadinessBarProps) {
  const [readiness, setReadiness] = useState<ReadinessData | null>(null);

  useEffect(() => {
    let cancelled = false;
    Promise.all([fetchEvalCases(skillId), fetchEvalRuns(skillId)])
      .then(([cases, runs]) => {
        if (cancelled) return;
        setReadiness({
          hasTestCases: cases.length > 0,
          hasEvalRuns: runs.length > 0,
          hasOptimizationRuns: runs.some((r) => r.iteration !== undefined),
        });
      })
      .catch(() => {});
    return () => { cancelled = true; };
  }, [skillId]);

  if (!readiness) return null;

  const steps = (
    <div className="flex items-center gap-1.5">
      {STEPS.map((step, idx) => {
        const done = isStepDone(step.key, readiness);
        return (
          <div key={step.key} className="flex items-center gap-1.5">
            {idx > 0 && (
              <div className={`h-px w-4 ${done ? 'bg-indigo-300' : 'bg-slate-200'}`} />
            )}
            <div
              className={[
                'flex items-center gap-1 rounded-full px-2 py-0.5 text-xs font-semibold',
                done ? 'bg-indigo-100 text-indigo-700' : 'bg-slate-100 text-slate-400',
              ].join(' ')}
            >
              {done ? (
                <svg className="h-3 w-3 text-indigo-500" viewBox="0 0 12 12" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round">
                  <path d="M2 6l3 3 5-5" />
                </svg>
              ) : (
                <span className="h-1.5 w-1.5 rounded-full bg-slate-300" />
              )}
              {step.label}
            </div>
          </div>
        );
      })}
    </div>
  );

  if (inline) return steps;

  return (
    <div className="border-b border-slate-200 bg-slate-50/60 px-6 py-3">
      {steps}
    </div>
  );
}
