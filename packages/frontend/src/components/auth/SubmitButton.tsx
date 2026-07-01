/**
 * Gradient submit button with loading spinner.
 *
 * Thin wrapper around the shared Button component.
 * Reusable across auth forms (login, setup wizard).
 */

import type { ReactNode } from 'react';
import { Button } from '../common/Button.js';
import type { ButtonProps } from '../common/Button.js';

interface SubmitButtonProps extends Omit<ButtonProps, 'variant' | 'size'> {
  /** Whether the button is in a loading state. */
  loading?: boolean;
  /** Text shown while loading. */
  loadingText?: string;
  /** Button content when not loading. */
  children: ReactNode;
}

export default function SubmitButton({
  loading = false,
  loadingText,
  children,
  className = '',
  disabled,
  ...rest
}: SubmitButtonProps) {
  return (
    <Button
      variant="primary-gradient"
      size="lg"
      loading={loading}
      loadingText={loadingText}
      disabled={disabled}
      className={`w-full ${className}`.trim()}
      {...rest}
    >
      {children}
    </Button>
  );
}
