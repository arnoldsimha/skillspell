/**
 * SecuritySection — Renders either ChangePasswordView or PersonalTokensSection
 * based on the `view` prop driven by the URL path (/profile/security/password|tokens).
 *
 * Navigation is handled by ProfilePage's left-side sub-menu — no tabs or search params.
 */

import { useState } from 'react';
import { useToast } from '../../common/ToastContext.js';
import { changePassword, ApiError } from '../../../services/api/index.js';
import { useAuth } from '../../../hooks/useAuth.js';
import FormInput from '../../auth/FormInput.js';
import PasswordInput from '../../auth/PasswordInput.js';
import SubmitButton from '../../auth/SubmitButton.js';
import PersonalTokensSection from './PersonalTokensSection.js';

// ─── Types ────────────────────────────────────────────────────────────────

export type SecurityView = 'password' | 'tokens';

// ─── Main Component ───────────────────────────────────────────────────────

export default function SecuritySection({ view = 'password' }: { view?: SecurityView }) {
  return (
    <div>
      {view === 'password' && <ChangePasswordView />}
      {view === 'tokens' && <PersonalTokensSection />}
    </div>
  );
}

// ─── Change Password View ─────────────────────────────────────────────────

function ChangePasswordView() {
  const { addToast } = useToast();
  const { user } = useAuth();

  const [currentPassword, setCurrentPassword] = useState('');
  const [newPassword, setNewPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [passwordError, setPasswordError] = useState<string | null>(null);
  const [passwordLoading, setPasswordLoading] = useState(false);
  const [passwordSuccess, setPasswordSuccess] = useState(false);

  const isSsoOnly = !!user?.authProviders && !user.authProviders.includes('local');

  const validatePasswordForm = (): string | null => {
    if (!currentPassword) return 'Current password is required';
    if (!newPassword) return 'New password is required';
    if (newPassword.length < 8) return 'Password must be at least 8 characters';
    if (!/[A-Z]/.test(newPassword)) return 'Password must contain at least one uppercase letter';
    if (!/[a-z]/.test(newPassword)) return 'Password must contain at least one lowercase letter';
    if (!/\d/.test(newPassword)) return 'Password must contain at least one number';
    if (!/[!@#$%^&*()_+\-=[\]{};':"\\|,.<>/?`~]/.test(newPassword))
      return 'Password must contain at least one special character';
    if (newPassword !== confirmPassword) return 'Passwords do not match';
    if (currentPassword === newPassword) return 'New password must be different from current password';
    return null;
  };

  const handleChangePassword = async (e: React.FormEvent<HTMLFormElement>) => {
    e.preventDefault();
    setPasswordError(null);
    setPasswordSuccess(false);

    const validationError = validatePasswordForm();
    if (validationError) {
      setPasswordError(validationError);
      return;
    }

    setPasswordLoading(true);
    try {
      await changePassword({ currentPassword, newPassword });
      setPasswordSuccess(true);
      setCurrentPassword('');
      setNewPassword('');
      setConfirmPassword('');
      addToast('success', 'Password changed successfully');
    } catch (err) {
      setPasswordError(
        err instanceof ApiError ? err.message : 'Failed to change password',
      );
    } finally {
      setPasswordLoading(false);
    }
  };

  return (
    <>
      <h1 className="mb-6 text-xl font-bold text-slate-800">Change Password</h1>
      <div className="rounded-xl border border-slate-200/80 bg-white p-6 shadow-sm">
        {isSsoOnly && (
          <div className="mb-5 flex items-center gap-2 rounded-lg border border-indigo-200 bg-indigo-50 px-4 py-3 text-sm text-indigo-700">
            <svg className="h-4 w-4 shrink-0" fill="none" viewBox="0 0 24 24" strokeWidth={2} stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" d="m11.25 11.25.041-.02a.75.75 0 0 1 1.063.852l-.708 2.836a.75.75 0 0 0 1.063.853l.041-.021M21 12a9 9 0 1 1-18 0 9 9 0 0 1 18 0Zm-9-3.75h.008v.008H12V8.25Z" />
            </svg>
            Your account uses SSO for authentication. Password management is handled by your identity provider.
          </div>
        )}

        {passwordSuccess && !isSsoOnly && (
          <div className="mb-5 flex items-center gap-2 rounded-lg border border-emerald-200 bg-emerald-50 px-4 py-3 text-sm text-emerald-700">
            <svg className="h-4 w-4 shrink-0" fill="none" viewBox="0 0 24 24" strokeWidth={2} stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" d="M9 12.75 11.25 15 15 9.75M21 12a9 9 0 1 1-18 0 9 9 0 0 1 18 0Z" />
            </svg>
            Password changed successfully
          </div>
        )}

        {passwordError && !isSsoOnly && (
          <div className="mb-5 flex items-center gap-2 rounded-lg border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700">
            <svg className="h-4 w-4 shrink-0" fill="none" viewBox="0 0 24 24" strokeWidth={2} stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" d="M12 9v3.75m9-.75a9 9 0 1 1-18 0 9 9 0 0 1 18 0Zm-9 3.75h.008v.008H12v-.008Z" />
            </svg>
            {passwordError}
          </div>
        )}

        <form onSubmit={handleChangePassword} className="space-y-4">
          <FormInput
            label="Current Password"
            type="password"
            value={currentPassword}
            onChange={(e) => setCurrentPassword(e.target.value)}
            placeholder={isSsoOnly ? '' : 'Enter your current password'}
            required={!isSsoOnly}
            autoComplete="current-password"
            disabled={isSsoOnly}
          />
          <PasswordInput
            label="New Password"
            value={newPassword}
            onChange={(e) => setNewPassword(e.target.value)}
            placeholder={isSsoOnly ? '' : 'Enter a new password'}
            showStrength={!isSsoOnly}
            disabled={isSsoOnly}
          />
          <PasswordInput
            label="Confirm New Password"
            value={confirmPassword}
            onChange={(e) => setConfirmPassword(e.target.value)}
            placeholder={isSsoOnly ? '' : 'Re-enter the new password'}
            error={
              !isSsoOnly && confirmPassword && newPassword !== confirmPassword
                ? 'Passwords do not match'
                : undefined
            }
            disabled={isSsoOnly}
          />
          {!isSsoOnly && (
            <div className="pt-2">
              <SubmitButton
                type="submit"
                loading={passwordLoading}
                loadingText="Changing password…"
                disabled={!currentPassword || !newPassword || !confirmPassword}
              >
                Change Password
              </SubmitButton>
            </div>
          )}
        </form>
      </div>
    </>
  );
}
