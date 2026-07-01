/**
 * Reusable form input with label.
 *
 * Follows the project's Tailwind design system: rounded-lg borders,
 * slate color palette, indigo focus ring.
 */

import type { InputHTMLAttributes } from 'react';

interface FormInputProps extends InputHTMLAttributes<HTMLInputElement> {
  label: string;
  /** Error message shown below the input. */
  error?: string;
  /** Hint text shown below the input (lower priority than error). */
  hint?: string;
}

export default function FormInput({
  label,
  error,
  hint,
  id,
  className = '',
  ...rest
}: FormInputProps) {
  return (
    <div>
      <label htmlFor={id} className="block text-sm font-medium text-slate-700">
        {label}
      </label>
      <input
        id={id}
        className={`mt-1 block w-full rounded-lg border px-3 py-2 text-sm text-slate-900 placeholder-slate-400 shadow-sm transition-colors focus:outline-none focus:ring-1 ${
          error
            ? 'border-red-300 focus:border-red-500 focus:ring-red-500'
            : 'border-slate-300 focus:border-indigo-500 focus:ring-indigo-500'
        } ${className}`}
        {...rest}
      />
      {error && <p className="mt-1 text-xs text-red-500">{error}</p>}
      {!error && hint && (
        <p className="mt-1 text-xs text-slate-400">{hint}</p>
      )}
    </div>
  );
}
