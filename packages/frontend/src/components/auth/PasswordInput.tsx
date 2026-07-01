/**
 * Password input with show/hide toggle and visual strength indicator.
 *
 * Reusable across SetupWizard, LoginPage, and any future password forms.
 * Validates against the same rules as the backend DTOs.
 */

import { useState, useMemo, type InputHTMLAttributes } from 'react';

interface PasswordInputProps
  extends Omit<InputHTMLAttributes<HTMLInputElement>, 'type'> {
  label: string;
  /** Show the strength indicator bar. */
  showStrength?: boolean;
  /** Error message shown below the input. */
  error?: string;
  /** Hint text shown below the input. */
  hint?: string;
}

interface PasswordStrength {
  score: number;
  label: string;
  color: string;
}

function computeStrength(password: string): PasswordStrength {
  if (!password) return { score: 0, label: '', color: '' };

  let score = 0;
  if (password.length >= 8) score++;
  if (/[A-Z]/.test(password)) score++;
  if (/[a-z]/.test(password)) score++;
  if (/\d/.test(password)) score++;
  if (/[!@#$%^&*()_+\-=[\]{};':"\\|,.<>/?`~]/.test(password)) score++;

  if (score <= 2) return { score, label: 'Weak', color: 'bg-red-400' };
  if (score <= 3) return { score, label: 'Fair', color: 'bg-yellow-400' };
  if (score <= 4) return { score, label: 'Good', color: 'bg-blue-400' };
  return { score, label: 'Strong', color: 'bg-green-500' };
}

/** Eye icon — shown when password is hidden (click to reveal). */
function EyeIcon() {
  return (
    <svg
      className="h-4 w-4"
      fill="none"
      viewBox="0 0 24 24"
      strokeWidth={1.5}
      stroke="currentColor"
    >
      <path
        strokeLinecap="round"
        strokeLinejoin="round"
        d="M2.036 12.322a1.012 1.012 0 0 1 0-.639C3.423 7.51 7.36 4.5 12 4.5c4.638 0 8.573 3.007 9.963 7.178.07.207.07.431 0 .639C20.577 16.49 16.64 19.5 12 19.5c-4.638 0-8.573-3.007-9.963-7.178Z"
      />
      <path
        strokeLinecap="round"
        strokeLinejoin="round"
        d="M15 12a3 3 0 1 1-6 0 3 3 0 0 1 6 0Z"
      />
    </svg>
  );
}

/** Eye-off icon — shown when password is visible (click to hide). */
function EyeOffIcon() {
  return (
    <svg
      className="h-4 w-4"
      fill="none"
      viewBox="0 0 24 24"
      strokeWidth={1.5}
      stroke="currentColor"
    >
      <path
        strokeLinecap="round"
        strokeLinejoin="round"
        d="M3.98 8.223A10.477 10.477 0 0 0 1.934 12c1.292 4.338 5.31 7.5 10.066 7.5.993 0 1.953-.138 2.863-.395M6.228 6.228A10.451 10.451 0 0 1 12 4.5c4.756 0 8.773 3.162 10.065 7.498a10.522 10.522 0 0 1-4.293 5.774M6.228 6.228 3 3m3.228 3.228 3.65 3.65m7.894 7.894L21 21m-3.228-3.228-3.65-3.65m0 0a3 3 0 1 0-4.243-4.243m4.242 4.242L9.88 9.88"
      />
    </svg>
  );
}

export default function PasswordInput({
  label,
  showStrength = false,
  error,
  hint,
  id,
  value,
  className = '',
  ...rest
}: PasswordInputProps) {
  const [visible, setVisible] = useState(false);

  const strength = useMemo(
    () => computeStrength(typeof value === 'string' ? value : ''),
    [value],
  );

  return (
    <div>
      <label htmlFor={id} className="block text-sm font-medium text-slate-700">
        {label}
      </label>
      <div className="relative mt-1">
        <input
          id={id}
          type={visible ? 'text' : 'password'}
          value={value}
          className={`block w-full rounded-lg border px-3 py-2 pr-10 text-sm text-slate-900 placeholder-slate-400 shadow-sm transition-colors focus:outline-none focus:ring-1 ${
            error
              ? 'border-red-300 focus:border-red-500 focus:ring-red-500'
              : 'border-slate-300 focus:border-indigo-500 focus:ring-indigo-500'
          } ${className}`}
          {...rest}
        />
        <button
          type="button"
          tabIndex={-1}
          onClick={() => setVisible((v) => !v)}
          className="absolute inset-y-0 right-0 flex items-center pr-3 text-slate-400 hover:text-slate-600 transition-colors"
          aria-label={visible ? 'Hide password' : 'Show password'}
        >
          {visible ? <EyeOffIcon /> : <EyeIcon />}
        </button>
      </div>
      {/* Strength indicator */}
      {showStrength && typeof value === 'string' && value.length > 0 && (
        <div className="mt-2">
          <div className="flex gap-1">
            {[1, 2, 3, 4, 5].map((level) => (
              <div
                key={level}
                className={`h-1 flex-1 rounded-full transition-colors ${
                  level <= strength.score ? strength.color : 'bg-slate-200'
                }`}
              />
            ))}
          </div>
          <p className="mt-1 text-xs text-slate-500">{strength.label}</p>
        </div>
      )}
      {error && <p className="mt-1 text-xs text-red-500">{error}</p>}
      {!error && hint && (
        <p className="mt-1.5 text-xs text-slate-400">{hint}</p>
      )}
    </div>
  );
}
