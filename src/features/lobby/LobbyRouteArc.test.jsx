import { act, render, screen } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import { LobbyRouteArc } from './LobbyRouteArc.jsx';

const REDUCED_MOTION_QUERY = '(prefers-reduced-motion: reduce)';
const COMPACT_VIEWPORT_QUERY = '(max-width: 767px)';

const originalMatchMedia = window.matchMedia;
const originalRequestAnimationFrame = window.requestAnimationFrame;
const originalCancelAnimationFrame = window.cancelAnimationFrame;
const originalHiddenDescriptor = Object.getOwnPropertyDescriptor(document, 'hidden');
const originalDevicePixelRatioDescriptor = Object.getOwnPropertyDescriptor(window, 'devicePixelRatio');

let canvasContext;
let getContextMock;
let requestAnimationFrameMock;
let cancelAnimationFrameMock;
let resizeObservers;
let intersectionObservers;
let mediaQueries;
let nextFrameId;
let autoIntersect;

function createCanvasContext() {
  return {
    arc: vi.fn(),
    beginPath: vi.fn(),
    clearRect: vi.fn(),
    fill: vi.fn(),
    restore: vi.fn(),
    save: vi.fn(),
    setTransform: vi.fn(),
    fillStyle: '',
    shadowBlur: 0,
    shadowColor: '',
  };
}

function createMediaQuery(query) {
  const listeners = new Set();
  const mediaQuery = {
    matches: false,
    media: query,
    addEventListener: vi.fn((eventName, listener) => {
      if (eventName === 'change') listeners.add(listener);
    }),
    removeEventListener: vi.fn((eventName, listener) => {
      if (eventName === 'change') listeners.delete(listener);
    }),
    dispatch(matches) {
      mediaQuery.matches = matches;
      listeners.forEach((listener) => listener({ matches, media: query }));
    },
  };
  return mediaQuery;
}

function restoreProperty(target, property, descriptor, fallbackValue) {
  if (descriptor) {
    Object.defineProperty(target, property, descriptor);
  } else if (fallbackValue === undefined) {
    delete target[property];
  } else {
    Object.defineProperty(target, property, {
      configurable: true,
      writable: true,
      value: fallbackValue,
    });
  }
}

