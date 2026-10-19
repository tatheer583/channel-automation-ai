# Start the ChannelAI local AI service (Windows PowerShell).
#
#   .\backend\start.ps1
#
# The service listens on http://127.0.0.1:8000 and is reachable only from
# this machine while this window stays open.

$ErrorActionPreference = 'Stop'
$root = Split-Path -Parent $MyInvocation.MyCommand.Path
$python = Join-Path $root '.venv\Scripts\python.exe'

if (-not (Test-Path $python)) {
    Write-Host "No virtual environment found." -ForegroundColor Red
    Write-Host "Create it first:"
    Write-Host "  py -3.11 -m venv backend\.venv"
    Write-Host "  .\backend\.venv\Scripts\python.exe -m pip install -r backend\requirements.txt"
    exit 1
}

Write-Host "ChannelAI local service starting on http://127.0.0.1:8000" -ForegroundColor Green
Write-Host "Press Ctrl+C to stop it." -ForegroundColor DarkGray

Set-Location $root
& $python -m uvicorn app:app --app-dir $root --host 127.0.0.1 --port 8000
