/**
 * Protected route layout.
 *
 * Wraps routes that require authentication. Checks auth state from
 * the AuthProvider and redirects to the appropriate page:
 *
 *  - Loading   → spinner
 *  - Server error → /server-error?returnUrl=…
 *  - Setup required → /setup
 *  - Not authenticated → /login (saves current path for post-login redirect)
 *  - Authenticated → renders child routes via <Outlet />
 */

import { Navigate, Outlet, useLocation } from 'react-router';
import { useAuth } from '../../hooks/useAuth.js';
import Spinner from '../common/Spinner.js';

export default function ProtectedRoute() {
  const { user, loading, serverError, setupRequired } = useAuth();
  const location = useLocation();

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

  // Backend unreachable — redirect to /server-error with returnUrl
  if (serverError) {
    const returnUrl =
      location.pathname && location.pathname !== '/'
        ? `?returnUrl=${encodeURIComponent(location.pathname)}`
        : '';
    return <Navigate to={`/server-error${returnUrl}`} replace />;
  }

  // First-run setup needed
  if (setupRequired) {
    return <Navigate to="/setup" replace />;
  }

  // Not authenticated — save current path for post-login redirect
  if (!user) {
    const returnPath = location.pathname + location.search;
    sessionStorage.setItem('auth_redirect', returnPath);
    const returnUrl =
      returnPath && returnPath !== '/'
        ? `?returnUrl=${encodeURIComponent(returnPath)}`
        : '';
    return <Navigate to={`/login${returnUrl}`} replace />;
  }

  // Authenticated — render child routes
  return <Outlet />;
}
