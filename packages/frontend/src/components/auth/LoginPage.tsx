/**
 * Login page component.
 *
 * Shows email/password form + optional SSO button.
 * Displayed when setup is complete and user is not authenticated.
 */

import React, { useState } from 'react';
import { useAuth } from '../../hooks/useAuth.js';
import { authSDK } from '../../services/auth-sdk.js';
import AuthLayout, { BrandTitle, ErrorAlert } from './AuthLayout.js';
import FormInput from './FormInput.js';
import PasswordInput from './PasswordInput.js';
import SubmitButton from './SubmitButton.js';
import Spinner from '../common/Spinner.js';
import { Button } from '../common/Button.js';

export default function LoginPage() {
  const { login, ssoStatus } = useAuth();
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const [ssoLoading, setSsoLoading] = useState(false);

  const passwordLoginEnabled = ssoStatus?.passwordLoginEnabled !== false;
  const ssoEnabled = ssoStatus?.samlEnabled === true || ssoStatus?.oidcEnabled === true;
  const activeSsoProtocol = ssoStatus?.activeSsoProtocol;

  const handleSubmit = async (e: React.FormEvent<HTMLFormElement>) => {
    e.preventDefault();
    setError(null);
    setLoading(true);

    try {
      await login(email, password);
    } catch (err) {
      setError(
        err instanceof Error ? err.message : 'Login failed. Please try again.',
      );
    } finally {
      setLoading(false);
    }
  };

  const handleSsoLogin = () => {
    setError(null);
    setSsoLoading(true);
    try {
      if (activeSsoProtocol === 'oidc') {
        window.location.href = authSDK.getOidcLoginUrl();
      } else {
        window.location.href = authSDK.getSamlLoginUrl();
      }
    } catch (err) {
      setSsoLoading(false);
      setError(err instanceof Error ? err.message : 'SSO login failed. Please try again.');
    }
  };

  return (
    <AuthLayout
      title={<BrandTitle />}
      subtitle="Sign in to continue"
      maxWidth="max-w-sm"
    >
      <ErrorAlert message={error} />

      {/* Email & Password form — hidden when password login is disabled */}
      {passwordLoginEnabled && (
        <form onSubmit={handleSubmit} className="space-y-4">
          <FormInput
            id="email"
            label="Email"
            type="email"
            required
            autoComplete="email"
            autoFocus
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            placeholder="you@example.com"
          />

          <PasswordInput
            id="password"
            label="Password"
            required
            autoComplete="current-password"
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            placeholder="••••••••"
          />

          <SubmitButton type="submit" loading={loading} loadingText="Signing in…">
            Sign in
          </SubmitButton>
        </form>
      )}

      {/* Divider — shown when both methods are available */}
      {passwordLoginEnabled && ssoEnabled && (
        <div className="my-4 flex items-center gap-3">
          <div className="flex-1 border-t border-slate-200" />
          <span className="text-xs text-slate-400">or</span>
          <div className="flex-1 border-t border-slate-200" />
        </div>
      )}

      {/* SSO Button */}
      {ssoEnabled && (
        <Button
          onClick={handleSsoLogin}
          disabled={ssoLoading}
          variant="secondary"
          size="lg"
          className="w-full"
        >
          {ssoLoading ? (
            <span className="inline-flex items-center justify-center gap-2">
              <Spinner size="sm" className="border-slate-300 border-t-slate-600" />
              Redirecting to SSO…
            </span>
          ) : (
            <span className="inline-flex items-center justify-center gap-2">
              {ssoStatus?.samlIconUrl && (
                <img
                  src={ssoStatus.samlIconUrl}
                  alt=""
                  className="h-4 w-4"
                />
              )}
              Sign in with {ssoStatus?.samlProviderName || 'SSO'}
            </span>
          )}
        </Button>
      )}
    </AuthLayout>
  );
}
