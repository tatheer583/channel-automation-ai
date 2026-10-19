# Start ChannelAI with everything: the local AI service + the frontend.
#
#   .\start-app.ps1
#
# Opens http://localhost:5173 (a local origin), which is the recommended way
# to use the app: a local page can always reach http://127.0.0.1, while the
# deployed GitHub Pages build is a *public* https:// page and Chrome's Local
# Network Access rule can block it from reaching your own machine.
#
# Press Ctrl+C in this window to stop the frontend (the backend keeps running;
# close its window too, or run .\backend\stop.ps1).

$ErrorActionPreference = 'Stop'
$root = Split-Path -Parent $MyInvocation.MyCommand.Path
$python = Join-Path $root 'backend\.venv\Scripts\python.exe'

if (-not (Test-Path $python)) {
    Write-Host "The backend virtual environment is missing." -ForegroundColor Red
    Write-Host "Create it once with:"
    Write-Host "  py -3.11 -m venv backend\.venv"
    Write-Host "  .\backend\.venv\Scripts\python.exe -m pip install -r backend\requirements.txt"
    exit 1
}

Write-Host "Starting the local AI service..." -ForegroundColor Cyan
Start-Process -FilePath $python `
    -ArgumentList '-m', 'uvicorn', 'app:app', '--app-dir', (Join-Path $root 'backend'), '--host', '127.0.0.1', '--port', '8000' `
    -WorkingDirectory $root -WindowStyle Minimized

$ready = $false
for ($i = 0; $i -lt 40; $i++) {
    Start-Sleep -Milliseconds 500
    try {
        $health = Invoke-RestMethod -Uri 'http://127.0.0.1:8000/api/health' -TimeoutSec 2
        $ready = $true
        break
    } catch {
        # keep waiting
    }
}

if ($ready) {
    Write-Host "Local AI service is up ($($health.service) v$($health.version), model $($health.default_model))." -ForegroundColor Green
} else {
    Write-Host "The service did not answer in time. Check the other window for errors." -ForegroundColor Yellow
}

if (-not (Test-Path (Join-Path $root 'node_modules'))) {
    Write-Host "Installing frontend dependencies (first run only)..." -ForegroundColor Cyan
    Push-Location $root
    npm install | Out-Null
    Pop-Location
}

Write-Host "Starting the frontend dev server..." -ForegroundColor Cyan
Start-Process -FilePath 'npm.cmd' -ArgumentList 'run', 'dev' -WorkingDirectory $root -WindowStyle Minimized

Start-Sleep -Seconds 5
Write-Host "Opening http://localhost:5173" -ForegroundColor Green
Start-Process 'http://localhost:5173'

Write-Host ""
Write-Host "Both windows stay open while you work. Close them to stop." -ForegroundColor DarkGray
Write-Host "Tip: run this script again any time you start working." -ForegroundColor DarkGray
