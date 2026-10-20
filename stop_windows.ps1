# ==============================================================================
# PhishGuard — Stop Background Service (Windows)
# Shuts down the background security engine and stops startup autorun
# ==============================================================================

$Host.UI.RawUI.WindowTitle = "Stop PhishGuard"

Write-Host "===================================================================" -ForegroundColor Cyan
Write-Host "    PhishGuard - Terminating Background Security Engine" -ForegroundColor White
Write-Host "===================================================================" -ForegroundColor Cyan
Write-Host ""

$stopped = $false

# 1. Stop process listening on port 8000
try {
    $connections = Get-NetTCPConnection -LocalPort 8000 -ErrorAction SilentlyContinue
    if ($connections) {
        foreach ($conn in $connections) {
            $pId = $conn.OwningProcess
            if ($pId -and $pId -gt 0) {
                Stop-Process -Id $pId -Force -ErrorAction SilentlyContinue
                Write-Host "[✓] Terminated PhishGuard engine listening on port 8000 (PID: $pId)." -ForegroundColor Green
                $stopped = $true
            }
        }
    }
} catch {}

# 2. Stop any python / pythonw process running run.py
try {
    $procs = Get-CimInstance Win32_Process -Filter "Name LIKE 'python%'" -ErrorAction SilentlyContinue | Where-Object { $_.CommandLine -like "*run.py*" }
    foreach ($p in $procs) {
        Stop-Process -Id $p.ProcessId -Force -ErrorAction SilentlyContinue
        Write-Host "[✓] Terminated PhishGuard process (PID: $($p.ProcessId))." -ForegroundColor Green
        $stopped = $true
    }
} catch {}

# 3. Clean up Windows Startup shortcut if present
try {
    $startupFolder = [Environment]::GetFolderPath("Startup")
    if (Test-Path $startupFolder) {
        $vbsPath = Join-Path $startupFolder "PhishGuard_Startup.vbs"
        if (Test-Path $vbsPath) {
            Remove-Item $vbsPath -Force -ErrorAction SilentlyContinue
            Write-Host "[✓] Removed PhishGuard auto-start entry from Windows Startup." -ForegroundColor Green
        }
    }
} catch {}

Write-Host ""
if ($stopped) {
    Write-Host "[SUCCESS] PhishGuard background service has been stopped." -ForegroundColor Green
} else {
    Write-Host "[INFO] PhishGuard backend was not running." -ForegroundColor Yellow
}
Write-Host "===================================================================" -ForegroundColor Cyan
Start-Sleep -Seconds 2
exit 0
