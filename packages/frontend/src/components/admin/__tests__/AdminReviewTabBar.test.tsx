import { render, screen, fireEvent } from '@testing-library/react';
import { vi, describe, it, expect, beforeEach } from 'vitest';
import AdminReviewTabBar from '../AdminReviewTabBar.js';

describe('AdminReviewTabBar', () => {
  const baseProps = {
    activeTab: 'skill' as const,
    onTabChange: vi.fn(),
    showDiff: false,
    previousVersion: null,
    submittedVersion: 3,
    evalRunCount: 0,
  };

  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('renders Skill, Evals, Benchmark tabs always', () => {
    render(<AdminReviewTabBar {...baseProps} />);
    expect(screen.getByRole('button', { name: /skill/i })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: /evals/i })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: /benchmark/i })).toBeInTheDocument();
  });

  it('hides Diff tab when showDiff is false', () => {
    render(<AdminReviewTabBar {...baseProps} showDiff={false} />);
    expect(screen.queryByRole('button', { name: /diff/i })).not.toBeInTheDocument();
  });

  it('shows Diff tab with version range badge when showDiff is true', () => {
    render(<AdminReviewTabBar {...baseProps} showDiff previousVersion={2} submittedVersion={3} />);
    expect(screen.getByRole('button', { name: /diff/i })).toBeInTheDocument();
    expect(screen.getByText('v2 → v3')).toBeInTheDocument();
  });

  it('shows eval run count badge when evalRunCount > 0', () => {
    render(<AdminReviewTabBar {...baseProps} evalRunCount={12} />);
    expect(screen.getByText('12')).toBeInTheDocument();
  });

  it('calls onTabChange with the clicked tab key', () => {
    const onTabChange = vi.fn();
    render(<AdminReviewTabBar {...baseProps} onTabChange={onTabChange} />);
    fireEvent.click(screen.getByRole('button', { name: /benchmark/i }));
    expect(onTabChange).toHaveBeenCalledWith('benchmark');
  });

  it('marks active tab with indigo styling', () => {
    render(<AdminReviewTabBar {...baseProps} activeTab="skill" />);
    const skillBtn = screen.getByRole('button', { name: /skill/i });
    expect(skillBtn.className).toMatch(/indigo/);
  });
});
