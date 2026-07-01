import { useState, useEffect, useRef } from 'react';

// ── Types ──────────────────────────────────────────────────────────────

export interface ProgressMessage {
  /** Primary text shown to the user. */
  text: string;
  /** Optional secondary description. */
  detail?: string;
  /** Optional emoji displayed before the text. */
  emoji?: string;
}

export interface UseProgressMessagesOptions {
  /** Ordered list of messages to cycle through. */
  messages: ProgressMessage[];
  /** Interval between message transitions in ms. @default 4500 */
  interval?: number;
  /** Whether to loop or stop at the last message. @default false */
  cycle?: boolean;
  /** Whether the progress is currently active. */
  active: boolean;
}

export interface UseProgressMessagesReturn {
  /** The message currently being displayed. */
  currentMessage: ProgressMessage;
  /** 0-based index of the current message. */
  currentIndex: number;
  /** 0–1 progress through the message list. */
  progress: number;
  /** Seconds elapsed since activation. */
  elapsed: number;
}

// ── Hook ───────────────────────────────────────────────────────────────

export function useProgressMessages({
  messages,
  interval = 4500,
  cycle = false,
  active,
}: UseProgressMessagesOptions): UseProgressMessagesReturn {
  const [index, setIndex] = useState(0);
  const [elapsed, setElapsed] = useState(0);
  const startRef = useRef<number>(0);
  const timerRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const elapsedRef = useRef<ReturnType<typeof setInterval> | null>(null);

  // Reset when activation changes
  useEffect(() => {
    if (active) {
      setIndex(0);
      setElapsed(0);
      startRef.current = Date.now();

      // Message cycling timer
      timerRef.current = setInterval(() => {
        setIndex((prev) => {
          const next = prev + 1;
          if (next >= messages.length) {
            return cycle ? 0 : prev; // Stay on last or loop
          }
          return next;
        });
      }, interval);

      // Elapsed second counter
      elapsedRef.current = setInterval(() => {
        setElapsed(Math.floor((Date.now() - startRef.current) / 1000));
      }, 1000);
    }

    return () => {
      if (timerRef.current) clearInterval(timerRef.current);
      if (elapsedRef.current) clearInterval(elapsedRef.current);
      timerRef.current = null;
      elapsedRef.current = null;
    };
  }, [active, interval, cycle, messages.length]);

  const safeIndex = Math.min(index, messages.length - 1);
  const progress = messages.length <= 1 ? 0 : safeIndex / (messages.length - 1);

  return {
    currentMessage: messages[safeIndex],
    currentIndex: safeIndex,
    progress,
    elapsed,
  };
}

// ── Message Presets ────────────────────────────────────────────────────

export const GENERATE_MESSAGES: ProgressMessage[] = [
  { emoji: '🔍', text: 'Analyzing your requirements…', detail: 'Understanding the skill scope and objectives' },
  { emoji: '📐', text: 'Planning skill architecture…', detail: 'Deciding on structure, triggers, and file layout' },
  { emoji: '🏗️', text: 'Designing skill structure…', detail: 'Building sections, workflows, and decision trees' },
  { emoji: '✍️', text: 'Writing skill instructions…', detail: 'Crafting the main SKILL.md with detailed guidance' },
  { emoji: '📝', text: 'Drafting trigger description…', detail: 'Writing a precise description for accurate routing' },
  { emoji: '📦', text: 'Generating supporting files…', detail: 'Creating scripts, references, and asset files' },
  { emoji: '🔗', text: 'Connecting the pieces…', detail: 'Ensuring all files reference each other correctly' },
  { emoji: '🔍', text: 'Reviewing for quality…', detail: 'Checking for consistency and completeness' },
  { emoji: '✨', text: 'Polishing and finalizing…', detail: 'Final formatting and validation' },
  { emoji: '🚀', text: 'Almost there…', detail: 'Wrapping up the last details' },
];

/** Default interval for generate messages: 10 msgs × 12s = 120s ≈ 2 min. */
export const GENERATE_INTERVAL = 12000;

