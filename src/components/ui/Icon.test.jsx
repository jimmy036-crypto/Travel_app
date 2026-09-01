import React from 'react';
import { render, screen } from '@testing-library/react';
import { describe, expect, it } from 'vitest';

import { Icon } from './Icon.jsx';

describe('Icon', () => {
  it('keeps decorative icons out of the accessibility tree', () => {
    const { container } = render(<Icon name="map" />);
    expect(container.querySelector('svg')).toHaveAttribute('aria-hidden', 'true');
  });

  it('can expose a title when the icon carries meaning by itself', () => {
    render(<Icon name="map" title="地圖" />);
    expect(screen.getByRole('img', { name: '地圖' })).toBeInTheDocument();
  });
});
