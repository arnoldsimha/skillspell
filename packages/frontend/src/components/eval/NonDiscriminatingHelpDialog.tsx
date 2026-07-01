import { createPortal } from 'react-dom';

interface NonDiscriminatingHelpDialogProps {
  onClose: () => void;
}

/**
 * Modal dialog explaining what "non-discriminating" assertions mean,
 * why they matter, and actionable steps to improve them.
 *
 * Follows the same UI pattern as EvalHelpDialog.
 */
export function NonDiscriminatingHelpDialog({ onClose }: NonDiscriminatingHelpDialogProps) {
  return createPortal(
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 backdrop-blur-sm animate-backdrop"
      onClick={onClose}
    >
      <div
        role="dialog"
        aria-modal="true"
        className="mx-4 flex w-full max-w-2xl max-h-[85vh] flex-col rounded-2xl border border-slate-200/80 bg-white shadow-2xl animate-scale-in"
        onClick={(e) => e.stopPropagation()}
      >
        {/* Header */}
        <div className="flex shrink-0 items-center justify-between border-b border-slate-100 px-6 pt-6 pb-4">
          <div className="flex items-center gap-3">
            <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-amber-50">
              <svg
                className="h-5 w-5 text-amber-600"
                fill="none"
                viewBox="0 0 24 24"
                strokeWidth={2}
                stroke="currentColor"
              >
                <path
                  strokeLinecap="round"
                  strokeLinejoin="round"
                  d="M12 9v3.75m-9.303 3.376c-.866 1.5.217 3.374 1.948 3.374h14.71c1.73 0 2.813-1.874 1.948-3.374L13.949 3.378c-.866-1.5-3.032-1.5-3.898 0L2.697 16.126ZM12 15.75h.007v.008H12v-.008Z"
                />
              </svg>
            </div>
            <div>
              <h3 className="text-lg font-bold text-slate-800">
                Understanding Non-Discriminating Assertions
              </h3>
              <p className="text-xs text-slate-500">
                Why some assertions don&apos;t test your skill effectively
              </p>
            </div>
          </div>
          <button
            onClick={onClose}
            className="rounded-xl p-2 text-slate-400 hover:bg-slate-100 hover:text-slate-700 transition-all duration-200"
            aria-label="Close help dialog"
          >
            <svg
              className="h-5 w-5"
              fill="none"
              viewBox="0 0 24 24"
              strokeWidth={2}
              stroke="currentColor"
            >
              <path
                strokeLinecap="round"
                strokeLinejoin="round"
                d="M6 18L18 6M6 6l12 12"
              />
            </svg>
          </button>
        </div>

        {/* Scrollable content */}
        <div className="flex-1 overflow-y-auto px-6 py-5 space-y-6">
          {/* Section 1: What does it mean? */}
          <Section
            number={1}
            title='What does "non-discriminating" mean?'
            color="amber"
            icon={
              <svg className="h-4 w-4" fill="none" viewBox="0 0 24 24" strokeWidth={2} stroke="currentColor">
                <path strokeLinecap="round" strokeLinejoin="round" d="M9.879 7.519c1.171-1.025 3.071-1.025 4.242 0 1.172 1.025 1.172 2.687 0 3.712-.203.179-.43.326-.67.442-.745.361-1.45.999-1.45 1.827v.75M21 12a9 9 0 1 1-18 0 9 9 0 0 1 18 0Zm-9 5.25h.008v.008H12v-.008Z" />
              </svg>
            }
          >
            <p className="text-sm text-slate-600 leading-relaxed">
              An assertion is <strong>non-discriminating</strong> when it passes
              <em> regardless</em> of whether your skill is applied. The AI model
              produces output that satisfies this check even <strong>without</strong> your
              skill&apos;s instructions — meaning the assertion can&apos;t tell you if
              your skill is actually working.
            </p>
            <p className="text-sm text-slate-500 mt-2 leading-relaxed">
              Think of it like a test question everyone gets right — it doesn&apos;t
              separate students who studied from those who didn&apos;t.
            </p>
          </Section>

          {/* Section 2: Why it matters */}
          <Section
            number={2}
            title="Why it matters"
            color="red"
            icon={
              <svg className="h-4 w-4" fill="none" viewBox="0 0 24 24" strokeWidth={2} stroke="currentColor">
                <path strokeLinecap="round" strokeLinejoin="round" d="M12 9v3.75m-9.303 3.376c-.866 1.5.217 3.374 1.948 3.374h14.71c1.73 0 2.813-1.874 1.948-3.374L13.949 3.378c-.866-1.5-3.032-1.5-3.898 0L2.697 16.126ZM12 15.75h.007v.008H12v-.008Z" />
              </svg>
            }
          >
            <ul className="text-sm text-slate-600 space-y-2">
              <li className="flex items-start gap-2">
                <span className="text-red-500 font-bold mt-0.5">•</span>
                <span><strong>False confidence</strong> — A 100% pass rate looks great but doesn&apos;t prove your skill adds value</span>
              </li>
              <li className="flex items-start gap-2">
                <span className="text-red-500 font-bold mt-0.5">•</span>
                <span><strong>Missed regressions</strong> — If you change your skill and break something, non-discriminating assertions won&apos;t catch it</span>
              </li>
              <li className="flex items-start gap-2">
                <span className="text-red-500 font-bold mt-0.5">•</span>
                <span><strong>Wasted eval cycles</strong> — These assertions consume tokens and time without providing useful signal</span>
              </li>
            </ul>
          </Section>

          {/* Section 3: Visual example */}
          <Section
            number={3}
            title="Example: good vs non-discriminating"
            color="blue"
            icon={
              <svg className="h-4 w-4" fill="none" viewBox="0 0 24 24" strokeWidth={2} stroke="currentColor">
                <path strokeLinecap="round" strokeLinejoin="round" d="M3.75 3v11.25A2.25 2.25 0 0 0 6 16.5h2.25M3.75 3h-1.5m1.5 0h16.5m0 0h1.5m-1.5 0v11.25A2.25 2.25 0 0 1 18 16.5h-2.25m-7.5 0h7.5m-7.5 0-1 3m8.5-3 1 3m0 0 .5 1.5m-.5-1.5h-9.5m0 0-.5 1.5" />
              </svg>
            }
          >
            <p className="text-sm text-slate-500 mb-3">
              Imagine a skill that instructs the AI to always use formal language:
            </p>
            <div className="overflow-x-auto rounded-xl border border-slate-200">
              <table className="min-w-full divide-y divide-slate-200 text-xs">
                <thead className="bg-slate-50/80">
                  <tr>
                    <th className="px-3 py-2 text-left font-bold text-slate-500 uppercase tracking-wider">Assertion</th>
                    <th className="px-3 py-2 text-center font-bold text-slate-500 uppercase tracking-wider">With Skill</th>
                    <th className="px-3 py-2 text-center font-bold text-slate-500 uppercase tracking-wider">Baseline</th>
                    <th className="px-3 py-2 text-center font-bold text-slate-500 uppercase tracking-wider">Verdict</th>
                  </tr>
                </thead>
                <tbody className="bg-white divide-y divide-slate-100">
                  <tr>
                    <td className="px-3 py-2 text-slate-700 font-mono">contains &quot;hello&quot;</td>
                    <td className="px-3 py-2 text-center"><Badge color="green">✓ Pass</Badge></td>
                    <td className="px-3 py-2 text-center"><Badge color="green">✓ Pass</Badge></td>
                    <td className="px-3 py-2 text-center"><Badge color="amber">Non-discriminating</Badge></td>
                  </tr>
                  <tr>
                    <td className="px-3 py-2 text-slate-700 font-mono">semantic &quot;uses formal tone&quot;</td>
                    <td className="px-3 py-2 text-center"><Badge color="green">✓ Pass</Badge></td>
                    <td className="px-3 py-2 text-center"><Badge color="red">✗ Fail</Badge></td>
                    <td className="px-3 py-2 text-center"><Badge color="emerald">Skill adds value ✓</Badge></td>
                  </tr>
                  <tr>
                    <td className="px-3 py-2 text-slate-700 font-mono">not_contains &quot;yo&quot;</td>
                    <td className="px-3 py-2 text-center"><Badge color="green">✓ Pass</Badge></td>
                    <td className="px-3 py-2 text-center"><Badge color="green">✓ Pass</Badge></td>
                    <td className="px-3 py-2 text-center"><Badge color="amber">Non-discriminating</Badge></td>
                  </tr>
                </tbody>
              </table>
            </div>
            <p className="text-xs text-slate-400 mt-2">
              The <code className="text-slate-600 bg-slate-100 px-1 rounded">contains &quot;hello&quot;</code> assertion passes both with and without the skill because any greeting model says &quot;hello&quot;.
              The <code className="text-slate-600 bg-slate-100 px-1 rounded">semantic &quot;uses formal tone&quot;</code> assertion only passes with the skill — it actually tests the skill&apos;s behavior.
            </p>
          </Section>

          {/* Section 4: All discrimination categories */}
          <Section
            number={4}
            title="Discrimination categories"
            color="purple"
            icon={
              <svg className="h-4 w-4" fill="none" viewBox="0 0 24 24" strokeWidth={2} stroke="currentColor">
                <path strokeLinecap="round" strokeLinejoin="round" d="M9.568 3H5.25A2.25 2.25 0 0 0 3 5.25v4.318c0 .597.237 1.17.659 1.591l9.581 9.581c.699.699 1.78.872 2.607.33a18.095 18.095 0 0 0 5.223-5.223c.542-.827.369-1.908-.33-2.607L11.16 3.66A2.25 2.25 0 0 0 9.568 3Z" />
                <path strokeLinecap="round" strokeLinejoin="round" d="M6 6h.008v.008H6V6Z" />
              </svg>
            }
          >
            <div className="space-y-3">
              <CategoryRow
                badge={<Badge color="emerald">Skill adds value</Badge>}
                description="Passes with skill, fails without. This assertion validates your skill is working."
              />
              <CategoryRow
                badge={<Badge color="amber">Non-discriminating</Badge>}
                description="Passes in both configs. Can't tell if the skill matters — consider replacing."
              />
              <CategoryRow
                badge={<Badge color="red">Skill hurts</Badge>}
                description="Fails with skill, passes without. The skill may be interfering with this check."
              />
              <CategoryRow
                badge={<Badge color="slate">Broken</Badge>}
                description="Fails in both configs. The assertion may be too strict or test beyond model capabilities."
              />
              <CategoryRow
                badge={<Badge color="gray">Inconclusive</Badge>}
                description="Not enough baseline data to determine discrimination. Run evals with baseline enabled."
              />
            </div>
          </Section>

          {/* Section 5: How to fix */}
          <Section
            number={5}
            title="How to fix non-discriminating assertions"
            color="emerald"
            icon={
              <svg className="h-4 w-4" fill="none" viewBox="0 0 24 24" strokeWidth={2} stroke="currentColor">
                <path strokeLinecap="round" strokeLinejoin="round" d="M11.42 15.17 17.25 21A2.652 2.652 0 0 0 21 17.25l-5.877-5.877M11.42 15.17l2.496-3.03c.317-.384.74-.626 1.208-.766M11.42 15.17l-4.655 5.653a2.548 2.548 0 1 1-3.586-3.586l6.837-5.63m5.108-.233c.55-.164 1.163-.188 1.743-.14a4.5 4.5 0 0 0 4.486-6.336l-3.276 3.277a3.004 3.004 0 0 1-2.25-2.25l3.276-3.276a4.5 4.5 0 0 0-6.336 4.486c.091 1.076-.071 2.264-.904 2.95l-.102.085m-1.745 1.437L5.909 7.5H4.5L2.25 3.75l1.5-1.5L7.5 4.5v1.409l4.26 4.26m-1.745 1.437 1.745-1.437m6.615 8.206L15.75 15.75M4.867 19.125h.008v.008h-.008v-.008Z" />
              </svg>
            }
          >
            <ol className="text-sm text-slate-600 space-y-3 list-decimal list-inside">
              <li>
                <strong>Use <code className="text-indigo-600 bg-indigo-50 px-1 rounded text-xs">semantic</code> assertions</strong> — Instead of checking for generic keywords, check for <em>behavioral</em> qualities your skill produces (e.g., &quot;uses formal language&quot;, &quot;includes code examples&quot;)
              </li>
              <li>
                <strong>Be specific to your skill</strong> — Test for qualities that are <em>unique</em> to your skill&apos;s instructions, not things any AI would do
              </li>
              <li>
                <strong>Replace <code className="text-slate-600 bg-slate-100 px-1 rounded text-xs">contains</code> with <code className="text-indigo-600 bg-indigo-50 px-1 rounded text-xs">semantic</code></strong> — Generic keyword checks almost always pass both configurations
              </li>
              <li>
                <strong>Test structural requirements</strong> — If your skill requires specific formatting (e.g., bullet lists, numbered steps, headers), assert for those structures
              </li>
              <li>
                <strong>Use &quot;Fix with AI&quot;</strong> — Click the <em>Fix with AI ✨</em> button in the By Assertion Value table to get AI-suggested replacements for non-discriminating assertions
              </li>
            </ol>
          </Section>
        </div>

        {/* Footer */}
        <div className="shrink-0 border-t border-slate-100 px-6 py-4">
          <button
            onClick={onClose}
            className="w-full rounded-xl bg-slate-100 px-4 py-2.5 text-sm font-semibold text-slate-700 hover:bg-slate-200 transition-all duration-200"
          >
            Got it
          </button>
        </div>
      </div>
    </div>,
    document.body,
  );
}

