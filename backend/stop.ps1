# Stop the ChannelAI local AI service (if it is running in the background).

$connection = Get-NetTCPConnection -LocalPort 8000 -State Listen -ErrorAction SilentlyContinue
if (-not $connection) {
    Write-Host "Nothing is listening on port 8000." -ForegroundColor DarkGray
    exit 0
}

foreach ($item in $connection) {
    $process = Get-Process -Id $item.OwningProcess -ErrorAction SilentlyContinue
    if ($process -and $process.ProcessName -eq 'python') {
        Stop-Process -Id $item.OwningProcess -Force
        Write-Host "Stopped the local AI service (pid $($item.OwningProcess))." -ForegroundColor Green
    }
}
