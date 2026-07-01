/**
 * SSO Callback page.
 *
 * The SAML callback on the backend redirects here with the access token
 * in the URL fragment hash: `/sso-callback#token=<jwt>`.
 *
 * This page reads the token, stores it via authSDK, and redirects
 * the user to the main app. If an error is present, it shows the error
 * with the same layout/design as the login page.
 */

import { useEffect, useState } from 'react';
import { useNavigate, Link } from 'react-router';
import { authSDK } from '../../services/auth-sdk.js';
import AuthLayout, { BrandTitle } from './AuthLayout.js';
import Spinner from '../common/Spinner.js';

export default function SsoCallbackPage() {
  const navigate = useNavigate();
  const [error, setError] = useState<string | null>(null);
  const [processing, setProcessing] = useState(true);

  useEffect(() => {
    const hash = window.location.hash;
    const params = new URLSearchParams(hash.replace(/^#/, ''));

    const token = params.get('token');
    const hasError = params.has('error');

    // Clean up the URL fragment immediately (remove sensitive token from URL bar).
    // Must use window.history.replaceState here, NOT navigate(), because we need
    // to strip the hash fragment which React Router does not manage.
    window.history.replaceState(null, '', '/sso-callback');

    if (hasError) {
      setError('SSO authentication failed. Please try again or contact your administrator.');
      setProcessing(false);
      return;
    }

    if (token) {
      try {
        const user = authSDK.handleSsoCallback(decodeURIComponent(token));
        if (user) {
          // Navigate to the saved redirect path (or /).
          // Small delay so the user sees the success state briefly.
          const redirectTo = sessionStorage.getItem('auth_redirect') || '/';
          sessionStorage.removeItem('auth_redirect');
          setTimeout(() => {
            navigate(redirectTo, { replace: true });
          }, 100);
          return;
        }
        setError('SSO authentication failed. Please try again or contact your administrator.');
      } catch {
        setError('SSO authentication failed. Please try again or contact your administrator.');
      }
    } else {
      setError('SSO authentication failed. Please try again or contact your administrator.');
    }

    setProcessing(false);
  }, [navigate]);

  // ── Processing state ──
  if (processing) {
    return (
      <AuthLayout
        title={<BrandTitle />}
        subtitle="Completing SSO login…"
        maxWidth="max-w-sm"
      >
        <div className="flex flex-col items-center gap-4 py-8">
          <Spinner size="md" />
          <p className="text-sm text-slate-500">Signing you in via SSO…</p>
        </div>
      </AuthLayout>
    );
  }

  // ── Error state — styled like the login page ──
  return (
    <AuthLayout
      title={<BrandTitle />}
      subtitle="SSO Login Failed"
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
        {error}
      </div>

      {/* Divider */}
      <div className="mb-4 flex items-center gap-3">
        <div className="flex-1 border-t border-slate-200" />
        <span className="text-xs text-slate-400">try again</span>
        <div className="flex-1 border-t border-slate-200" />
      </div>

      {/* Back to login button */}
      <Link
        to="/login"
        className="flex w-full items-center justify-center gap-2 rounded-lg border border-slate-300 bg-white px-4 py-2.5 text-sm font-medium text-slate-700 shadow-sm transition-colors duration-200 hover:bg-slate-50"
      >
        <svg className="h-4 w-4" fill="none" viewBox="0 0 24 24" strokeWidth={2} stroke="currentColor">
          <path strokeLinecap="round" strokeLinejoin="round" d="M15.75 19.5 8.25 12l7.5-7.5" />
        </svg>
        Back to login
      </Link>
    </AuthLayout>
  );
}