export const OPTIMIZE_MESSAGES: ProgressMessage[] = [
  { emoji: '📖', text: 'Analyzing current skill…', detail: 'Reading your existing skill and understanding its structure' },
  { emoji: '🧠', text: 'Understanding your feedback…', detail: 'Interpreting what changes are needed' },
  { emoji: '🎯', text: 'Planning optimizations…', detail: 'Determining the best changes to make' },
  { emoji: '✍️', text: 'Rewriting skill content…', detail: 'Applying improvements to the instructions' },
  { emoji: '📝', text: 'Updating trigger description…', detail: 'Refining the description for better accuracy' },
  { emoji: '🔧', text: 'Updating supporting files…', detail: 'Adjusting scripts and references as needed' },
  { emoji: '🔗', text: 'Ensuring consistency…', detail: 'Verifying all parts work together correctly' },
  { emoji: '🔍', text: 'Reviewing changes…', detail: 'Quality checking the optimized output' },
  { emoji: '✅', text: 'Validating final result…', detail: 'Making sure everything is well-structured' },
  { emoji: '🚀', text: 'Almost done…', detail: 'Finishing up the last touches' },
];

/** Default interval for optimize messages: 10 msgs × 12s = 120s ≈ 2 min. */
export const OPTIMIZE_INTERVAL = 12000;

export const IMPROVE_MESSAGES: ProgressMessage[] = [
  { emoji: '📋', text: 'Collecting feedback data…', detail: 'Gathering negative feedback and failed test results' },
  { emoji: '🔍', text: 'Analyzing failure patterns…', detail: 'Identifying common issues across test cases' },
  { emoji: '🎯', text: 'Building improvement strategy…', detail: 'Prioritizing the most impactful fixes' },
  { emoji: '✍️', text: 'Rewriting affected sections…', detail: 'Addressing identified issues in the skill content' },
  { emoji: '📝', text: 'Updating supporting files…', detail: 'Fixing scripts and references as needed' },
  { emoji: '🔗', text: 'Verifying consistency…', detail: 'Ensuring all changes work together' },
  { emoji: '🔍', text: 'Final quality check…', detail: 'Reviewing the complete improvement' },
  { emoji: '📝', text: 'Preparing draft for review…', detail: 'Finalizing the improvement draft' },
  { emoji: '🚀', text: 'Almost ready…', detail: 'Wrapping up the improvement' },
];

/** Default interval for improve messages: 9 msgs × 13s = 117s ≈ 2 min. */
export const IMPROVE_INTERVAL = 13000;

export const DESC_OPT_GENERATE_EVALS_MESSAGES: ProgressMessage[] = [
  { emoji: '🔍', text: 'Analyzing skill capabilities…', detail: 'Understanding your skill\'s trigger criteria' },
  { emoji: '✍️', text: 'Generating test queries…', detail: 'Creating queries that should and should not trigger' },
  { emoji: '🎯', text: 'Adding edge cases…', detail: 'Including near-miss queries to test precision' },
];

export const DESC_OPT_RUNNING_MESSAGES: ProgressMessage[] = [
  { emoji: '🧪', text: 'Testing current description…', detail: 'Running queries against the current trigger' },
  { emoji: '📊', text: 'Analyzing trigger accuracy…', detail: 'Checking which queries correctly matched' },
  { emoji: '✍️', text: 'Proposing description improvements…', detail: 'AI is rewriting for better precision' },
  { emoji: '🔄', text: 'Re-testing improved description…', detail: 'Verifying the changes trigger correctly' },
  { emoji: '⚖️', text: 'Comparing iterations…', detail: 'Finding the description with the best accuracy' },
  { emoji: '🏆', text: 'Finalizing results…', detail: 'Selecting the best-performing description' },
];

export const GENERATE_TEST_EVALS_MESSAGES: ProgressMessage[] = [
  { emoji: '🔍', text: 'Analyzing skill capabilities…', detail: 'Understanding what your skill does' },
  { emoji: '📝', text: 'Designing test scenarios…', detail: 'Creating diverse test cases with edge cases' },
  { emoji: '✅', text: 'Generating assertions…', detail: 'Adding validation rules for each test' },
];

