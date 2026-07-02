// Mirror of MIN_EVAL_CASES_FOR_BLINDED_SPLIT in @skillspell/shared. The frontend
// can't import runtime *values* from the shared package (it ships as CommonJS and
// Vite's dev server only resolves type-only imports from it — see UserMenu.tsx /
// OrganizationSettings.tsx for the same inlining). BlindedSplitHint.test.tsx guards
// this copy against the shared canonical value so the two can't drift.
const MIN_EVAL_CASES_FOR_BLINDED_SPLIT = 5;

interface BlindedSplitHintProps {
  /** Total number of eval cases for the skill (not the version-filtered subset). */
  caseCount: number;
}

/**
 * Non-blocking hint shown on the Test Cases tab when a skill has too few cases
 * for a blinded train/test split during optimization. Renders nothing at 0 cases
 * (the empty state covers that) or once the skill reaches
 * MIN_EVAL_CASES_FOR_BLINDED_SPLIT. Informational only — it never disables any
 * action.
 */
export function BlindedSplitHint({ caseCount }: BlindedSplitHintProps) {
  const isBelowBlindedSplit =
    caseCount > 0 && caseCount < MIN_EVAL_CASES_FOR_BLINDED_SPLIT;
  if (!isBelowBlindedSplit) return null;

  const remaining = MIN_EVAL_CASES_FOR_BLINDED_SPLIT - caseCount;

  return (
    <div
      role="status"
      className="mx-4 mt-4 flex items-start gap-2 rounded-xl border border-amber-200/70 bg-amber-50 px-3 py-2.5 text-xs text-amber-800"
    >
      <svg className="mt-0.5 h-4 w-4 shrink-0 text-amber-500" fill="none" viewBox="0 0 24 24" strokeWidth={2} stroke="currentColor">
        <path strokeLinecap="round" strokeLinejoin="round" d="M11.25 11.25l.041-.02a.75.75 0 0 1 1.063.852l-.708 2.836a.75.75 0 0 0 1.063.853l.041-.021M21 12a9 9 0 1 1-18 0 9 9 0 0 1 18 0Zm-9-3.75h.008v.008H12V8.25Z" />
      </svg>
      <span>
        You have {caseCount} test case{caseCount !== 1 ? 's' : ''}. Add{' '}
        <strong>{remaining} more</strong> to enable a <strong>blinded</strong> train/test split during
        optimization — below {MIN_EVAL_CASES_FOR_BLINDED_SPLIT}, optimization runs unblinded on the full
        set, which weakens its protection against overfitting.
      </span>
    </div>
  );
}
