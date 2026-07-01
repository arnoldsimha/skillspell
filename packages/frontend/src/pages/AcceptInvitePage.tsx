import { useEffect, useState } from 'react';
import { useParams, useNavigate, Link } from 'react-router';
import { validateInvite, completeInvite } from '../services/api/users.js';
import { authSDK } from '../services/auth-sdk.js';
import Spinner from '../components/common/Spinner.js';
import PasswordInput from '../components/auth/PasswordInput.js';
import { Button } from '../components/common/Button.js';

type PageState = 'loading' | 'form' | 'submitting' | 'error' | 'success';

/** Per-field inline error message — declared at module scope to avoid re-creation during render. */
function FieldError({ field, errors }: { field: string; errors: Record<string, string> }) {
  return errors[field] ? (
    <p className="mt-1 text-xs text-red-600">{errors[field]}</p>
  ) : null;
}

/** Per-field error map. Keys match field names. */
type FieldErrors = Record<string, string>;

/**
 * Public page for accepting an invitation and completing registration.
 *
 * Route: /invite/:token
 *
 * Flow:
 * 1. On mount, validates the invite token via GET /api/invite/:token
 * 2. If valid, shows registration form (email read-only, name + password fields)
 * 3. On submit, calls POST /api/invite/:token/complete
 * 4. On success, auto-logs in and navigates to home
 */
