import React from 'react';
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { render, screen, fireEvent, act, waitFor } from '@testing-library/react';
import App from './App.jsx';
import { set, update, get } from 'firebase/database';
import { checkForPwaUpdate } from './pwaUpdateController.js';
import * as toastModule from './components/ui/useToast.js';

// Mock Firebase
vi.mock('./firebase.js', () => ({
  db: {},
  storage: {},
}));
vi.mock('firebase/database', () => ({
  ref: vi.fn(),
  set: vi.fn(),
  update: vi.fn(),
  get: vi.fn(),
}));

// Mock PWA controller
vi.mock('./pwaUpdateController.js', () => ({
  checkForPwaUpdate: vi.fn(),
}));

// Provide test implementations for other imports
vi.mock('./components/UIComponents.jsx', () => ({
  DestinationSearch: ({ onChange, value }) => (
    <input
      data-testid="mock-dest-search"
      defaultValue={value}
      onChange={(e) => {
        // Trigger select on change for testing purposes
        if (e.target.value === 'Test Place') {
          onChange('Test Place', { lat: 25.0, lng: 121.5 });
        }
      }}
    />
  ),
  DateRangePickerModal: ({ onConfirm }) => {
    return (
      <div data-testid="mock-date-picker">
        <button
          data-testid="mock-date-picker-confirm"
          onClick={() => onConfirm('2026-01-01', '2026-01-05')}
        >
          Confirm Dates
        </button>
      </div>
    );
  },
}));

vi.mock('@vis.gl/react-google-maps', () => ({
  APIProvider: ({ children }) => <div>{children}</div>,
}));

vi.mock('./hooks/useGooglePlaces.js', () => ({
  useGooglePlaces: () => ({
    searchPlaces: vi.fn().mockResolvedValue([]),
    getPlaceDetails: vi.fn(),
    isLoaded: true,
  }),
}));

vi.mock('./helpers', async (importOriginal) => {
  const actual = await importOriginal();
  return {
    ...actual,
    readStorage: vi.fn().mockReturnValue('#d8b4e2'),
    readJsonStorage: vi.fn().mockImplementation((key) => {
      if (key === 'google-travel-my-trips') {
        return [{
          roomId: 'existing-trip',
          title: 'Existing Trip',
          destination: 'Test City',
          destLat: 25.0,
          destLng: 121.5,
          startDate: '2026-01-01',
          endDate: '2026-01-02',
          members: ['自己']
        }];
      }
      return [];
    }),
    writeStorage: vi.fn(),
    generateId: vi.fn().mockReturnValue('new-room-id'),
  };
});

