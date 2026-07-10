import React from 'react';
import {
  act,
  cleanup,
  fireEvent,
  render,
  waitFor,
} from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

vi.mock('@vis.gl/react-google-maps', () => ({
  APIProvider: ({ children }) => children,
  useMapsLibrary: () => null,
  useMap: () => null,
  AdvancedMarker: ({ children }) => children,
  Pin: () => null,
  Map: ({ children }) => <div data-testid="mock-map">{children}</div>,
}));

vi.mock('@hello-pangea/dnd', () => ({
  DragDropContext: ({ children }) => children,
  Droppable: ({ children }) => children({
    droppableProps: {},
    innerRef: () => {},
    placeholder: null,
  }),
  Draggable: ({ children }) => children(
    {
      innerRef: () => {},
      draggableProps: {},
      dragHandleProps: {},
    },
    { isDragging: false },
  ),
}));

vi.mock('./firebase', () => ({
  db: null,
  storage: null,
}));

const createJsonResponse = (value) => ({
  ok: true,
  status: 200,
  json: async () => value,
});

describe('TripDetail Emulator 景點流程', () => {
  beforeEach(() => {
    vi.resetModules();
    vi.stubEnv('VITE_USE_FIREBASE_EMULATOR', 'true');
    window.history.replaceState(null, '', '/?room=e2e-component-room');
    delete window.__TRAVEL_E2E__;

    vi.spyOn(window, 'alert').mockImplementation(() => {});
    vi.spyOn(window, 'confirm').mockReturnValue(true);
    vi.spyOn(globalThis, 'fetch').mockImplementation(
      vi.fn(async (input) => {
        const url = String(input);

        if (url.includes('geocoding-api.open-meteo.com')) {
          return createJsonResponse({
            results: [{ latitude: 25.033, longitude: 121.5654 }],
          });
        }

        return createJsonResponse({
          daily: {
            time: [],
            temperature_2m_min: [],
            temperature_2m_max: [],
            precipitation_probability_max: [],
          },
        });
      }),
    );
  });

  afterEach(() => {
    cleanup();
    delete window.__TRAVEL_E2E__;
    vi.unstubAllEnvs();
    vi.restoreAllMocks();
  });

  it('可透過 Emulator hook 新增、查看並編輯景點', async () => {
    const { default: App } = await import('./App.jsx');
    const { GlobalModalProvider } = await import('./components/ui/GlobalModalProvider.jsx');
    const { ToastProvider } = await import('./components/ui/ToastProvider.jsx');
    const view = render(
      <GlobalModalProvider>
        <ToastProvider>
          <App />
        </ToastProvider>
      </GlobalModalProvider>,
    );

    await waitFor(() => {
      expect(view.getByTestId('active-trip-view')).toBeInTheDocument();
    });

    await waitFor(() => {
      expect(typeof window.__TRAVEL_E2E__?.addTestPlace).toBe('function');
    });

    act(() => {
      window.__TRAVEL_E2E__.addTestPlace();
    });

    const placeCard = await view.findByTestId('place-card');
    expect(placeCard).toHaveTextContent('E2E 測試餐廳');

    fireEvent.click(placeCard);
    expect(await view.findByTestId('place-detail-sheet')).toBeInTheDocument();
    expect(view.getByTestId('place-detail-title')).toHaveTextContent(
      'E2E 測試餐廳',
    );

    fireEvent.click(view.getByTestId('place-detail-edit-button'));
    expect(await view.findByTestId('edit-place-modal')).toBeInTheDocument();

    fireEvent.change(view.getByTestId('place-name-input'), {
      target: { value: 'E2E 已編輯餐廳' },
    });
    fireEvent.change(view.getByTestId('place-arrival-time-input'), {
      target: { value: '12:30' },
    });
    fireEvent.change(view.getByTestId('place-stay-duration-input'), {
      target: { value: '75' },
    });
    fireEvent.change(view.getByTestId('place-note-input'), {
      target: { value: 'E2E 編輯後筆記' },
    });
    fireEvent.click(view.getByTestId('save-place-button'));

    await waitFor(() => {
      expect(view.getByText('E2E 已編輯餐廳')).toBeInTheDocument();
    });
  });
});