export default function AcceptInvitePage() {
  const { token } = useParams<{ token: string }>();
  const navigate = useNavigate();

  const [state, setState] = useState<PageState>('loading');
  const [email, setEmail] = useState('');
  const [errorMessage, setErrorMessage] = useState('');

  // Form fields
  const [firstName, setFirstName] = useState('');
  const [lastName, setLastName] = useState('');
  const [password, setPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [fieldErrors, setFieldErrors] = useState<FieldErrors>({});
  /** General (non-field-specific) submit error */
  const [submitError, setSubmitError] = useState('');

  // ─── Validate token on mount ─────────────────────────────────────────

  useEffect(() => {
    if (!token) {
      setState('error');
      setErrorMessage('Invalid invitation link.');
      return;
    }

    validateInvite(token)
      .then((res) => {
        if (res.valid) {
          setEmail(res.email);
          setState('form');
        } else {
          setState('error');
          setErrorMessage('This invitation is invalid.');
        }
      })
      .catch((err) => {
        setState('error');
        setErrorMessage(
          err instanceof Error
            ? err.message
            : 'This invitation is invalid or has expired.',
        );
      });
  }, [token]);

  // ─── Redirect after successful registration ────────────────────────────

  useEffect(() => {
    if (state !== 'success') return;
    const timer = setTimeout(() => {
      navigate('/', { replace: true });
    }, 1500);
    return () => clearTimeout(timer);
  }, [state, navigate]);

  // ─── Form validation ─────────────────────────────────────────────────

  const validateForm = (): boolean => {
    const errors: FieldErrors = {};

    if (!firstName.trim()) errors.firstName = 'First name is required';
    if (!lastName.trim()) errors.lastName = 'Last name is required';

    // Password rules
    if (!password) {
      errors.password = 'Password is required';
    } else if (password.length < 8) {
      errors.password = 'Password must be at least 8 characters';
    } else if (!/[A-Z]/.test(password)) {
      errors.password = 'Must contain an uppercase letter';
    } else if (!/[a-z]/.test(password)) {
      errors.password = 'Must contain a lowercase letter';
    } else if (!/\d/.test(password)) {
      errors.password = 'Must contain a number';
    } else if (!/[!@#$%^&*()_+\-=[\]{};':"\\|,.<>/?`~]/.test(password)) {
      errors.password = 'Must contain a special character';
    }

    if (password && confirmPassword && password !== confirmPassword) {
      errors.confirmPassword = 'Passwords do not match';
    } else if (!confirmPassword) {
      errors.confirmPassword = 'Please confirm your password';
    }

    setFieldErrors(errors);
    return Object.keys(errors).length === 0;
  };

  // ─── Helpers ───────────────────────────────────────────────────────────

  /** Returns border class — red when the field has an error. */
  const borderClass = (field: string) =>
    fieldErrors[field]
      ? 'border-red-400 focus:border-red-500 focus:ring-red-500'
      : 'border-slate-300 focus:border-indigo-500 focus:ring-indigo-500';

  // ─── Submit ──────────────────────────────────────────────────────────

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!validateForm() || !token) return;

    setState('submitting');
    setFieldErrors({});
    setSubmitError('');

    try {
      const response = await completeInvite(token, {
        firstName: firstName.trim(),
        lastName: lastName.trim(),
        password,
      });

      // Auto-login: set the session using the access token
      authSDK.handleSsoCallback(response.accessToken);

      setState('success');
    } catch (err) {
      setState('form');
      setSubmitError(
        err instanceof Error ? err.message : 'Failed to complete registration',
      );
    }
  };

  // ─── Render ──────────────────────────────────────────────────────────

  return (
    <div className="flex min-h-screen items-center justify-center bg-gradient-to-br from-slate-50 to-slate-100 px-4">
      <div className="w-full max-w-md">
        {/* Logo / Brand */}
        <div className="mb-8 text-center">
          <h1 className="text-2xl font-bold text-slate-800">SkillSpell</h1>
          <p className="mt-1 text-sm text-slate-500">Accept your invitation</p>
        </div>

        {/* Loading state */}
        {state === 'loading' && (
          <div className="flex flex-col items-center justify-center rounded-xl border border-slate-200 bg-white p-8 shadow-sm">
            <Spinner size="md" />
            <p className="mt-3 text-sm text-slate-500">Validating invitation…</p>
          </div>
        )}

        {/* Error state */}
        {state === 'error' && (
          <div className="rounded-xl border border-slate-200 bg-white p-8 shadow-sm text-center">
            <div className="mx-auto mb-4 flex h-12 w-12 items-center justify-center rounded-full bg-red-50">
              <svg className="h-6 w-6 text-red-500" fill="none" viewBox="0 0 24 24" strokeWidth={2} stroke="currentColor">
                <path strokeLinecap="round" strokeLinejoin="round" d="M6 18 18 6M6 6l12 12" />
              </svg>
            </div>
            <h2 className="mb-2 text-lg font-semibold text-slate-800">Invitation Invalid</h2>
            <p className="mb-2 text-sm text-slate-500">{errorMessage}</p>
            <p className="text-xs text-slate-400">
              Please contact your administrator to request a new invitation.
            </p>
          </div>
        )}

        {/* Success state */}
        {state === 'success' && (
          <div className="rounded-xl border border-slate-200 bg-white p-8 shadow-sm text-center">
            <div className="mx-auto mb-4 flex h-12 w-12 items-center justify-center rounded-full bg-emerald-50">
              <svg className="h-6 w-6 text-emerald-500" fill="none" viewBox="0 0 24 24" strokeWidth={2} stroke="currentColor">
                <path strokeLinecap="round" strokeLinejoin="round" d="m4.5 12.75 6 6 9-13.5" />
              </svg>
            </div>
            <h2 className="mb-2 text-lg font-semibold text-slate-800">Welcome!</h2>
            <p className="text-sm text-slate-500">Your account has been created. Redirecting…</p>
          </div>
        )}

        {/* Registration form */}
        {(state === 'form' || state === 'submitting') && (
          <form
            onSubmit={handleSubmit}
            className="rounded-xl border border-slate-200 bg-white p-8 shadow-sm"
          >
            <h2 className="mb-1 text-lg font-semibold text-slate-800">
              Complete your registration
            </h2>
            <p className="mb-6 text-sm text-slate-500">
              Fill in your details to create your account.
            </p>

            {/* General submit error */}
            {submitError && (
              <div className="mb-4 rounded-lg bg-red-50 px-3 py-2">
                <p className="text-sm text-red-700">{submitError}</p>
              </div>
            )}

            {/* Email (read-only) */}
            <div className="mb-4">
              <label htmlFor="invite-email" className="mb-1 block text-sm font-medium text-slate-600">Email</label>
              <input
                id="invite-email"
                type="email"
                value={email}
                readOnly
                className="w-full rounded-lg border border-slate-200 bg-slate-50 px-3 py-2 text-sm text-slate-500"
              />
            </div>

            {/* First Name */}
            <div className="mb-4">
              <label htmlFor="invite-first-name" className="mb-1 block text-sm font-medium text-slate-600">First Name</label>
              <input
                id="invite-first-name"
                type="text"
                value={firstName}
                onChange={(e) => {
                  setFirstName(e.target.value);
                  if (fieldErrors.firstName) setFieldErrors((prev) => { const next = { ...prev }; delete next.firstName; return next; });
                }}
                disabled={state === 'submitting'}
                autoFocus
                className={`w-full rounded-lg border px-3 py-2 text-sm text-slate-800 placeholder:text-slate-400 focus:outline-none focus:ring-1 disabled:opacity-50 ${borderClass('firstName')}`}
                placeholder="John"
              />
              <FieldError field="firstName" errors={fieldErrors} />
            </div>

            {/* Last Name */}
            <div className="mb-4">
              <label htmlFor="invite-last-name" className="mb-1 block text-sm font-medium text-slate-600">Last Name</label>
              <input
                id="invite-last-name"
                type="text"
                value={lastName}
                onChange={(e) => {
                  setLastName(e.target.value);
                  if (fieldErrors.lastName) setFieldErrors((prev) => { const next = { ...prev }; delete next.lastName; return next; });
                }}
                disabled={state === 'submitting'}
                className={`w-full rounded-lg border px-3 py-2 text-sm text-slate-800 placeholder:text-slate-400 focus:outline-none focus:ring-1 disabled:opacity-50 ${borderClass('lastName')}`}
                placeholder="Doe"
              />
              <FieldError field="lastName" errors={fieldErrors} />
            </div>

            {/* Password */}
            <div className="mb-4">
              <PasswordInput
                id="invite-password"
                label="Password"
                showStrength
                value={password}
                onChange={(e) => {
                  setPassword((e.target as HTMLInputElement).value);
                  if (fieldErrors.password) setFieldErrors((prev) => { const next = { ...prev }; delete next.password; return next; });
                }}
                disabled={state === 'submitting'}
                placeholder="••••••••"
                error={fieldErrors.password}
                hint="At least 8 characters with uppercase, lowercase, number, and special character"
              />
            </div>

            {/* Confirm Password */}
            <div className="mb-6">
              <PasswordInput
                id="invite-confirm-password"
                label="Confirm Password"
                value={confirmPassword}
                onChange={(e) => {
                  setConfirmPassword((e.target as HTMLInputElement).value);
                  if (fieldErrors.confirmPassword) setFieldErrors((prev) => { const next = { ...prev }; delete next.confirmPassword; return next; });
                }}
                disabled={state === 'submitting'}
                placeholder="••••••••"
                error={fieldErrors.confirmPassword}
              />
            </div>

            {/* Submit */}
            <Button
              type="submit"
              disabled={state === 'submitting'}
              variant="primary"
              size="lg"
              className="w-full"
              loading={state === 'submitting'}
              loadingText="Creating account…"
            >
              Create Account
            </Button>

            <p className="mt-4 text-center text-xs text-slate-400">
              Already have an account?{' '}
              <Link to="/login" className="text-indigo-600 hover:text-indigo-700">
                Sign in
              </Link>
            </p>
          </form>
        )}
      </div>
    </div>
  );
}
