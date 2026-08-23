import React from 'react';
import { render, screen } from '@testing-library/react';
import { describe, expect, it } from 'vitest';

import { SkeletonText } from './Skeleton.jsx';

describe('Skeleton theme ownership', () => {
  it.each([
    [true, 'bg-slate-300/70'],
    [false, 'bg-slate-700/70'],
  ])('uses the explicit App theme when isLight is %s', (isLight, expectedClass) => {
    render(<SkeletonText lines={1} isLight={isLight} />);
    const line = screen.getByTestId('skeleton-text').firstElementChild;

    expect(line).toHaveClass(expectedClass);
    expect(line.className).not.toContain('dark:');
  });
});
