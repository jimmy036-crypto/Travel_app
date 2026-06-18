import { createRoot } from 'react-dom/client'
import './index.css'
import App from './App.jsx'

// 移除 StrictMode，解決拖曳功能 ID 衝突的問題
createRoot(document.getElementById('root')).render(
  <App />
)