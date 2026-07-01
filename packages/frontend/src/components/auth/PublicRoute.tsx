/**
 * Public-only route layout.
 *
 * Wraps routes that should only be accessible when NOT authenticated
 * (login, setup). Handles the auth init loading/error states and
 * redirects authenticated users to their saved path or home.
 */

import { Navigate, Outlet, useSearchParams } from 'react-router';
import { useAuth } from '../../hooks/useAuth.js';
import Spinner from '../common/Spinner.js';

function sanitizeReturnUrl(url: string | null): string {
  if (!url) return '/';
  // Reject anything that isn't a plain path: no protocol, no protocol-relative URLs
  if (!url.startsWith('/') || url.startsWith('//') || url.includes('://')) return '/';
  return url;
}

export default function PublicRoute() {
  const { user, loading, serverError, setupRequired } = useAuth();
  const [searchParams] = useSearchParams();

  // Still initializing — show a loading spinner
  if (loading) {
    return (
      <div className="flex min-h-screen items-center justify-center bg-slate-50">
        <div className="flex flex-col items-center gap-3">
          <Spinner size="md" />
          <p className="text-sm text-slate-500">Loading…</p>
        </div>
      </div>
    );
  }

  // Backend unreachable — let the public pages render so setup/login
  // can at least show a meaningful error. The ServerErrorPage will be
  // handled by the /server-error route instead.
  if (serverError) {
    return <Navigate to="/server-error" replace />;
  }

  // If user is authenticated, redirect away from login/setup
  if (user && !setupRequired) {
    const raw = searchParams.get('returnUrl') || sessionStorage.getItem('auth_redirect');
    sessionStorage.removeItem('auth_redirect');
    return <Navigate to={sanitizeReturnUrl(raw)} replace />;
  }

  return <Outlet />;
}
