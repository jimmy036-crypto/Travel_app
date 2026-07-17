import { createRoot } from 'react-dom/client';
import App from './App.jsx';
import { GlobalModalProvider } from './components/ui/GlobalModalProvider.jsx';
import { ToastProvider } from './components/ui/ToastProvider.jsx';
import './index.css';
import { initializePwaInstallController } from './pwaInstallController.js';

const rootElement = document.getElementById('root');

if (!rootElement) {
  throw new Error('找不到 #root，無法啟動 App。');
}

// 全站只能建立一個 React root。
// Production 透過 bundled dynamic import 載入 PWA 更新提示。
initializePwaInstallController();

if (import.meta.env.PROD) {
  void import('./pwa-update-entry.jsx').catch((error) => {
    console.error('Failed to load PWA update prompt:', error);
  });
}

createRoot(rootElement).render(
  <GlobalModalProvider>
    <ToastProvider>
      <App />
    </ToastProvider>
  </GlobalModalProvider>,
);
