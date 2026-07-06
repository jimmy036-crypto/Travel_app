param(
    [string]$Repo = "C:\Users\jimmy\PycharmProjects\travel",

    [Parameter(Mandatory = $true)]
    [string]$TaskFile
)

$ErrorActionPreference = "Stop"

# Prefer the npm .cmd launcher on Windows. It avoids PowerShell wrapper behavior.
$codexCommand = Get-Command codex.cmd -ErrorAction SilentlyContinue

if (-not $codexCommand) {
    $codexCommand = Get-Command codex -ErrorAction SilentlyContinue
}

if (-not $codexCommand) {
    throw "codex was not found. Run 'codex --version' first."
}

$codexExecutable = $codexCommand.Source
$repoPath = (Resolve-Path $Repo).Path
$taskPath = (Resolve-Path $TaskFile).Path

Set-Location $repoPath

if (-not (Test-Path ".git")) {
    throw "The target directory is not a Git repository: $repoPath"
}

$branch = (git branch --show-current).Trim()

if (-not $branch) {
    throw "Detached HEAD is not allowed."
}

if ($branch -in @("main", "master")) {
    throw "Refusing to run on main/master. Create a feature branch first."
}

$workingTree = git status --porcelain

if ($workingTree) {
    Write-Host "The working tree is not clean:" -ForegroundColor Yellow
    $workingTree | ForEach-Object { Write-Host $_ }
    throw "Commit, stash, or remove existing changes before running Codex."
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

## Unattended execution rules

1. Read AGENTS.md, package.json, git status, and all files related to the task.
2. Work only on the current feature branch. Do not modify main or master.
3. Do not merge, deploy, run firebase deploy, force-push, reset --hard, or git clean.
4. Do not read, print, modify, or commit secrets, production credentials, .env.local, or auth tokens.
5. Firebase tests must use the Emulator only.
6. Do not delete, skip, or weaken tests. Do not hide failures by only increasing timeouts.
7. Make at most three repair attempts. If still blocked, stop and report the blocker.
8. Run all checks required by the task. If unspecified, run at least:
   - npm run agent:guardrails
   - npx tsc --noEmit
   - npm run lint
   - npm run test:run
   - npm run build
   - git diff --check
9. Commit and push only after all required checks pass.
10. Do not merge a pull request. If gh is available, you may create or update a Draft PR.
11. Final report must include root cause, changed files, test results, commit hash, push result, manual checks, and rollback command.
'@

$prompt = $task + $fixedRules

$utf8NoBom = New-Object System.Text.UTF8Encoding($false)
[System.IO.File]::WriteAllText($promptPath, $prompt, $utf8NoBom)

Write-Host "Codex unattended task started." -ForegroundColor Cyan
Write-Host "Repository : $repoPath"
Write-Host "Branch     : $branch"
Write-Host "Task       : $taskPath"
Write-Host "Codex      : $codexExecutable"
Write-Host "Full log   : $logPath"
Write-Host "Summary    : $summaryPath"
Write-Host ""

$codexArgs = @(
    "--ask-for-approval", "never",
    "--sandbox", "workspace-write",
    "-C", $repoPath,
    "exec",
    "--output-last-message", $summaryPath,
    "-"
)

# codex exec intentionally streams progress to stderr.
# PowerShell 5.1 can wrap native stderr as NativeCommandError.
# Do not let normal progress lines terminate the unattended run.
$previousErrorActionPreference = $ErrorActionPreference
$ErrorActionPreference = "Continue"

try {
    Get-Content $promptPath -Raw |
        & $codexExecutable @codexArgs 2>&1 |
        Tee-Object -FilePath $logPath

    $exitCode = $LASTEXITCODE
}
finally {
    $ErrorActionPreference = $previousErrorActionPreference
}

Write-Host ""

if ($exitCode -eq 0) {
    Write-Host "Codex task completed." -ForegroundColor Green
    Write-Host "Summary: $summaryPath"
    Write-Host "Full log: $logPath"
} else {
    Write-Host "Codex task failed. Exit code: $exitCode" -ForegroundColor Red
    Write-Host "See log: $logPath"
    exit $exitCode
}
