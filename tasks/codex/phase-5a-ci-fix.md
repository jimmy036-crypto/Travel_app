# 任務：修正 Phase 5A GitHub Actions Playwright webServer 啟動失敗

## 現況

- 目前分支必須是 `test/phase-5-realtime-sync`
- GitHub Actions `Playwright E2E` job 失敗
- 失敗 step：`Run E2E with Firebase Emulator`
- 外層錯誤：
  `Error: Process from config.webServer was not able to start. Exit code: 1`
- 本機非 CI 的 `npm run test:e2e` 已通過 42/42
- 不得削弱測試或修改 production Firebase

## 目標

1. 找出 CI 中 Playwright webServer 立即退出的真正原因。
2. 檢查：
   - playwright.config.ts
   - .github/workflows/quality-gate.yml
   - package.json
   - package-lock.json
   - firebase.json
   - .firebaserc
   - CI 與本機環境變數差異
3. 如果 gh 可用且已登入，讀取目前 branch 最新 Actions 失敗 log。
4. 讓 webServer stdout/stderr 在 CI 中可見。
5. Firebase CLI 必須使用單一 exact pinned 版本。
6. CI 的 Emulator Firebase 設定只能使用非正式、非 secret 的測試 fallback。
7. 本機仍須沿用 .env.emulator.local。
8. 不得用 skip、弱化 assertion 或不合理延長 timeout 取得綠燈。

## 驗證

- npm run agent:guardrails
- npx tsc --noEmit
- npm run lint
- npm run test:run
- CI=true npx playwright test e2e/emulator-smoke.spec.ts --project="Desktop Chrome"
- CI=true npx playwright test e2e/realtime-sync.spec.ts
- npx playwright test e2e/ticket-storage.spec.ts --project="Desktop Chrome"
- npm run test:e2e
- npm run build
- git diff --check

如果完整 CI=true npm run test:e2e 可在工具時限內完成，也執行；若因外部工具 timeout 中止，需區分工具 timeout 與測試失敗。

## 完成條件

1. commit message：`fix: stabilize Firebase Emulator startup in CI`
2. push 到目前分支。
3. 如果 gh 可用，查看或等待 PR checks，但不得 merge。
4. 如果 CI 仍失敗，保留可讀的 webServer stderr，回報第一個真正錯誤。
