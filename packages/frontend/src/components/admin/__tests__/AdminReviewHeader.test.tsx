import { render, screen, fireEvent, waitFor, act } from '@testing-library/react';
import { vi, describe, it, expect, beforeEach } from 'vitest';
import AdminReviewHeader from '../AdminReviewHeader.js';

describe('AdminReviewHeader', () => {
  const baseProps = {
    skillName: 'my-skill',
    status: 'pending_review',
    submitterName: 'Alice',
    submittedAt: new Date(Date.now() - 2 * 86400000).toISOString(),
    version: '3',
    onBack: vi.fn(),
    onApprove: vi.fn().mockResolvedValue(undefined),
    onReject: vi.fn().mockResolvedValue(undefined),
  };

  beforeEach(() => vi.clearAllMocks());

  it('renders skill name, version, and submitter', () => {
    render(<AdminReviewHeader {...baseProps} />);
    expect(screen.getByText('my-skill')).toBeInTheDocument();
    expect(screen.getByText(/v3/)).toBeInTheDocument();
    expect(screen.getByText(/alice/i)).toBeInTheDocument();
  });

  it('calls onBack when back link is clicked', () => {
    render(<AdminReviewHeader {...baseProps} />);
    fireEvent.click(screen.getByText(/back to marketplace/i));
    expect(baseProps.onBack).toHaveBeenCalledOnce();
  });

  it('calls onApprove with the review note when Approve is clicked', async () => {
    render(<AdminReviewHeader {...baseProps} />);
    const noteInput = screen.getByPlaceholderText(/review note/i);
    fireEvent.change(noteInput, { target: { value: 'Looks good' } });
    // First click opens the ConfirmDialog
    fireEvent.click(screen.getByRole('button', { name: /approve/i }));
    // Confirm dialog is now open — click the confirm Approve button inside it
    const approveButtons = screen.getAllByRole('button', { name: /approve/i });
    fireEvent.click(approveButtons[approveButtons.length - 1]);
    await waitFor(() => expect(baseProps.onApprove).toHaveBeenCalledWith('Looks good'));
  });

  it('calls onReject with the review note when Reject is clicked', async () => {
    render(<AdminReviewHeader {...baseProps} />);
    const noteInput = screen.getByPlaceholderText(/review note/i);
    fireEvent.change(noteInput, { target: { value: 'Missing docs' } });
    // Reject goes directly without a confirm dialog
    fireEvent.click(screen.getByRole('button', { name: /reject/i }));
    await waitFor(() => expect(baseProps.onReject).toHaveBeenCalledWith('Missing docs'));
  });

  it('disables buttons while action is in-flight', async () => {
    let resolve!: () => void;
    const slowApprove = vi.fn(() => new Promise<void>(r => { resolve = r; }));
    render(<AdminReviewHeader {...baseProps} onApprove={slowApprove} />);
    // First click opens confirm dialog
    fireEvent.click(screen.getByRole('button', { name: /approve/i }));
    // Click the confirm button in the dialog — this starts the action and closes the dialog
    const approveButtons = screen.getAllByRole('button', { name: /approve/i });
    fireEvent.click(approveButtons[approveButtons.length - 1]);
    // Dialog is closed, action is in-flight — header buttons should be disabled
    await waitFor(() =>
      expect(screen.getByRole('button', { name: /approve/i })).toBeDisabled(),
    );
    expect(screen.getByRole('button', { name: /reject/i })).toBeDisabled();
    await act(async () => { resolve(); });
    expect(screen.getByRole('button', { name: /approve/i })).not.toBeDisabled();
    expect(screen.getByRole('button', { name: /reject/i })).not.toBeDisabled();
  });
});