describe('LobbyRouteArc', () => {
  beforeEach(() => {
    nextFrameId = 1;
    autoIntersect = true;
    resizeObservers = [];
    intersectionObservers = [];
    mediaQueries = new Map([
      [REDUCED_MOTION_QUERY, createMediaQuery(REDUCED_MOTION_QUERY)],
      [COMPACT_VIEWPORT_QUERY, createMediaQuery(COMPACT_VIEWPORT_QUERY)],
    ]);

    class ResizeObserverMock {
      constructor(callback) {
        this.callback = callback;
        this.observe = vi.fn();
        this.disconnect = vi.fn();
        resizeObservers.push(this);
      }
    }

    class IntersectionObserverMock {
      constructor(callback) {
        this.callback = callback;
        this.observe = vi.fn((target) => {
          if (autoIntersect) this.callback([{ isIntersecting: true, target }]);
        });
        this.disconnect = vi.fn();
        intersectionObservers.push(this);
      }
    }

    window.matchMedia = vi.fn((query) => (
      mediaQueries.get(query) || createMediaQuery(query)
    ));
    requestAnimationFrameMock = vi.fn(() => nextFrameId++);
    cancelAnimationFrameMock = vi.fn();
    Object.defineProperty(window, 'requestAnimationFrame', {
      configurable: true,
      writable: true,
      value: requestAnimationFrameMock,
    });
    Object.defineProperty(window, 'cancelAnimationFrame', {
      configurable: true,
      writable: true,
      value: cancelAnimationFrameMock,
    });
    Object.defineProperty(window, 'devicePixelRatio', {
      configurable: true,
      value: 3,
    });
    Object.defineProperty(document, 'hidden', {
      configurable: true,
      value: false,
    });
    vi.stubGlobal('ResizeObserver', ResizeObserverMock);
    vi.stubGlobal('IntersectionObserver', IntersectionObserverMock);
    vi.stubGlobal('CanvasRenderingContext2D', class CanvasRenderingContext2DMock {});

    canvasContext = createCanvasContext();
    getContextMock = vi
      .spyOn(HTMLCanvasElement.prototype, 'getContext')
      .mockReturnValue(canvasContext);
  });

  afterEach(() => {
    getContextMock.mockRestore();
    vi.unstubAllGlobals();
    Object.defineProperty(window, 'matchMedia', {
      configurable: true,
      writable: true,
      value: originalMatchMedia,
    });
    restoreProperty(
      window,
      'requestAnimationFrame',
      undefined,
      originalRequestAnimationFrame,
    );
    restoreProperty(
      window,
      'cancelAnimationFrame',
      undefined,
      originalCancelAnimationFrame,
    );
    restoreProperty(
      window,
      'devicePixelRatio',
      originalDevicePixelRatioDescriptor,
    );
    restoreProperty(document, 'hidden', originalHiddenDescriptor);
  });

  it('renders the decorative route visual', () => {
    render(<LobbyRouteArc />);

    expect(screen.getByTestId('lobby-route-arc')).toBeInTheDocument();
    expect(screen.getByTestId('lobby-route-arc-canvas')).toBeInTheDocument();
    expect(canvasContext.clearRect).toHaveBeenCalled();
  });

  it('keeps the entire visual hidden from assistive technology', () => {
    render(<LobbyRouteArc />);

    expect(screen.getByTestId('lobby-route-arc')).toHaveAttribute('aria-hidden', 'true');
    expect(screen.getByTestId('lobby-route-arc-fallback')).toHaveAttribute('aria-hidden', 'true');
    expect(screen.getByTestId('lobby-route-arc-canvas')).toHaveAttribute('aria-hidden', 'true');
  });

  it('does not expose any interactive or focusable target', () => {
    render(<LobbyRouteArc />);

    const visual = screen.getByTestId('lobby-route-arc');
    expect(visual).toHaveClass('pointer-events-none');
    expect(screen.getByTestId('lobby-route-arc-canvas')).toHaveClass('pointer-events-none');
    expect(visual).not.toHaveAttribute('tabindex');
    expect(visual.querySelectorAll('button, a, [tabindex]')).toHaveLength(0);
  });

  it('reflects the App-owned light and dark mode prop', () => {
    const { rerender } = render(<LobbyRouteArc mode="light" />);

    expect(screen.getByTestId('lobby-route-arc')).toHaveAttribute('data-mode', 'light');
    expect(screen.getByTestId('lobby-route-arc')).toHaveClass('from-blue-50/80');

    rerender(<LobbyRouteArc mode="dark" />);
    expect(screen.getByTestId('lobby-route-arc')).toHaveAttribute('data-mode', 'dark');
    expect(screen.getByTestId('lobby-route-arc')).toHaveClass('from-slate-950/70');
  });

  it('disconnects ResizeObserver on unmount', () => {
    const { unmount } = render(<LobbyRouteArc />);
    const observer = resizeObservers[0];

    expect(observer.observe).toHaveBeenCalledWith(screen.getByTestId('lobby-route-arc'));
    unmount();
    expect(observer.disconnect).toHaveBeenCalledTimes(1);
  });

  it('disconnects IntersectionObserver on unmount', () => {
    const { unmount } = render(<LobbyRouteArc />);
    const observer = intersectionObservers[0];

    expect(observer.observe).toHaveBeenCalledWith(screen.getByTestId('lobby-route-arc'));
    unmount();
    expect(observer.disconnect).toHaveBeenCalledTimes(1);
  });

  it('removes document and media-query listeners on unmount', () => {
    const removeDocumentListener = vi.spyOn(document, 'removeEventListener');
    const reducedMotionMedia = mediaQueries.get(REDUCED_MOTION_QUERY);
    const compactViewportMedia = mediaQueries.get(COMPACT_VIEWPORT_QUERY);
    const { unmount } = render(<LobbyRouteArc />);

    unmount();

    expect(removeDocumentListener).toHaveBeenCalledWith(
      'visibilitychange',
      expect.any(Function),
    );
    expect(reducedMotionMedia.removeEventListener).toHaveBeenCalledWith(
      'change',
      expect.any(Function),
    );
    expect(compactViewportMedia.removeEventListener).toHaveBeenCalledWith(
      'change',
      expect.any(Function),
    );
    removeDocumentListener.mockRestore();
  });

  it('cancels its scheduled animation frame on unmount', () => {
    const { unmount } = render(<LobbyRouteArc />);
    const scheduledFrame = requestAnimationFrameMock.mock.results.at(-1).value;
    const pendingTick = requestAnimationFrameMock.mock.calls.at(-1)[0];

    unmount();
    expect(cancelAnimationFrameMock).toHaveBeenCalledWith(scheduledFrame);

    const callsAfterUnmount = requestAnimationFrameMock.mock.calls.length;
    act(() => pendingTick(100));
    act(() => resizeObservers[0].callback([{
      contentRect: { width: 400, height: 144 },
    }]));
    act(() => intersectionObservers[0].callback([{ isIntersecting: true }]));
    expect(requestAnimationFrameMock).toHaveBeenCalledTimes(callsAfterUnmount);
  });

  it('renders one deterministic frame without starting a loop for reduced motion', () => {
    mediaQueries.get(REDUCED_MOTION_QUERY).matches = true;

    render(<LobbyRouteArc />);

    expect(canvasContext.clearRect).toHaveBeenCalled();
    expect(requestAnimationFrameMock).not.toHaveBeenCalled();
  });

  it('waits for IntersectionObserver visibility before starting animation', () => {
    autoIntersect = false;
    render(<LobbyRouteArc />);

    expect(requestAnimationFrameMock).not.toHaveBeenCalled();
    act(() => intersectionObservers[0].callback([{ isIntersecting: true }]));
    expect(requestAnimationFrameMock).toHaveBeenCalledTimes(1);
  });

  it('stops and resumes the loop when reduced motion changes at runtime', () => {
    render(<LobbyRouteArc />);
    const initialFrame = requestAnimationFrameMock.mock.results.at(-1).value;

    act(() => mediaQueries.get(REDUCED_MOTION_QUERY).dispatch(true));
    expect(cancelAnimationFrameMock).toHaveBeenCalledWith(initialFrame);

    const callsBeforeResume = requestAnimationFrameMock.mock.calls.length;
    act(() => mediaQueries.get(REDUCED_MOTION_QUERY).dispatch(false));
    expect(requestAnimationFrameMock.mock.calls.length).toBe(callsBeforeResume + 1);
  });

  it('falls back without crashing when a 2D Canvas context is unavailable', () => {
    getContextMock.mockReturnValue(null);

    expect(() => render(<LobbyRouteArc />)).not.toThrow();
    expect(screen.getByTestId('lobby-route-arc')).toHaveAttribute('data-canvas-state', 'fallback');
    expect(screen.getByTestId('lobby-route-arc-fallback')).toBeInTheDocument();
    expect(requestAnimationFrameMock).not.toHaveBeenCalled();
    expect(resizeObservers).toHaveLength(0);
    expect(intersectionObservers).toHaveLength(0);
  });

  it('stops offscreen and resumes only after re-entering the viewport', () => {
    render(<LobbyRouteArc />);
    const observer = intersectionObservers[0];
    const initialFrame = requestAnimationFrameMock.mock.results.at(-1).value;

    act(() => observer.callback([{ isIntersecting: false }]));
    expect(cancelAnimationFrameMock).toHaveBeenCalledWith(initialFrame);

    const callCountBeforeResume = requestAnimationFrameMock.mock.calls.length;
    act(() => observer.callback([{ isIntersecting: true }]));
    expect(requestAnimationFrameMock.mock.calls.length).toBe(callCountBeforeResume + 1);
  });

  it('stops in a hidden document and resumes after visibility returns', () => {
    render(<LobbyRouteArc />);
    const initialFrame = requestAnimationFrameMock.mock.results.at(-1).value;

    Object.defineProperty(document, 'hidden', { configurable: true, value: true });
    act(() => document.dispatchEvent(new Event('visibilitychange')));
    expect(cancelAnimationFrameMock).toHaveBeenCalledWith(initialFrame);

    const callCountBeforeResume = requestAnimationFrameMock.mock.calls.length;
    Object.defineProperty(document, 'hidden', { configurable: true, value: false });
    act(() => document.dispatchEvent(new Event('visibilitychange')));
    expect(requestAnimationFrameMock.mock.calls.length).toBe(callCountBeforeResume + 1);
  });

  it('caps DPR at 1.5 on desktop and 1.25 on compact viewports', () => {
    const { unmount } = render(<LobbyRouteArc />);
    const desktopCanvas = screen.getByTestId('lobby-route-arc-canvas');

    act(() => resizeObservers[0].callback([{
      contentRect: { width: 400, height: 144 },
    }]));
    expect(desktopCanvas.width).toBe(600);
    expect(desktopCanvas.height).toBe(216);
    unmount();

    mediaQueries.get(COMPACT_VIEWPORT_QUERY).matches = true;
    render(<LobbyRouteArc />);
    const compactCanvas = screen.getByTestId('lobby-route-arc-canvas');
    const compactObserver = resizeObservers.at(-1);
    act(() => compactObserver.callback([{
      contentRect: { width: 360, height: 96 },
    }]));
    expect(compactCanvas.width).toBe(450);
    expect(compactCanvas.height).toBe(120);
  });
});
