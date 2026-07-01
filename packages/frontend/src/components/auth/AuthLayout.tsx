/**
 * Shared layout for auth pages (login, setup wizard).
 *
 * Centered card with logo, title, and optional subtitle.
 * Follows the same Tailwind patterns as the main app.
 */

import type { ReactNode } from 'react';

interface AuthLayoutProps {
  /** Page title — supports ReactNode for gradient branding. */
  title: ReactNode;
  subtitle?: string;
  /** Card body content. */
  children: ReactNode;
  /** Optional footer below the card. */
  footer?: ReactNode;
  /** Max-width class override (default: 'max-w-md'). */
  maxWidth?: string;
}

/** SkillSpell sparkle icon — reused from Header/App welcome screen. */
function LogoIcon({ size = 'md' }: { size?: 'sm' | 'md' | 'lg' }) {
  const sizes = {
    sm: { box: 'h-10 w-10', icon: 'h-5 w-5' },
    md: { box: 'h-14 w-14', icon: 'h-7 w-7' },
    lg: { box: 'h-16 w-16', icon: 'h-8 w-8' },
  };
  const s = sizes[size];

  return (
    <div
      className={`${s.box} flex items-center justify-center rounded-2xl bg-gradient-to-br from-indigo-500 to-purple-600 shadow-xl shadow-indigo-500/25`}
    >
      <svg
        className={`${s.icon} text-white`}
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
  );
}

/** Inline error alert banner — reusable across auth forms. */
export function ErrorAlert({ message }: { message: string | null }) {
  if (!message) return null;
  return (
    <div className="mb-4 rounded-lg border border-red-200 bg-red-50 p-3 text-sm text-red-700">
      {message}
    </div>
  );
}

/** Branded title: "Skill" + gradient "Spell". */
export function BrandTitle({ prefix }: { prefix?: string }) {
  return (
    <>
      {prefix && <>{prefix} </>}
      Skill<span className="text-gradient">Spell</span>
    </>
  );
}

export default function AuthLayout({
  title,
  subtitle,
  children,
  footer,
  maxWidth = 'max-w-md',
}: AuthLayoutProps) {
  return (
    <div className="flex min-h-screen items-center justify-center bg-slate-50 px-4 animate-fade-in-up">
      <div className={`w-full ${maxWidth}`}>
        {/* Logo & heading */}
        <div className="mb-8 flex flex-col items-center">
          <LogoIcon size="md" />
          <h1 className="mt-4 text-2xl font-bold text-slate-800">
            {title}
          </h1>
          {subtitle && (
            <p className="mt-1.5 text-center text-sm text-slate-500">
              {subtitle}
            </p>
          )}
        </div>

        {/* Card */}
        <div className="rounded-2xl border border-slate-200 bg-white p-6 shadow-sm">
          {children}
        </div>

        {/* Optional footer text */}
        {footer && (
          <div className="mt-4 text-center text-xs text-slate-400">
            {footer}
          </div>
        )}
      </div>
    </div>
  );
}
