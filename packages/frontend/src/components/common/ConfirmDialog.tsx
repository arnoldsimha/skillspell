import { useEffect } from 'react';
import { createPortal } from 'react-dom';
import { Button } from './Button.js';
import type { ButtonVariant } from './Button.js';

/**
 * Generic confirmation dialog with consistent styling.
 *
 * Replaces native `confirm()` calls with a styled modal that matches
 * the project's design system (rounded-2xl, backdrop blur, animate).
 */

interface ConfirmDialogProps {
  /** Whether the dialog is visible. */
  open: boolean;
  /** Dialog title text. */
  title: string;
  /** Dialog body / description. Can include JSX. */
  children: React.ReactNode;
  /** Label for the confirm button (default: "Confirm"). */
  confirmLabel?: string;
  /** Label for the cancel button (default: "Cancel"). */
  cancelLabel?: string;
  /** Visual variant — controls confirm button color. */
  variant?: 'danger' | 'primary' | 'warning';
  /** Called when the user confirms. */
  onConfirm: () => void;
  /** Called when the user cancels (including backdrop click). */
  onCancel: () => void;
  /** When true, the confirm button is disabled (e.g. required field not filled). */
  confirmDisabled?: boolean;
}

export default function ConfirmDialog({
  open,
  title,
  children,
  confirmLabel = 'Confirm',
  cancelLabel = 'Cancel',
  variant = 'primary',
  onConfirm,
  onCancel,
  confirmDisabled = false,
}: ConfirmDialogProps) {
  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => { if (e.key === 'Escape') onCancel(); };
    document.addEventListener('keydown', onKey);
    return () => document.removeEventListener('keydown', onKey);
  }, [open, onCancel]);

  if (!open) return null;

  const confirmBtnVariant: ButtonVariant =
    variant === 'danger'
      ? 'destructive'
      : variant === 'warning'
        ? 'destructive'
        : 'primary';

  return createPortal(
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 backdrop-blur-sm animate-backdrop"
      onClick={onCancel}
    >
      <div
        role="dialog"
        aria-modal="true"
        aria-labelledby="confirm-dialog-title"
        className="mx-4 w-full max-w-md rounded-2xl bg-white p-6 shadow-2xl animate-scale-in"
        onClick={(e) => e.stopPropagation()}
      >
        <h3 id="confirm-dialog-title" className="mb-2 text-lg font-bold text-slate-800">{title}</h3>
        <div className="mb-5 text-sm text-slate-600">{children}</div>
        <div className="flex justify-end gap-2">
          <Button
            type="button"
            onClick={onCancel}
            variant="ghost"
            size="md"
          >
            {cancelLabel}
          </Button>
          <Button
            type="button"
            onClick={onConfirm}
            disabled={confirmDisabled}
            variant={confirmBtnVariant}
            size="md"
          >
            {confirmLabel}
          </Button>
        </div>
      </div>
    </div>,
    document.body,
  );
}
