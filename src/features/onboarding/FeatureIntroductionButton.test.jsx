import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, expect, it, vi } from 'vitest';

import { FeatureIntroductionButton } from './FeatureIntroductionButton.jsx';

describe('FeatureIntroductionButton', () => {
  it('renders a reusable high-level introduction action', () => {
    render(<FeatureIntroductionButton onOpen={() => {}} />);
    const button = screen.getByTestId('feature-introduction-button');
    expect(button).toHaveTextContent('功能介紹');
    expect(button).toHaveAccessibleName('開啟功能介紹');
    expect(button).toHaveAttribute('type', 'button');
  });

  it('calls only its explicit callback', async () => {
    const user = userEvent.setup();
    const onOpen = vi.fn();
    render(<FeatureIntroductionButton onOpen={onOpen} />);
    await user.click(screen.getByTestId('feature-introduction-button'));
    expect(onOpen).toHaveBeenCalledTimes(1);
  });
});