export const SKILL_OPT_MESSAGES: ProgressMessage[] = [
  { emoji: '🧪', text: 'Running eval cases…', detail: 'Testing your skill against the training set' },
  { emoji: '📊', text: 'Analyzing results…', detail: 'Identifying patterns in failed cases' },
  { emoji: '🛠️', text: 'Improving skill…', detail: 'AI is rewriting sections based on failures' },
  { emoji: '✅', text: 'Validating changes…', detail: 'Running test set to measure real improvement' },
  { emoji: '🔄', text: 'Starting next iteration…', detail: 'Using insights from previous round' },
];

/** Default interval for skill optimization messages: 5 msgs × 30s = 150s ≈ 2.5 min per iteration. */
export const SKILL_OPT_INTERVAL = 30000;

/** Sub-step-specific rotating messages — each phase has its own pool of 3–4 messages. */
export const SKILL_OPT_SUBSTEP_MESSAGES: Record<string, ProgressMessage[]> = {
  'running-train': [
    { emoji: '🧪', text: 'Running training evals…', detail: 'Each test case runs through the AI with your skill' },
    { emoji: '⏳', text: 'Executing test cases…', detail: 'Running prompts against the current skill version' },
    { emoji: '🔬', text: 'Testing skill quality…', detail: 'Grading outputs against your assertions' },
    { emoji: '📝', text: 'Evaluating responses…', detail: 'Checking each output matches expected behavior' },
  ],
  'analyzing': [
    { emoji: '🔍', text: 'Analyzing failures…', detail: 'Understanding why certain test cases failed' },
    { emoji: '📊', text: 'Building improvement plan…', detail: 'Identifying patterns in failed assertions' },
    { emoji: '🧩', text: 'Collecting failure evidence…', detail: 'Formatting results for the AI improver' },
  ],
  'improving': [
    { emoji: '✨', text: 'AI is improving your skill…', detail: 'Rewriting sections to fix failed test cases' },
    { emoji: '🛠️', text: 'Refining skill content…', detail: 'Applying targeted fixes without breaking passing tests' },
    { emoji: '🤖', text: 'Generating improved version…', detail: 'The AI is carefully modifying your skill' },
    { emoji: '⚡', text: 'Optimizing instructions…', detail: 'Making the skill more robust and precise' },
  ],
  'running-test': [
    { emoji: '📊', text: 'Running validation tests…', detail: 'Testing the improved skill on held-out cases' },
    { emoji: '✅', text: 'Measuring real improvement…', detail: 'These test cases were never shown to the AI' },
    { emoji: '🎯', text: 'Validating changes…', detail: 'Checking if improvements generalize to new prompts' },
    { emoji: '🔎', text: 'Scoring improved version…', detail: 'Comparing against the blinded test set' },
  ],
};

export const TIPS: string[] = [
  '💡 You can refine the generated skill after reviewing it',
  '💡 Add test cases to evaluate your skill\'s quality',
  '💡 Use the optimizer to improve existing skills',
  '💡 Export your skill to Claude Code, Cursor, or Roo Code',
  '💡 The AI grader checks outputs against your assertions automatically',
  '💡 Use semantic assertions for flexible quality checks',
];

// ── Tip cycling helper ────────────────────────────────────────────────

/** Returns a cycling tip string, changing every `intervalSec` seconds. Only shows after `showAfterSec`. */
export function useTip(elapsed: number, showAfterSec = 15, intervalSec = 8): string | null {
  if (elapsed < showAfterSec) return null;
  const tipIndex = Math.floor((elapsed - showAfterSec) / intervalSec) % TIPS.length;
  return TIPS[tipIndex];
}

// ── Elapsed time formatter ─────────────────────────────────────────────

export function formatElapsed(seconds: number): string {
  if (seconds < 60) return `${seconds}s`;
  const m = Math.floor(seconds / 60);
  const s = seconds % 60;
  return `${m}m ${s}s`;
}