/* ─── Helper components ──────────────────────────────────────────────── */

function Section({
  number,
  title,
  color,
  icon,
  children,
}: {
  number: number;
  title: string;
  color: string;
  icon: React.ReactNode;
  children: React.ReactNode;
}) {
  const colorMap: Record<string, { bg: string; text: string; border: string }> = {
    amber:   { bg: 'bg-amber-50',   text: 'text-amber-600',   border: 'border-amber-100' },
    red:     { bg: 'bg-red-50',     text: 'text-red-600',     border: 'border-red-100'   },
    blue:    { bg: 'bg-blue-50',    text: 'text-blue-600',    border: 'border-blue-100'  },
    purple:  { bg: 'bg-purple-50',  text: 'text-purple-600',  border: 'border-purple-100'},
    emerald: { bg: 'bg-emerald-50', text: 'text-emerald-600', border: 'border-emerald-100'},
  };
  const colors = colorMap[color] || colorMap.amber;

  return (
    <div className={`rounded-xl border ${colors.border} bg-white p-4`}>
      <div className="flex items-center gap-2 mb-3">
        <div className={`flex h-7 w-7 items-center justify-center rounded-lg ${colors.bg}`}>
          <span className={colors.text}>{icon}</span>
        </div>
        <h4 className="text-sm font-bold text-slate-700">
          <span className={`${colors.text} mr-1`}>{number}.</span>
          {title}
        </h4>
      </div>
      {children}
    </div>
  );
}

function Badge({ color, children }: { color: string; children: React.ReactNode }) {
  const colorMap: Record<string, string> = {
    green:   'bg-emerald-50  text-emerald-700 border-emerald-200/60',
    red:     'bg-red-50      text-red-700     border-red-200/60',
    amber:   'bg-amber-50    text-amber-700   border-amber-200/60',
    emerald: 'bg-emerald-50  text-emerald-700 border-emerald-200/60',
    slate:   'bg-slate-100   text-slate-600   border-slate-200',
    gray:    'bg-slate-50    text-slate-400   border-slate-200',
  };
  return (
    <span className={`inline-flex items-center px-2 py-0.5 rounded-full border text-[10px] font-semibold ${colorMap[color] || colorMap.slate}`}>
      {children}
    </span>
  );
}

function CategoryRow({ badge, description }: { badge: React.ReactNode; description: string }) {
  return (
    <div className="flex items-start gap-3">
      <div className="shrink-0 mt-0.5">{badge}</div>
      <p className="text-sm text-slate-600">{description}</p>
    </div>
  );
}
