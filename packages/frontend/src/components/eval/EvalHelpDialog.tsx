import { createPortal } from 'react-dom';

interface EvalHelpDialogProps {
  onClose: () => void;
}

/**
 * Modal dialog that explains the full Tests & Evaluation flow to the user.
 * Covers: test cases, assertion types, running evals, AI grading,
 * outputs tab, benchmark tab, feedback, and the improve-from-feedback loop.
 */
export function EvalHelpDialog({ onClose }: EvalHelpDialogProps) {
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
                  d="M9.879 7.519c1.171-1.025 3.071-1.025 4.242 0 1.172 1.025 1.172 2.687 0 3.712-.203.179-.43.326-.67.442-.745.361-1.45.999-1.45 1.827v.75M21 12a9 9 0 1 1-18 0 9 9 0 0 1 18 0Zm-9 5.25h.008v.008H12v-.008Z"
                />
              </svg>
            </div>
            <div>
              <h3 className="text-lg font-bold text-slate-800">
                How Tests &amp; Evaluation Works
              </h3>
              <p className="text-xs text-slate-500">
                A step-by-step guide to the evaluation flow
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
          {/* Overview */}
          <p className="text-sm text-slate-600 leading-relaxed">
            The evaluation system lets you <strong>test your skill</strong>{' '}
            against defined test cases, <strong>grade the outputs</strong>{' '}
            automatically using AI, and <strong>improve your skill</strong>{' '}
            based on results and feedback. Here&apos;s how it works:
          </p>

          {/* Step 1: Create Test Cases */}
          <StepSection
            number={1}
            title="Create Test Cases"
            icon={
              <path
                strokeLinecap="round"
                strokeLinejoin="round"
                d="M12 4.5v15m7.5-7.5h-15"
              />
            }
            iconColor="indigo"
          >
            <p>
              Each test case defines a <strong>prompt</strong> to send to SkillSpell
              and optional <strong>assertions</strong> to validate the output.
              You can also provide an <strong>expected output</strong> for
              reference and additional <strong>context</strong>.
            </p>
            <p className="mt-2">
              Click <strong>&quot;Add Test Case&quot;</strong> to create one. Give it
              a name, enter the test prompt, and add assertions to check the
              output.
            </p>
          </StepSection>

          {/* Step 2: Assertion Types */}
          <StepSection
            number={2}
            title="Define Assertions"
            icon={
              <path
                strokeLinecap="round"
                strokeLinejoin="round"
                d="M11.35 3.836c-.065.21-.1.433-.1.664 0 .414.336.75.75.75h4.5a.75.75 0 0 0 .75-.75 2.25 2.25 0 0 0-.1-.664m-5.8 0A2.251 2.251 0 0 1 13.5 2.25H15a2.25 2.25 0 0 1 2.15 1.586m-5.8 0c-.376.023-.75.05-1.124.08C9.095 4.01 8.25 4.973 8.25 6.108V8.25m8.9-4.414c.376.023.75.05 1.124.08 1.131.094 1.976 1.057 1.976 2.192V16.5A2.25 2.25 0 0 1 18 18.75h-2.25m-7.5-10.5H4.875c-.621 0-1.125.504-1.125 1.125v11.25c0 .621.504 1.125 1.125 1.125h9.75c.621 0 1.125-.504 1.125-1.125V18.75m-7.5-10.5h6.375c.621 0 1.125.504 1.125 1.125v9.375m-8.25-3 1.5 1.5 3-3.75"
              />
            }
            iconColor="violet"
          >
            <p>Assertions are rules that check the AI&apos;s output. There are 5 types:</p>
            <ul className="mt-2 space-y-1.5">
              <AssertionType type="contains" description="Output must contain the specified text (case-insensitive)" />
              <AssertionType type="not_contains" description="Output must NOT contain the specified text" />
              <AssertionType type="regex" description="Output must match the given regular expression" />
              <AssertionType type="semantic" description="Output must convey a specific meaning (AI-judged)" />
              <AssertionType type="custom" description="Output must meet a custom criteria you describe" />
            </ul>
          </StepSection>

          {/* Step 3: Running Evals */}
          <StepSection
            number={3}
            title="Run Evaluations"
            icon={
              <path
                strokeLinecap="round"
                strokeLinejoin="round"
                d="M5.25 5.653c0-.856.917-1.398 1.667-.986l11.54 6.347a1.125 1.125 0 0 1 0 1.972l-11.54 6.347a1.125 1.125 0 0 1-1.667-.986V5.653Z"
              />
            }
            iconColor="emerald"
          >
            <p>
              When you click <strong>&quot;Run All Evals&quot;</strong>, the system
              processes each test case:
            </p>
            <ol className="mt-2 space-y-1 list-decimal list-inside text-slate-600">
              <li>
                Your <strong>skill content</strong> is applied as a{' '}
                <strong>system prompt</strong> to SkillSpell
              </li>
              <li>
                The test case <strong>prompt</strong> is sent as the user message
              </li>
              <li>
                SkillSpell generates a response <strong>with your skill applied</strong>
              </li>
              <li>
                Optionally, a <strong>baseline</strong> response (without the skill)
                is also generated for comparison
              </li>
            </ol>
          </StepSection>

          {/* Step 4: Grading */}
          <StepSection
            number={4}
            title="AI Grading"
            icon={
              <path
                strokeLinecap="round"
                strokeLinejoin="round"
                d="M4.26 10.147a60.438 60.438 0 0 0-.491 6.347A48.62 48.62 0 0 1 12 20.904a48.62 48.62 0 0 1 8.232-4.41 60.46 60.46 0 0 0-.491-6.347m-15.482 0a50.636 50.636 0 0 0-2.658-.813A59.906 59.906 0 0 1 12 3.493a59.903 59.903 0 0 1 10.399 5.84c-.896.248-1.783.52-2.658.814m-15.482 0A50.717 50.717 0 0 1 12 13.489a50.702 50.702 0 0 1 7.74-3.342M6.75 15a.75.75 0 1 0 0-1.5.75.75 0 0 0 0 1.5Zm0 0v-3.675A55.378 55.378 0 0 1 12 8.443m-7.007 11.55A5.981 5.981 0 0 0 6.75 15.75v-1.5"
              />
            }
            iconColor="blue"
          >
            <p>
              After execution, <strong>SkillSpell acts as an automated grader</strong>.
              It evaluates the output against each assertion and returns:
            </p>
            <ul className="mt-2 space-y-1 list-disc list-inside text-slate-600">
              <li>
                <strong>Pass/Fail</strong> verdict for each assertion with evidence
              </li>
              <li>
                A <strong>confidence score</strong> (especially for semantic/custom checks)
              </li>
              <li>
                An <strong>overall assessment</strong>: Pass (all passed), Fail (all
                failed), or Partial (some passed)
              </li>
              <li>
                An <strong>overall score</strong> from 0–100
              </li>
            </ul>
          </StepSection>

          {/* Step 5: Review Results — Outputs Tab */}
          <StepSection
            number={5}
            title="Review Results — Outputs Tab"
            icon={
              <path
                strokeLinecap="round"
                strokeLinejoin="round"
                d="M19.5 14.25v-2.625a3.375 3.375 0 0 0-3.375-3.375h-1.5A1.125 1.125 0 0 1 13.5 7.125v-1.5a3.375 3.375 0 0 0-3.375-3.375H8.25m0 12.75h7.5m-7.5 3H12M10.5 2.25H5.625c-.621 0-1.125.504-1.125 1.125v17.25c0 .621.504 1.125 1.125 1.125h12.75c.621 0 1.125-.504 1.125-1.125V11.25a9 9 0 0 0-9-9Z"
              />
            }
            iconColor="slate"
          >
            <p>
              The <strong>Outputs</strong> tab lets you browse each run individually
              using prev/next navigation (or arrow keys). For each run you&apos;ll see:
            </p>
            <ul className="mt-2 space-y-1 list-disc list-inside text-slate-600">
              <li>The <strong>original prompt</strong> that was tested</li>
              <li>The <strong>output with skill</strong> applied</li>
              <li>The <strong>baseline output</strong> (if compared)</li>
              <li>Any <strong>output files</strong> generated</li>
              <li>
                <strong>Grading results</strong> — overall score and individual
                assertion verdicts (expandable for evidence)
              </li>
            </ul>
          </StepSection>

          {/* Step 6: Compare Runs */}
          <StepSection
            number={6}
            title="Compare Runs"
            icon={
              <path
                strokeLinecap="round"
                strokeLinejoin="round"
                d="M7.5 21 3 16.5m0 0L7.5 12M3 16.5h13.5m0-13.5L21 7.5m0 0L16.5 12M21 7.5H7.5"
              />
            }
            iconColor="violet"
          >
            <p>
              Use the <strong>Runs</strong> panel (toggle it with the button in the tab bar)
              to see all runs grouped by test case. You can:
            </p>
            <ul className="mt-2 space-y-1 list-disc list-inside text-slate-600">
              <li>
                <strong>Check two runs</strong> from the same test case to fill
                slots A and B, then click <strong>&quot;Compare Selected&quot;</strong>
              </li>
              <li>
                Use <strong>Smart Suggestions</strong> — after selecting slot A,
                the system recommends the best runs to compare (adjacent versions,
                score changes, re-runs)
              </li>
              <li>
                Hover a run row and click <strong>⇄</strong> with the{' '}
                <strong>Quick Compare</strong> button to auto-pick the best pair in one click
              </li>
              <li>
                The comparison view shows a <strong>side-by-side diff</strong> of
                outputs, grading, and assertion details
              </li>
            </ul>
            <p className="mt-2 text-xs text-slate-500 italic">
              Tip: Runs from different test cases cannot be compared — the system
              only allows same-test-case comparisons for meaningful results.
            </p>
          </StepSection>

          {/* Step 7: Benchmark Tab */}
          <StepSection
            number={7}
            title="Review Results — Benchmark Tab"
            icon={
              <path
                strokeLinecap="round"
                strokeLinejoin="round"
                d="M3 13.125C3 12.504 3.504 12 4.125 12h2.25c.621 0 1.125.504 1.125 1.125v6.75C7.5 20.496 6.996 21 6.375 21h-2.25A1.125 1.125 0 0 1 3 19.875v-6.75ZM9.75 8.625c0-.621.504-1.125 1.125-1.125h2.25c.621 0 1.125.504 1.125 1.125v11.25c0 .621-.504 1.125-1.125 1.125h-2.25a1.125 1.125 0 0 1-1.125-1.125V8.625ZM16.5 4.125c0-.621.504-1.125 1.125-1.125h2.25C20.496 3 21 3.504 21 4.125v15.75c0 .621-.504 1.125-1.125 1.125h-2.25a1.125 1.125 0 0 1-1.125-1.125V4.125Z"
              />
            }
            iconColor="cyan"
          >
            <p>
              The <strong>Benchmark</strong> tab shows aggregate statistics across
              all runs:
            </p>
            <ul className="mt-2 space-y-1 list-disc list-inside text-slate-600">
              <li>
                <strong>Summary cards</strong> — total runs, pass rate, average
                score, average duration
              </li>
              <li>
                <strong>By Assertion Type</strong> — pass rates broken down by
                assertion type (contains, semantic, etc.)
              </li>
              <li>
                <strong>By Eval Case</strong> — pass rates and scores broken down
                by individual test case
              </li>
            </ul>
          </StepSection>

          {/* Step 8: Feedback */}
          <StepSection
            number={8}
            title="Provide Feedback"
            icon={
              <path
                strokeLinecap="round"
                strokeLinejoin="round"
                d="M7.5 8.25h9m-9 3H12m-9.75 1.51c0 1.6 1.123 2.994 2.707 3.227 1.129.166 2.27.293 3.423.379.35.026.67.21.865.501L12 21l2.755-4.133a1.14 1.14 0 0 1 .865-.501 48.172 48.172 0 0 0 3.423-.379c1.584-.233 2.707-1.626 2.707-3.228V6.741c0-1.602-1.123-2.995-2.707-3.228A48.394 48.394 0 0 0 12 3c-2.392 0-4.744.175-7.043.513C3.373 3.746 2.25 5.14 2.25 6.741v6.018Z"
              />
            }
            iconColor="orange"
          >
            <p>
              In the Outputs tab, each run has a <strong>feedback section</strong>{' '}
              where you can:
            </p>
            <ul className="mt-2 space-y-1 list-disc list-inside text-slate-600">
              <li>
                Rate the output as <strong>👍 Good</strong>,{' '}
                <strong>😐 Neutral</strong>, or <strong>👎 Bad</strong>
              </li>
              <li>
                Write detailed <strong>text feedback</strong> explaining what&apos;s
                wrong or what could be better
              </li>
              <li>
                Feedback <strong>auto-saves</strong> as you type — no need to click
                save
              </li>
            </ul>
          </StepSection>

          {/* Step 9: Improve from Feedback */}
          <StepSection
            number={9}
            title="Improve from Feedback"
            icon={
              <path
                strokeLinecap="round"
                strokeLinejoin="round"
                d="M9.813 15.904 9 18.75l-.813-2.846a4.5 4.5 0 0 0-3.09-3.09L2.25 12l2.846-.813a4.5 4.5 0 0 0 3.09-3.09L9 5.25l.813 2.846a4.5 4.5 0 0 0 3.09 3.09L15.75 12l-2.846.813a4.5 4.5 0 0 0-3.09 3.09ZM18.259 8.715 18 9.75l-.259-1.035a3.375 3.375 0 0 0-2.455-2.456L14.25 6l1.036-.259a3.375 3.375 0 0 0 2.455-2.456L18 2.25l.259 1.035a3.375 3.375 0 0 0 2.455 2.456L21.75 6l-1.036.259a3.375 3.375 0 0 0-2.455 2.456Z"
              />
            }
            iconColor="amber"
          >
            <p>
              The <strong>&quot;Improve from Feedback&quot;</strong> button automatically
              analyzes all negative/neutral feedback and failed eval runs, then
              generates an <strong>improved version</strong> of your skill. This:
            </p>
            <ul className="mt-2 space-y-1 list-disc list-inside text-slate-600">
              <li>
                Collects all <strong>bad/neutral-rated</strong> feedback
              </li>
              <li>
                Gathers all <strong>failed or partial</strong> eval runs with their
                assertion failures
              </li>
              <li>
                Builds a detailed refinement prompt and sends it to SkillSpell
              </li>
              <li>
                Creates a <strong>new version</strong> of your skill with the issues
                addressed
              </li>
            </ul>
            <p className="mt-2 text-xs text-slate-500 italic">
              Tip: Run your evals again after improving to verify the changes fixed
              the issues!
            </p>
          </StepSection>
        </div>

        {/* Footer */}
        <div className="flex shrink-0 items-center justify-end border-t border-slate-100 px-6 pt-4 pb-5">
          <button
            onClick={onClose}
            className="rounded-xl bg-slate-100 px-5 py-2.5 text-sm font-medium text-slate-700 hover:bg-slate-200 transition-all duration-200"
          >
            Got it
          </button>
        </div>
      </div>
    </div>,
    document.body,
  );
}

