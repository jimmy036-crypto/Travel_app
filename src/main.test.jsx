import React from 'react';
import { beforeEach, describe, expect, it, vi } from 'vitest';

const { createRootMock, renderMock } = vi.hoisted(() => {
  const render = vi.fn();
  return {
    createRootMock: vi.fn(() => ({ render })),
    renderMock: render,
  };
});

vi.mock('react-dom/client', () => ({
  createRoot: createRootMock,
}));

vi.mock('./App.jsx', () => ({
  default: function MockApp() {
    return <div>App</div>;
  },
}));

describe('main entry', () => {
  beforeEach(() => {
    vi.resetModules();
    createRootMock.mockClear();
    renderMock.mockClear();
    document.body.innerHTML = '<div id="root"></div>';
  });

  it('只建立一個 React root', async () => {
    await import('./main.jsx');

    expect(createRootMock).toHaveBeenCalledTimes(1);
    expect(createRootMock).toHaveBeenCalledWith(
      document.getElementById('root'),
    );
    expect(renderMock).toHaveBeenCalledTimes(1);
  });
});
