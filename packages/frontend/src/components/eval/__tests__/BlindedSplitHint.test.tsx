import { render, screen } from '@testing-library/react';
// Vitest runs in Node, which resolves the shared CJS package natively — so we can
// import the canonical value here (unlike the component, which must inline it for
// Vite's dev server). This lets us guard the inlined copy against drift.
import { MIN_EVAL_CASES_FOR_BLINDED_SPLIT } from '@skillspell/shared';
import { BlindedSplitHint } from '../BlindedSplitHint.js';

describe('BlindedSplitHint', () => {
  it('keeps its inlined threshold in sync with the shared canonical value', () => {
    // The component inlines the threshold (see BlindedSplitHint.tsx for why).
    // Below the shared minimum the hint must show; at/above it must not — proving
    // the inlined copy equals MIN_EVAL_CASES_FOR_BLINDED_SPLIT from @skillspell/shared.
    const { container: below } = render(
      <BlindedSplitHint caseCount={MIN_EVAL_CASES_FOR_BLINDED_SPLIT - 1} />,
    );
    expect(below.querySelector('[role="status"]')).not.toBeNull();

    const { container: at } = render(
      <BlindedSplitHint caseCount={MIN_EVAL_CASES_FOR_BLINDED_SPLIT} />,
    );
    expect(at).toBeEmptyDOMElement();
  });
  it('renders nothing when there are no test cases (empty state covers this)', () => {
    const { container } = render(<BlindedSplitHint caseCount={0} />);
    expect(container).toBeEmptyDOMElement();
  });

  it('renders nothing once the skill reaches the blinded-split minimum', () => {
    const { container } = render(
      <BlindedSplitHint caseCount={MIN_EVAL_CASES_FOR_BLINDED_SPLIT} />,
    );
    expect(container).toBeEmptyDOMElement();
  });

  it('renders nothing above the minimum', () => {
    const { container } = render(
      <BlindedSplitHint caseCount={MIN_EVAL_CASES_FOR_BLINDED_SPLIT + 3} />,
    );
    expect(container).toBeEmptyDOMElement();
  });

  it('shows the hint for every count between 1 and the minimum (exclusive)', () => {
    for (let count = 1; count < MIN_EVAL_CASES_FOR_BLINDED_SPLIT; count++) {
      const { unmount } = render(<BlindedSplitHint caseCount={count} />);
      expect(screen.getByRole('status')).toBeInTheDocument();
      unmount();
    }
  });

  it('reports the correct current count and how many more are needed', () => {
    render(<BlindedSplitHint caseCount={2} />);
    const status = screen.getByRole('status');
    // 2 existing cases...
    expect(status).toHaveTextContent('You have 2 test cases');
    // ...and (MIN - 2) more needed to reach a blinded split.
    expect(status).toHaveTextContent(
      `Add ${MIN_EVAL_CASES_FOR_BLINDED_SPLIT - 2} more`,
    );
  });

  it('uses the singular "case" when exactly one case exists', () => {
    render(<BlindedSplitHint caseCount={1} />);
    const status = screen.getByRole('status');
    expect(status).toHaveTextContent('You have 1 test case.');
    expect(status).not.toHaveTextContent('1 test cases');
  });
});
