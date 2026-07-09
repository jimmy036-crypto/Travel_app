import { describe, expect, it } from 'vitest'

import {
  formatStayTime,
  getInclusiveDayCount,
  isValidCoordinates,
  minsToTime,
  safeUrlFormatter,
  timeToMins,
} from './helpers.js'

describe('時間轉換工具', () => {
  it('可以把 09:30 轉成 570 分鐘', () => {
    expect(timeToMins('09:30')).toBe(570)
  })

  it('不接受超過 23 點的時間', () => {
    expect(timeToMins('24:00')).toBe(0)
  })

  it('可以把 570 分鐘轉回 09:30', () => {
    expect(minsToTime(570)).toBe('09:30')
  })

  it('超過一天時會正規化時間', () => {
    expect(minsToTime(1500)).toBe('01:00')
  })

  it('可以顯示一小時三十分鐘', () => {
    expect(formatStayTime(90)).toBe('1 小時 30 分鐘')
  })
})

describe('旅程日期工具', () => {
  it('9 月 20 日到 9 月 22 日包含三天', () => {
    expect(
      getInclusiveDayCount('2026-09-20', '2026-09-22'),
    ).toBe(3)
  })

  it('結束日期早於開始日期時回傳 0', () => {
    expect(
      getInclusiveDayCount('2026-09-22', '2026-09-20'),
    ).toBe(0)
  })
})

describe('網址安全處理', () => {
  it('沒有協定時自動加入 https', () => {
    expect(safeUrlFormatter('example.com')).toBe(
      'https://example.com/',
    )
  })

  it('阻擋 javascript 網址', () => {
    expect(
      safeUrlFormatter('javascript:alert(1)'),
    ).toBe('')
  })
})

describe('座標驗證', () => {
  it('接受有效的台北座標', () => {
    expect(
      isValidCoordinates({
        lat: 25.033,
        lng: 121.5654,
      }),
    ).toBe(true)
  })

  it('拒絕超過緯度範圍的座標', () => {
    expect(
      isValidCoordinates({
        lat: 100,
        lng: 121,
      }),
    ).toBe(false)
  })
})