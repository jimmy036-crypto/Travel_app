param(
    [string]$Repo = "C:\Users\jimmy\PycharmProjects\travel",
    [Parameter(Mandatory = $true)]
    [string]$TaskFile
)

$ErrorActionPreference = "Stop"

if (-not (Get-Command codex -ErrorAction SilentlyContinue)) {
    throw "找不到 codex。請先確認 codex --version 可以執行。"
}

$repoPath = (Resolve-Path $Repo).Path
$taskPath = (Resolve-Path $TaskFile).Path
Set-Location $repoPath

if (-not (Test-Path ".git")) {
    throw "指定目錄不是 Git repository：$repoPath"
}

$branch = (git branch --show-current).Trim()
if (-not $branch) {
    throw "目前處於 detached HEAD，停止執行。"
}
if ($branch -in @("main", "master")) {
    throw "為避免直接修改主分支，請先建立功能分支再執行。"
}

$workingTree = git status --porcelain
if ($workingTree) {
    Write-Host "目前工作區不是乾淨狀態：" -ForegroundColor Yellow
    $workingTree | ForEach-Object { Write-Host $_ }
    throw "請先 commit、stash 或清除既有變更。"
}

$stamp = Get-Date -Format "yyyyMMdd-HHmmss"
$runDir = Join-Path $repoPath ".codex-runs"
New-Item -ItemType Directory -Force $runDir | Out-Null

$logPath = Join-Path $runDir "$stamp-full.log"
$summaryPath = Join-Path $runDir "$stamp-summary.md"
$promptPath = Join-Path $runDir "$stamp-prompt.md"

$task = [System.IO.File]::ReadAllText($taskPath)

$fixedRules = @'

---

## 無人值守固定規則

1. 先閱讀 AGENTS.md、package.json、Git 狀態及任務相關檔案。
2. 只能在目前功能分支工作，不得修改 main/master。
3. 不得 merge、deploy、firebase deploy、force push、reset --hard 或 git clean。
4. 不得讀取、修改、列印或提交 secrets、正式憑證、.env.local 或 auth token。
5. Firebase 測試只能使用 Emulator。
6. 不得刪除、skip、弱化測試，或只靠大幅增加 timeout 掩蓋問題。
7. 最多自行修補三輪；仍失敗時停止擴大修改並回報阻塞點。
8. 修改後執行任務要求的測試；若未指定，至少執行：
   - npm run agent:guardrails
   - npx tsc --noEmit
   - npm run lint
   - npm run test:run
   - npm run build
   - git diff --check
9. 全部通過後才可 commit 與 push 目前功能分支。
10. 不得合併 PR。若 gh 可用，可建立或更新 Draft PR。
11. 最後回報根因、修改檔案、測試、commit、push、人工確認與回滾方式。
'@

$prompt = $task + $fixedRules
$utf8NoBom = New-Object System.Text.UTF8Encoding($false)
[System.IO.File]::WriteAllText($promptPath, $prompt, $utf8NoBom)

Write-Host "Codex 無人值守任務開始" -ForegroundColor Cyan
Write-Host "Repository : $repoPath"
Write-Host "Branch     : $branch"
Write-Host "Task       : $taskPath"
Write-Host "Full log   : $logPath"
Write-Host "Summary    : $summaryPath"
Write-Host ""

Get-Content $promptPath -Raw |
    & codex `
        --ask-for-approval never `
        --sandbox workspace-write `
        -C $repoPath `
        exec `
        --output-last-message $summaryPath `
        - 2>&1 |
    Tee-Object -FilePath $logPath

$exitCode = $LASTEXITCODE

if ($exitCode -eq 0) {
    Write-Host ""
    Write-Host "Codex 任務完成。" -ForegroundColor Green
    Write-Host "最後摘要：$summaryPath"
    Write-Host "完整紀錄：$logPath"
} else {
    Write-Host ""
    Write-Host "Codex 任務失敗，exit code：$exitCode" -ForegroundColor Red
    Write-Host "請查看：$logPath"
    exit $exitCode
}
