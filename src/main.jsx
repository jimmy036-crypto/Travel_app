import { createRoot } from 'react-dom/client';
import App from './App.jsx';
import './index.css';

const rootElement = document.getElementById('root');

if (!rootElement) {
  throw new Error('找不到 #root，無法啟動 App。');
}

// 全站只能建立一個 React root。
// PWA 更新提示由 vite.config.js 在 production build 注入 pwa-update-entry.jsx。
createRoot(rootElement).render(<App />);
