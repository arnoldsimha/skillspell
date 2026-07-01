/**
 * Home page — welcome screen with Create Skill CTA.
 *
 * Displayed at the root path `/`.
 */

import { useOutletContext } from 'react-router';
import type { AuthenticatedContext } from '../components/layout/AuthenticatedLayout.js';

export default function HomePage() {
  const { navigateToBuilder } = useOutletContext<AuthenticatedContext>();

  return (
    <div className="flex h-full flex-col items-center justify-center px-6 text-center animate-fade-in-up">
      {/* Gradient orb background */}
      <div className="relative mb-8">
        <div className="absolute -inset-10 rounded-full bg-indigo-500/10 blur-3xl" />
        <div className="relative animate-float">
          <div className="flex h-20 w-20 items-center justify-center rounded-2xl bg-gradient-to-br from-indigo-500 to-purple-600 shadow-xl shadow-indigo-500/25">
            <svg
              className="h-10 w-10 text-white"
              fill="none"
              viewBox="0 0 24 24"
              strokeWidth={1}
              stroke="currentColor"
            >
              <path
                strokeLinecap="round"
                strokeLinejoin="round"
                d="M9.813 15.904 9 18.75l-.813-2.846a4.5 4.5 0 0 0-3.09-3.09L2.25 12l2.846-.813a4.5 4.5 0 0 0 3.09-3.09L9 5.25l.813 2.846a4.5 4.5 0 0 0 3.09 3.09L15.75 12l-2.846.813a4.5 4.5 0 0 0-3.09 3.09ZM18.259 8.715 18 9.75l-.259-1.035a3.375 3.375 0 0 0-2.455-2.456L14.25 6l1.036-.259a3.375 3.375 0 0 0 2.455-2.456L18 2.25l.259 1.035a3.375 3.375 0 0 0 2.456 2.456L21.75 6l-1.035.259a3.375 3.375 0 0 0-2.456 2.456Z"
              />
            </svg>
          </div>
        </div>
      </div>
      <h2 className="text-3xl font-bold text-slate-800">
        Skill<span className="text-gradient">Spell</span>
      </h2>
      <p className="mt-3 max-w-md text-sm leading-relaxed text-slate-500">
        Create, modify, and optimize AI agent skills using natural language.
        Select a skill from the sidebar or create a new one to get started.
      </p>
      <button
        onClick={navigateToBuilder}
        className="mt-8 flex items-center gap-2.5 rounded-xl bg-gradient-to-r from-indigo-600 to-purple-600 px-6 py-3 text-sm font-semibold text-white shadow-lg shadow-indigo-500/25 hover:shadow-xl hover:shadow-indigo-500/30 hover:brightness-110 transition-all duration-200"
      >
        <svg
          className="h-4 w-4"
          fill="none"
          viewBox="0 0 24 24"
          strokeWidth={2.5}
          stroke="currentColor"
        >
          <path strokeLinecap="round" strokeLinejoin="round" d="M12 4.5v15m7.5-7.5h-15" />
        </svg>
        Create Skill
      </button>
    </div>
  );
}
