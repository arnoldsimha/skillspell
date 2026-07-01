/**
 * Generic 404 / error page.
 *
 * Used for unmatched routes, missing skills, and private skill access errors.
 * Accepts optional props to customise the subtitle, icon, and message — defaults
 * to the standard "Page Not Found" copy.
 */

import { Link } from 'react-router';
import AuthLayout, { BrandTitle } from '../auth/AuthLayout.js';

interface NotFoundPageProps {
  subtitle?: string;
  message?: string;
  icon?: 'not-found' | 'lock';
}

export default function NotFoundPage({
  subtitle = 'Page Not Found',
  message = "The page you're looking for doesn't exist or has been moved.",
  icon = 'not-found',
}: NotFoundPageProps) {
  return (
    <AuthLayout
      title={<BrandTitle />}
      subtitle={subtitle}
      maxWidth="max-w-sm"
    >
      {/* Icon */}
      <div className="flex flex-col items-center gap-3 py-2">
        <div className={`flex h-12 w-12 items-center justify-center rounded-full ${icon === 'lock' ? 'bg-amber-50' : 'bg-slate-100'}`}>
          {icon === 'lock' ? (
            <svg className="h-6 w-6 text-amber-500" fill="none" viewBox="0 0 24 24" strokeWidth={1.5} stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" d="M16.5 10.5V6.75a4.5 4.5 0 1 0-9 0v3.75m-.75 11.25h10.5a2.25 2.25 0 0 0 2.25-2.25v-6.75a2.25 2.25 0 0 0-2.25-2.25H6.75a2.25 2.25 0 0 0-2.25 2.25v6.75a2.25 2.25 0 0 0 2.25 2.25Z" />
            </svg>
          ) : (
            <svg className="h-6 w-6 text-slate-400" fill="none" viewBox="0 0 24 24" strokeWidth={1.5} stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" d="M15.182 16.318A4.486 4.486 0 0 0 12.016 15a4.486 4.486 0 0 0-3.198 1.318M21 12a9 9 0 1 1-18 0 9 9 0 0 1 18 0ZM9.75 9.75c0 .414-.168.75-.375.75S9 10.164 9 9.75 9.168 9 9.375 9s.375.336.375.75Zm-.375 0h.008v.015h-.008V9.75Zm5.625 0c0 .414-.168.75-.375.75s-.375-.336-.375-.75.168-.75.375-.75.375.336.375.75Zm-.375 0h.008v.015h-.008V9.75Z" />
            </svg>
          )}
        </div>
      </div>

      {/* Message */}
      <div className="mb-5 rounded-lg border border-slate-200 bg-slate-50 p-3 text-sm text-slate-600">
        {message}
      </div>

      {/* Go Home button */}
      <Link
        to="/"
        className="flex w-full items-center justify-center gap-2 rounded-lg border border-slate-300 bg-white px-4 py-2.5 text-sm font-medium text-slate-700 shadow-sm transition-colors duration-200 hover:bg-slate-50"
      >
        <svg className="h-4 w-4" fill="none" viewBox="0 0 24 24" strokeWidth={2} stroke="currentColor">
          <path strokeLinecap="round" strokeLinejoin="round" d="m2.25 12 8.954-8.955c.44-.439 1.152-.439 1.591 0L21.75 12M4.5 9.75v10.125c0 .621.504 1.125 1.125 1.125H9.75v-4.875c0-.621.504-1.125 1.125-1.125h2.25c.621 0 1.125.504 1.125 1.125V21h4.125c.621 0 1.125-.504 1.125-1.125V9.75M8.25 21h8.25" />
        </svg>
        Go Home
      </Link>
    </AuthLayout>
  );
}
