import {
  useProgressMessages,
  useTip,
  formatElapsed,
  GENERATE_MESSAGES,
  GENERATE_INTERVAL,
  OPTIMIZE_MESSAGES,
  OPTIMIZE_INTERVAL,
  type ProgressMessage,
} from '../../hooks/useProgressMessages.js';

interface GenerationProgressProps {
  /** Display mode – controls the heading, description text, and message set. */
  mode?: 'create' | 'optimize';
  /** Override messages for custom flows. */
  messages?: ProgressMessage[];
  /** Whether the progress animation is active. @default true */
  active?: boolean;
}

export default function GenerationProgress({
  mode = 'create',
  messages,
  active = true,
}: GenerationProgressProps) {
  const messageSet = messages ?? (mode === 'optimize' ? OPTIMIZE_MESSAGES : GENERATE_MESSAGES);
  const interval = mode === 'optimize' ? OPTIMIZE_INTERVAL : GENERATE_INTERVAL;

  const { currentMessage, progress, elapsed } = useProgressMessages({
    messages: messageSet,
    interval,
    active,
  });

  const tip = useTip(elapsed);
  const showElapsed = elapsed >= 8;

  return (
    <div className="flex flex-col items-center justify-center py-20 animate-fade-in-up">
      {/* Animated orb */}
      <div className="relative mb-8">
        <div className="absolute -inset-6 rounded-full bg-indigo-500/10 blur-2xl animate-pulse" />
        <div className="relative h-20 w-20 rounded-2xl bg-gradient-to-br from-indigo-500 to-purple-600 shadow-xl shadow-indigo-500/25 animate-pulse-glow flex items-center justify-center">
          <div className="absolute inset-0 rounded-2xl border-2 border-white/20" />
          <svg
            className="h-9 w-9 text-white animate-spin-ease"
            fill="none"
            viewBox="0 0 24 24"
            strokeWidth={1.5}
            stroke="currentColor"
          >
            <path
              strokeLinecap="round"
              strokeLinejoin="round"
              d="M9.813 15.904 9 18.75l-.813-2.846a4.5 4.5 0 0 0-3.09-3.09L2.25 12l2.846-.813a4.5 4.5 0 0 0 3.09-3.09L9 5.25l.813 2.846a4.5 4.5 0 0 0 3.09 3.09L15.75 12l-2.846.813a4.5 4.5 0 0 0-3.09 3.09Z"
            />
          </svg>
        </div>
      </div>

      {/* Animated message — crossfade via key swap */}
      <div className="relative h-16 flex flex-col items-center justify-start overflow-hidden">
        <div
          key={currentMessage.text}
          className="flex flex-col items-center animate-fade-in-up"
        >
          <h3 className="text-xl font-bold text-slate-800 flex items-center gap-2">
            {currentMessage.emoji && <span className="text-lg">{currentMessage.emoji}</span>}
            {currentMessage.text}
          </h3>
          {currentMessage.detail && (
            <p className="mt-1 text-sm text-slate-500 text-center max-w-sm leading-relaxed">
              {currentMessage.detail}
            </p>
          )}
        </div>
      </div>

      {/* Smooth progress bar */}
      <div className="mt-6 w-64">
        <div className="h-1.5 w-full rounded-full bg-slate-100 overflow-hidden">
          <div
            className="h-full rounded-full bg-gradient-to-r from-indigo-500 to-purple-500 transition-all duration-1000 ease-out"
            style={{ width: `${Math.max(5, progress * 90 + 5)}%` }}
          />
        </div>
      </div>

      {/* Bouncing dots + elapsed timer */}
      <div className="mt-5 flex items-center gap-4">
        <div className="flex gap-1.5">
          <div className="h-2 w-2 animate-bounce rounded-full bg-indigo-500 [animation-delay:0ms]" />
          <div className="h-2 w-2 animate-bounce rounded-full bg-indigo-500 [animation-delay:150ms]" />
          <div className="h-2 w-2 animate-bounce rounded-full bg-indigo-500 [animation-delay:300ms]" />
        </div>
        {showElapsed && (
          <span className="text-xs text-slate-400 font-medium tabular-nums animate-fade-in-up">
            {formatElapsed(elapsed)}
          </span>
        )}
      </div>

      {/* Rotating tip */}
      {tip && (
        <div
          key={tip}
          className="mt-6 max-w-sm rounded-xl bg-slate-50 border border-slate-200/60 px-4 py-2.5 animate-fade-in-up"
        >
          <p className="text-xs text-slate-500 text-center leading-relaxed">{tip}</p>
        </div>
      )}
    </div>
  );
}
