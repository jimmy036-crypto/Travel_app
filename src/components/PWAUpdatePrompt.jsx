import React, { useCallback, useEffect, useRef, useState } from 'react'
import { registerSW } from 'virtual:pwa-register'

const CHECK_INTERVAL_MS = 15 * 60 * 1000
const REMIND_LATER_MS = 30 * 60 * 1000

/**
 * PWA 新版本提示。
 *
 * - App 啟動、回到前景、重新連線及每 15 分鐘檢查一次。
 * - 使用者按「立即更新」才啟用新版，避免表單輸入被強制中斷。
 * - 按「稍後」後，30 分鐘後若新版仍在等待會再次提醒。
 */
export default function PWAUpdatePrompt() {
  const [needRefresh, setNeedRefresh] = useState(false)
  const [updating, setUpdating] = useState(false)

  const updateSWRef = useRef(null)
  const registrationRef = useRef(null)
  const swUrlRef = useRef('')
  const dismissedUntilRef = useRef(0)

  const revealWaitingUpdate = useCallback(() => {
    if (
      registrationRef.current?.waiting &&
      Date.now() >= dismissedUntilRef.current
    ) {
      setNeedRefresh(true)
    }
  }, [])

  const checkForUpdate = useCallback(async () => {
    const registration = registrationRef.current
    const swUrl = swUrlRef.current

    if (
      !registration ||
      !swUrl ||
      !navigator.onLine ||
      registration.installing
    ) {
      return
    }

    try {
      // 先以 no-store 取得 sw.js，降低 Safari／主畫面捷徑沿用舊檔的機率。
      const response = await fetch(swUrl, {
        cache: 'no-store',
        headers: {
          'cache-control': 'no-cache'
        }
      })

      if (!response.ok) return

      await registration.update()
      revealWaitingUpdate()
    } catch (error) {
      // 離線或網路不穩時不打擾使用者，下一次回前景會再檢查。
      console.warn('檢查 App 更新失敗：', error)
    }
  }, [revealWaitingUpdate])

  useEffect(() => {
    if (!('serviceWorker' in navigator)) return undefined

    let disposed = false

    const updateSW = registerSW({
      immediate: true,

      onNeedRefresh() {
        if (!disposed && Date.now() >= dismissedUntilRef.current) {
          setNeedRefresh(true)
        }
      },

      onRegisteredSW(swUrl, registration) {
        if (disposed || !registration) return

        swUrlRef.current = swUrl
        registrationRef.current = registration

        revealWaitingUpdate()
        void checkForUpdate()
      },

      onRegisterError(error) {
        console.error('Service Worker 註冊失敗：', error)
      }
    })

    updateSWRef.current = updateSW

    const handleFocus = () => {
      void checkForUpdate()
    }

    const handleVisibilityChange = () => {
      if (document.visibilityState === 'visible') {
        void checkForUpdate()
      }
    }

    const handleOnline = () => {
      void checkForUpdate()
    }

    window.addEventListener('focus', handleFocus)
    window.addEventListener('online', handleOnline)
    document.addEventListener('visibilitychange', handleVisibilityChange)

    const intervalId = window.setInterval(() => {
      void checkForUpdate()
      revealWaitingUpdate()
    }, CHECK_INTERVAL_MS)

    return () => {
      disposed = true
      window.removeEventListener('focus', handleFocus)
      window.removeEventListener('online', handleOnline)
      document.removeEventListener('visibilitychange', handleVisibilityChange)
      window.clearInterval(intervalId)
    }
  }, [checkForUpdate, revealWaitingUpdate])

  const handleUpdate = async () => {
    const updateSW = updateSWRef.current
    if (!updateSW || updating) return

    setUpdating(true)

    try {
      // true：通知 waiting worker 接管，並在接管後重新載入頁面。
      await updateSW(true)

      // 某些 iOS 版本若沒有自動重載，提供保底刷新。
      window.setTimeout(() => {
        window.location.reload()
      }, 4000)
    } catch (error) {
      console.error('套用新版失敗：', error)
      setUpdating(false)
    }
  }

  const handleLater = () => {
    dismissedUntilRef.current = Date.now() + REMIND_LATER_MS
    setNeedRefresh(false)
  }

  if (!needRefresh) return null

  return (
    <div
      className="fixed inset-x-3 bottom-3 z-[100000] mx-auto max-w-md rounded-2xl border border-blue-400/30 bg-slate-950/95 p-4 text-white shadow-2xl backdrop-blur-xl"
      style={{ paddingBottom: 'max(1rem, env(safe-area-inset-bottom))' }}
      role="status"
      aria-live="polite"
      aria-label="有新的 App 版本"
    >
      <div className="flex items-center gap-3">
        <div className="flex h-11 w-11 shrink-0 items-center justify-center rounded-xl bg-blue-500/20 text-xl">
          ✨
        </div>

        <div className="min-w-0 flex-1">
          <p className="font-black">有新的 App 版本</p>
          <p className="mt-0.5 text-xs leading-relaxed text-slate-300">
            點一下即可套用最新功能與修正。
          </p>
        </div>
      </div>

      <div className="mt-3 flex justify-end gap-2">
        <button
          type="button"
          onClick={handleLater}
          disabled={updating}
          className="min-h-11 rounded-xl px-4 text-sm font-bold text-slate-300 transition-colors hover:bg-white/10 disabled:opacity-50"
        >
          稍後
        </button>

        <button
          type="button"
          onClick={handleUpdate}
          disabled={updating}
          className="min-h-11 rounded-xl bg-blue-600 px-5 text-sm font-bold text-white shadow-lg shadow-blue-500/20 transition-all active:scale-95 disabled:cursor-not-allowed disabled:opacity-60"
        >
          {updating ? '更新中…' : '立即更新'}
        </button>
      </div>
    </div>
  )
}
