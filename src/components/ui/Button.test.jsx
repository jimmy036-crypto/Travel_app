import React from 'react';
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, expect, it, vi } from 'vitest';

import { Button } from './Button.jsx';
import { Icon } from './Icon.jsx';

describe('Button', () => {
  it('has a touch-sized default and forwards interaction', async () => {
    const user = userEvent.setup();
    const onClick = vi.fn();
    render(<Button onClick={onClick} leadingIcon={<Icon name="plus" />}>建立旅程</Button>);

    const button = screen.getByRole('button', { name: '建立旅程' });
    expect(button).toHaveClass('min-h-11');
    await user.click(button);
    expect(onClick).toHaveBeenCalledTimes(1);
  });

  it('announces loading and blocks duplicate action', () => {
    render(<Button loading>儲存中</Button>);
    expect(screen.getByRole('button', { name: '儲存中' })).toBeDisabled();
    expect(screen.getByRole('button', { name: '儲存中' })).toHaveAttribute('aria-busy', 'true');
  });
});