describe('App - Offline Awareness', () => {
  let onLineGetter;
  let toastInfoMock;
  let toastErrorMock;

  beforeEach(() => {
    onLineGetter = vi.spyOn(window.navigator, 'onLine', 'get').mockReturnValue(true);
    
    toastInfoMock = vi.fn();
    toastErrorMock = vi.fn();
    vi.spyOn(toastModule, 'useToast').mockReturnValue({
      info: toastInfoMock,
      error: toastErrorMock,
      success: vi.fn(),
      warning: vi.fn(),
    });

    vi.clearAllMocks();
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  const fireOfflineEvent = () => {
    onLineGetter.mockReturnValue(false);
    act(() => {
      window.dispatchEvent(new Event('offline'));
    });
  };

  const fireOnlineEvent = () => {
    onLineGetter.mockReturnValue(true);
    act(() => {
      window.dispatchEvent(new Event('online'));
    });
  };

  const fillCreateForm = async () => {
    fireEvent.click(screen.getByTestId('create-trip-button'));
    
    // Fill title
    fireEvent.change(screen.getByTestId('trip-name-input'), { target: { value: 'New Test Trip' } });
    
    // Fill destination
    fireEvent.change(screen.getByTestId('mock-dest-search'), { target: { value: 'Test Place' } });
    
    // Fill dates
    fireEvent.click(screen.getByTestId('trip-date-picker-button'));
    await waitFor(() => {
      expect(screen.getByTestId('mock-date-picker')).toBeInTheDocument();
    });
    fireEvent.click(screen.getByTestId('mock-date-picker-confirm'));
  };

  it('UT-09: 初始 navigator.onLine=true 時，不顯示「已恢復連線」', () => {
    render(<App />);
    expect(toastInfoMock).not.toHaveBeenCalledWith(expect.objectContaining({ title: '已恢復連線' }));
  });

  it('UT-10: 觸發 offline，再觸發 online：顯示「已恢復連線」，標題數量必須等於 1，不使用 .first()', () => {
    render(<App />);
    
    fireOfflineEvent();
    expect(toastInfoMock).not.toHaveBeenCalledWith(expect.objectContaining({ title: '已恢復連線' }));

    fireOnlineEvent();
    
    const recoveryCalls = toastInfoMock.mock.calls.filter(call => call[0].title === '已恢復連線');
    expect(recoveryCalls).toHaveLength(1);
    expect(recoveryCalls[0][0].description).toBe('請稍候確認最新資料已同步。');
  });

  it('UT-11A: 離線建立旅程送出：Firebase set 未被呼叫，Firebase update 未被呼叫', async () => {
    render(<App />);
    fireOfflineEvent();

    await fillCreateForm();
    fireEvent.click(screen.getByRole('button', { name: '確認建立' }));

    expect(set).not.toHaveBeenCalled();
    expect(update).not.toHaveBeenCalled();
    expect(toastErrorMock).toHaveBeenCalledWith(expect.objectContaining({ title: '目前離線' }));
  });

  it('UT-11B: 離線編輯旅程送出：Firebase update 未被呼叫', async () => {
    render(<App />);
    fireOfflineEvent();

    fireEvent.click(screen.getByText('⚙️ 編輯'));
    fireEvent.click(screen.getByRole('button', { name: '儲存變更' }));

    expect(update).not.toHaveBeenCalled();
    expect(set).not.toHaveBeenCalled();
    expect(toastErrorMock).toHaveBeenCalledWith(expect.objectContaining({ title: '目前離線' }));
  });

  it('UT-12: 離線匯入旅程：Firebase get 未被呼叫', async () => {
    render(<App />);
    fireOfflineEvent();

    fireEvent.click(screen.getByTestId('import-trip-button'));
    fireEvent.change(screen.getByPlaceholderText('貼上網址或房間 ID...'), { target: { value: 'some-room-id' } });
    fireEvent.click(screen.getByRole('button', { name: '確認匯入' }));

    expect(get).not.toHaveBeenCalled();
    expect(toastErrorMock).toHaveBeenCalledWith(expect.objectContaining({ title: '目前離線' }));
  });

  it('UT-13: 離線不檢查 PWA 更新：checkForPwaUpdate 或底層 update 未被呼叫', async () => {
    render(<App />);
    fireOfflineEvent();

    fireEvent.click(screen.getByTestId('app-settings-trigger'));
    fireEvent.click(screen.getByTestId('app-settings-check-updates'));

    expect(checkForPwaUpdate).not.toHaveBeenCalled();
    expect(toastErrorMock).toHaveBeenCalledWith(expect.objectContaining({ title: '目前離線' }));
  });

  it('UT-14: 離線送出失敗後：資料不被清除、Modal 保持可操作', async () => {
    render(<App />);
    fireOfflineEvent();

    await fillCreateForm();
    fireEvent.click(screen.getByRole('button', { name: '確認建立' }));

    // Should still be visible (not closed)
    expect(screen.getByTestId('trip-name-input')).toBeInTheDocument();
    
    // Values should be preserved
    expect(screen.getByTestId('trip-name-input').value).toBe('New Test Trip');
    expect(screen.getByTestId('mock-dest-search').value).toBe('Test Place');

    // Should be able to close it manually
    fireEvent.click(screen.getByRole('button', { name: '取消' }));
    expect(screen.queryByTestId('trip-name-input')).not.toBeInTheDocument();
  });

  it('UT-15: 在線狀態下正常流程呼叫 Firebase mock', async () => {
    render(<App />);
    
    await fillCreateForm();
    
    // Need an online check just to be sure
    expect(window.navigator.onLine).toBe(true);

    // Provide a mocked set return
    set.mockResolvedValueOnce();

    await act(async () => {
      fireEvent.click(screen.getByRole('button', { name: '確認建立' }));
    });

    expect(set).toHaveBeenCalledTimes(1);
    const callArgs = set.mock.calls[0];
    expect(callArgs[1].meta).toEqual(expect.objectContaining({
      title: 'New Test Trip',
      destination: 'Test Place'
    }));
  });
});
