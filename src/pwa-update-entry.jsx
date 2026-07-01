import React from 'react'
import { createRoot } from 'react-dom/client'
import PWAUpdatePrompt from './components/PWAUpdatePrompt.jsx'

const ROOT_ID = 'pwa-update-prompt-root'

function mountPwaUpdatePrompt() {
  if (document.getElementById(ROOT_ID)) return

  const container = document.createElement('div')
  container.id = ROOT_ID
  document.body.appendChild(container)

  createRoot(container).render(<PWAUpdatePrompt />)
}

if (document.readyState === 'loading') {
  document.addEventListener('DOMContentLoaded', mountPwaUpdatePrompt, {
    once: true
  })
} else {
  mountPwaUpdatePrompt()
}
