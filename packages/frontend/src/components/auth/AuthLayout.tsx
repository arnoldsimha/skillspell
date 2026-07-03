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

/** SkillSpell wordmark — dark variant for the light auth surfaces. */
function LogoIcon({ size = 'md' }: { size?: 'sm' | 'md' | 'lg' }) {
  const sizes = { sm: 'h-10', md: 'h-14', lg: 'h-16' };

  return (
    <img
      src="/logo-black.png"
      alt="SkillSpell"
      className={`${sizes[size]} w-auto`}
    />
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
