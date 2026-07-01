/**
 * Setup wizard component — first-run admin account creation.
 *
 * Displayed when the system detects no users have been created yet.
 * Creates the initial admin user and automatically logs them in.
 */

import React, { useState } from 'react';
import { useAuth } from '../../hooks/useAuth.js';
import AuthLayout, { BrandTitle, ErrorAlert } from './AuthLayout.js';
import FormInput from './FormInput.js';
import PasswordInput from './PasswordInput.js';
import SubmitButton from './SubmitButton.js';

export default function SetupWizard() {
  const { setup } = useAuth();
  const [formData, setFormData] = useState({
    orgName: '',
    firstName: '',
    lastName: '',
    email: '',
    password: '',
    confirmPassword: '',
    timezone: Intl.DateTimeFormat().resolvedOptions().timeZone,
  });
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);

  const updateField = (field: string, value: string) => {
    setFormData((prev) => ({ ...prev, [field]: value }));
  };

  const validateForm = (): string | null => {
    if (!formData.orgName.trim()) return 'Organization name is required';
    if (!formData.firstName.trim()) return 'First name is required';
    if (!formData.lastName.trim()) return 'Last name is required';
    if (!formData.email.trim()) return 'Email is required';
    if (!formData.password) return 'Password is required';
    if (formData.password.length < 8)
      return 'Password must be at least 8 characters';
    if (!/[A-Z]/.test(formData.password))
      return 'Password must contain at least one uppercase letter';
    if (!/[a-z]/.test(formData.password))
      return 'Password must contain at least one lowercase letter';
    if (!/\d/.test(formData.password))
      return 'Password must contain at least one number';
    if (!/[!@#$%^&*()_+\-=[\]{};':"\\|,.<>/?`~]/.test(formData.password))
      return 'Password must contain at least one special character';
    if (formData.password !== formData.confirmPassword)
      return 'Passwords do not match';
    if (!formData.timezone.trim()) return 'Timezone is required';
    return null;
  };

  const handleSubmit = async (e: React.FormEvent<HTMLFormElement>) => {
    e.preventDefault();
    setError(null);

    const validationError = validateForm();
    if (validationError) {
      setError(validationError);
      return;
    }

    setLoading(true);
    try {
      const user = await setup({
        orgName: formData.orgName.trim(),
        firstName: formData.firstName.trim(),
        lastName: formData.lastName.trim(),
        email: formData.email.trim(),
        password: formData.password,
        timezone: formData.timezone,
      });
      // Pre-populate preferences cache so useUserPreferences reads instantly
      if (user?.id) {
        try {
          localStorage.setItem(
            `skillspell_prefs_${user.id}`,
            JSON.stringify({ timezone: formData.timezone, dateFormat: 'DD/MM/YYYY' }),
          );
        } catch {
          // Non-critical — hook will fetch from API on next load
        }
      }
    } catch (err) {
      setError(
        err instanceof Error
          ? err.message
          : 'Setup failed. Please try again.',
      );
    } finally {
      setLoading(false);
    }
  };

  return (
    <AuthLayout
      title={<BrandTitle prefix="Welcome to" />}
      subtitle="Let's create your admin account to get started."
      footer="This account will have full admin privileges."
    >
      <ErrorAlert message={error} />

      <form onSubmit={handleSubmit} className="space-y-4">
        {/* Organization Name */}
        <FormInput
          id="orgName"
          label="Organization name"
          type="text"
          required
          autoFocus
          value={formData.orgName}
          onChange={(e) => updateField('orgName', e.target.value)}
          placeholder="Acme Corp"
        />

        {/* Name row */}
        <div className="grid grid-cols-2 gap-3">
          <FormInput
            id="firstName"
            label="First name"
            type="text"
            required
            value={formData.firstName}
            onChange={(e) => updateField('firstName', e.target.value)}
            placeholder="John"
          />
          <FormInput
            id="lastName"
            label="Last name"
            type="text"
            required
            value={formData.lastName}
            onChange={(e) => updateField('lastName', e.target.value)}
            placeholder="Doe"
          />
        </div>

        {/* Email */}
        <FormInput
          id="email"
          label="Email"
          type="email"
          required
          autoComplete="email"
          value={formData.email}
          onChange={(e) => updateField('email', e.target.value)}
          placeholder="admin@example.com"
        />

        {/* Timezone */}
        <div>
          <label
            htmlFor="timezone"
            className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1"
          >
            Timezone <span className="text-red-500">*</span>
          </label>
          <select
            id="timezone"
            required
            value={formData.timezone}
            onChange={(e) => updateField('timezone', e.target.value)}
            className="w-full rounded-md border border-gray-300 bg-white px-3 py-2 text-sm shadow-sm focus:border-blue-500 focus:outline-none focus:ring-1 focus:ring-blue-500 dark:border-gray-600 dark:bg-gray-700 dark:text-white"
          >
            {Intl.supportedValuesOf('timeZone').map((tz) => (
              <option key={tz} value={tz}>
                {tz}
              </option>
            ))}
          </select>
        </div>

        {/* Password */}
        <PasswordInput
          id="password"
          label="Password"
          required
          autoComplete="new-password"
          showStrength
          value={formData.password}
          onChange={(e) => updateField('password', e.target.value)}
          placeholder="••••••••"
          hint="Min 8 chars, uppercase, lowercase, number, and special character"
        />

        {/* Confirm password */}
        <PasswordInput
          id="confirmPassword"
          label="Confirm password"
          required
          autoComplete="new-password"
          value={formData.confirmPassword}
          onChange={(e) => updateField('confirmPassword', e.target.value)}
          placeholder="••••••••"
          error={
            formData.confirmPassword &&
            formData.password !== formData.confirmPassword
              ? 'Passwords do not match'
              : undefined
          }
        />

        <SubmitButton
          type="submit"
          loading={loading}
          loadingText="Creating account…"
        >
          Create Admin Account
        </SubmitButton>
      </form>
    </AuthLayout>
  );
}
