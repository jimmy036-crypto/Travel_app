import React from 'react';
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, expect, it, vi } from 'vitest';

import { AppSettingsMenu } from './AppSettingsMenu.jsx';

const theme = {
  cardBg: 'bg-white',
  cardBorder: 'border-slate-200',
  headerBg: 'bg-white',
  mainText: 'text-slate-950',
  subText: 'text-slate-500',
};

describe('AppSettingsMenu', () => {
  it('shows manual update check and release version actions', async () => {
    const user = userEvent.setup();
    const onCheckUpdates = vi.fn();

    render(
      <AppSettingsMenu
        t={theme}
        version="2026.07-test"
        onOpenAppearance={() => {}}
        onOpenReleaseNotes={() => {}}
        onStartFeatureTour={() => {}}
        onCheckUpdates={onCheckUpdates}
      />,
    );

    await user.click(screen.getByTestId('app-settings-trigger'));

    expect(screen.getByTestId('app-settings-check-updates')).toHaveTextContent('檢查更新');
    expect(screen.getByTestId('app-settings-version')).toHaveTextContent('2026.07-test');

    await user.click(screen.getByTestId('app-settings-check-updates'));

    expect(onCheckUpdates).toHaveBeenCalledTimes(1);
  });
});
