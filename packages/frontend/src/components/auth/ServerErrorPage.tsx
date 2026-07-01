/**
 * Server Error page.
 *
 * Displayed when the frontend cannot reach the backend server
 * (e.g. network error, unexpected error during session check).
 *
 * Uses the same AuthLayout as the SSO error and login pages for
 * a consistent look and feel.
 *
 * On retry, reads the `returnUrl` query parameter and navigates to it
 * if it is a safe local path (starts with `/` and is not a full URL).
 * Falls back to `/` if missing or invalid.
 */

import AuthLayout, { BrandTitle } from './AuthLayout.js';
import { Button } from '../common/Button.js';

/**
 * Validate that a returnUrl is a safe local path.
 * Must start with `/` and must NOT be a protocol-relative URL (`//`)
 * or contain a scheme (e.g. `http://`).
 */
function getSafeReturnUrl(): string {
  const params = new URLSearchParams(window.location.search);
  const raw = params.get('returnUrl');
  if (!raw) return '/';

  // Must start with exactly one `/` (reject `//evil.com` and full URLs)
  if (!raw.startsWith('/') || raw.startsWith('//')) return '/';

  // Reject anything that looks like a scheme (e.g. `/\evil.com`, data:, javascript:)
  try {
    const resolved = new URL(raw, window.location.origin);
    if (resolved.origin !== window.location.origin) return '/';
  } catch {
    return '/';
  }

  return raw;
}

export default function ServerErrorPage() {
  const handleRetry = () => {
    const returnUrl = getSafeReturnUrl();
    // Navigate to the returnUrl (or `/`), which will trigger a full page reload
    // and re-run the auth init check against the server.
    window.location.assign(returnUrl);
  };

  return (
    <AuthLayout
      title={<BrandTitle />}
      subtitle="Server Unavailable"
      maxWidth="max-w-sm"
    >
      {/* Error icon */}
      <div className="flex flex-col items-center gap-3 py-2">
        <div className="flex h-12 w-12 items-center justify-center rounded-full bg-red-50">
          <svg className="h-6 w-6 text-red-500" fill="none" viewBox="0 0 24 24" strokeWidth={1.5} stroke="currentColor">
            <path strokeLinecap="round" strokeLinejoin="round" d="M12 9v3.75m-9.303 3.376c-.866 1.5.217 3.374 1.948 3.374h14.71c1.73 0 2.813-1.874 1.948-3.374L13.949 3.378c-.866-1.5-3.032-1.5-3.898 0L2.697 16.126ZM12 15.75h.007v.008H12v-.008Z" />
          </svg>
        </div>
      </div>

      {/* Error message */}
      <div className="mb-5 rounded-lg border border-red-200 bg-red-50 p-3 text-sm text-red-700">
        Unable to connect to the server. The service may be temporarily unavailable or experiencing issues. Please try again later.
      </div>

      {/* Divider */}
      <div className="mb-4 flex items-center gap-3">
        <div className="flex-1 border-t border-slate-200" />
        <span className="text-xs text-slate-400">try again</span>
        <div className="flex-1 border-t border-slate-200" />
      </div>

      {/* Retry button — styled like the SSO "Back to login" button */}
      <Button
        onClick={handleRetry}
        variant="secondary"
        size="lg"
        className="w-full"
        leftIcon={
          <svg className="h-4 w-4" fill="none" viewBox="0 0 24 24" strokeWidth={2} stroke="currentColor">
            <path strokeLinecap="round" strokeLinejoin="round" d="M16.023 9.348h4.992v-.001M2.985 19.644v-4.992m0 0h4.992m-4.993 0 3.181 3.183a8.25 8.25 0 0 0 13.803-3.7M4.031 9.865a8.25 8.25 0 0 1 13.803-3.7l3.181 3.182" />
          </svg>
        }
      >
        Retry Connection
      </Button>
    </AuthLayout>
  );
}
