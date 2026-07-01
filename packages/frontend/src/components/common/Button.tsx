/**
 * Shared Button component.
 *
 * Single source of truth for all action buttons across the app.
 * Provides consistent border radius, padding, font weight, and transitions.
 *
 * Visual rules:
 *   - All buttons: rounded-lg, transition-colors duration-200
 *   - Primary/destructive/success: font-semibold, shadow-sm
 *   - Secondary/ghost/link: font-medium
 *   - Disabled: opacity-50, cursor-not-allowed
 */

import React from 'react';
import Spinner from './Spinner.js';

// ── Types ──────────────────────────────────────────────────────────────────

export type ButtonVariant =
  | 'primary'             // indigo-600 bg, white text — main CTA
  | 'primary-gradient'    // from-indigo-600 to-purple-600 bg — hero/generate CTAs
  | 'secondary'           // white bg, slate border, slate text — cancel/back
  | 'ghost'               // no bg/border, slate text — subtle nav-adjacent actions
  | 'destructive'         // red-600 bg, white text — delete/reject
  | 'destructive-outline' // red border, red text — softer destructive
  | 'success'             // emerald-600 bg, white text — approve
  | 'link';               // no bg, indigo text, hover:underline — text-style actions

export type ButtonSize =
  | 'xs'  // px-2.5 py-1    text-xs — compact table actions
  | 'sm'  // px-3   py-1.5  text-sm — secondary toolbar buttons
  | 'md'  // px-4   py-2    text-sm — standard buttons (default)
  | 'lg'  // px-5   py-2.5  text-sm — primary CTAs in forms/dialogs
  | 'xl'; // px-6   py-2.5  text-sm — hero generate buttons

export interface ButtonProps extends React.ButtonHTMLAttributes<HTMLButtonElement> {
  variant?: ButtonVariant;
  size?: ButtonSize;
  loading?: boolean;
  loadingText?: string;
  leftIcon?: React.ReactNode;
  rightIcon?: React.ReactNode;
}

// ── Style maps ─────────────────────────────────────────────────────────────

const VARIANT_CLASSES: Record<ButtonVariant, string> = {
  'primary':
    'bg-indigo-600 text-white hover:bg-indigo-700 shadow-sm font-semibold',
  'primary-gradient':
    'bg-gradient-to-r from-indigo-600 to-purple-600 text-white shadow-sm hover:brightness-110 font-semibold',
  'secondary':
    'border border-slate-300 bg-white text-slate-700 hover:bg-slate-50 font-medium',
  'ghost':
    'text-slate-600 hover:bg-slate-100 font-medium',
  'destructive':
    'bg-red-600 text-white hover:bg-red-700 shadow-sm font-semibold',
  'destructive-outline':
    'border border-red-300 text-red-600 hover:bg-red-50 font-medium',
  'success':
    'bg-emerald-600 text-white hover:bg-emerald-700 shadow-sm font-semibold',
  'link':
    'text-indigo-600 hover:text-indigo-700 hover:underline font-medium',
};

const SIZE_CLASSES: Record<ButtonSize, string> = {
  xs: 'px-2.5 py-1 text-xs',
  sm: 'px-3 py-1.5 text-sm',
  md: 'px-4 py-2 text-sm',
  lg: 'px-5 py-2.5 text-sm',
  xl: 'px-6 py-2.5 text-sm',
};

// ── Component ──────────────────────────────────────────────────────────────

export function Button({
  variant = 'primary',
  size = 'md',
  loading = false,
  loadingText,
  leftIcon,
  rightIcon,
  children,
  className = '',
  disabled,
  ...rest
}: ButtonProps) {
  const isDisabled = loading || disabled;

  const baseClasses = [
    'inline-flex items-center justify-center gap-1.5',
    'rounded-lg',
    'transition-colors duration-200',
    'disabled:opacity-50 disabled:cursor-not-allowed',
    VARIANT_CLASSES[variant],
    SIZE_CLASSES[size],
  ].join(' ');

  return (
    <button
      disabled={isDisabled}
      className={`${baseClasses} ${className}`.trim()}
      {...rest}
    >
      {loading ? (
        <span className="inline-flex items-center justify-center gap-2">
          <Spinner size="sm" className="border-white/25 border-t-white" />
          {loadingText ?? children}
        </span>
      ) : (
        <>
          {leftIcon}
          {children}
          {rightIcon}
        </>
      )}
    </button>
  );
}

export default Button;