/* ─── Sub-components ─────────────────────────────────────────────────── */

const COLOR_MAP: Record<string, { bg: string; text: string; numBg: string; numText: string }> = {
  indigo:  { bg: 'bg-indigo-50',  text: 'text-indigo-600',  numBg: 'bg-indigo-100',  numText: 'text-indigo-700' },
  violet:  { bg: 'bg-violet-50',  text: 'text-violet-600',  numBg: 'bg-violet-100',  numText: 'text-violet-700' },
  emerald: { bg: 'bg-emerald-50', text: 'text-emerald-600', numBg: 'bg-emerald-100', numText: 'text-emerald-700' },
  blue:    { bg: 'bg-blue-50',    text: 'text-blue-600',    numBg: 'bg-blue-100',    numText: 'text-blue-700' },
  slate:   { bg: 'bg-slate-50',   text: 'text-slate-600',   numBg: 'bg-slate-200',   numText: 'text-slate-700' },
  cyan:    { bg: 'bg-cyan-50',    text: 'text-cyan-600',    numBg: 'bg-cyan-100',    numText: 'text-cyan-700' },
  orange:  { bg: 'bg-orange-50',  text: 'text-orange-600',  numBg: 'bg-orange-100',  numText: 'text-orange-700' },
  amber:   { bg: 'bg-amber-50',   text: 'text-amber-600',   numBg: 'bg-amber-100',   numText: 'text-amber-700' },
};

