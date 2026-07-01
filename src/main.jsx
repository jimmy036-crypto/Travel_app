import { createRoot } from 'react-dom/client'
import React from "react";
import ReactDOM from "react-dom/client";
import App from "./App.jsx";
import PWAUpdatePrompt from "./components/PWAUpdatePrompt.jsx";
import "./index.css";

ReactDOM.createRoot(document.getElementById("root")).render(
  <React.StrictMode>
    <App />
    <PWAUpdatePrompt />
  </React.StrictMode>
);

// 移除 StrictMode，解決拖曳功能 ID 衝突的問題
createRoot(document.getElementById('root')).render(
  <App />
)