function StepSection({
  number,
  title,
  icon,
  iconColor,
  children,
}: {
  number: number;
  title: string;
  icon: React.ReactNode;
  iconColor: string;
  children: React.ReactNode;
}) {
  const colors = COLOR_MAP[iconColor] ?? COLOR_MAP.slate;

  return (
    <div className="flex gap-3.5">
      <div className="flex flex-col items-center shrink-0">
        <div className={`flex h-8 w-8 items-center justify-center rounded-lg ${colors.bg}`}>
          <svg
            className={`h-4 w-4 ${colors.text}`}
            fill="none"
            viewBox="0 0 24 24"
            strokeWidth={2}
            stroke="currentColor"
          >
            {icon}
          </svg>
        </div>
        <div className="flex-1 w-px bg-slate-200 mt-2" />
      </div>
      <div className="pb-5 min-w-0">
        <div className="flex items-center gap-2 mb-1.5">
          <span
            className={`flex h-5 w-5 items-center justify-center rounded-full text-[10px] font-bold ${colors.numBg} ${colors.numText}`}
          >
            {number}
          </span>
          <h4 className="text-sm font-bold text-slate-800">{title}</h4>
        </div>
        <div className="text-sm text-slate-600 leading-relaxed">{children}</div>
      </div>
    </div>
  );
}

function AssertionType({
  type,
  description,
}: {
  type: string;
  description: string;
}) {
  return (
    <li className="flex items-start gap-2">
      <code className="shrink-0 mt-0.5 rounded bg-slate-100 px-1.5 py-0.5 text-[11px] font-mono text-violet-600 border border-slate-200">
        {type}
      </code>
      <span className="text-slate-600">{description}</span>
    </li>
  );
}
