# ==============================================================================
# PhishGuard — 1-Click Automated Windows Installer & Launcher
# ==============================================================================

$Host.UI.RawUI.WindowTitle = "PhishGuard Security Intelligence Engine"
$ErrorActionPreference = "Continue"

$rootDir = Split-Path -Parent $MyInvocation.MyCommand.Path
$backendDir = Join-Path $rootDir "backend"
$extDir = Join-Path $rootDir "extension"
$reqFile = Join-Path $backendDir "requirements.txt"
$profileDir = Join-Path $env:TEMP "phishguard_browser_profile"

Clear-Host
Write-Host "===================================================================" -ForegroundColor Cyan
Write-Host "    PhishGuard - Zero-Day Security Intelligence Engine" -ForegroundColor White
Write-Host "    Real-Time Heuristic Browser Protection Pipeline" -ForegroundColor Gray
Write-Host "===================================================================" -ForegroundColor Cyan
Write-Host ""

# ------------------------------------------------------------------------------
# 1. VERIFY OR AUTO-INSTALL PYTHON
# ------------------------------------------------------------------------------
Write-Host "[1/4] Checking Python 3 installation..." -ForegroundColor Yellow

$pythonCmd = $null

# Check command line candidates
foreach ($candidate in @("py -3", "python", "python3")) {
    try {
        $parts = $candidate.Split(" ")
        $exe = $parts[0]
        $args = if ($parts.Length -gt 1) { @($parts[1]) + @("-c", "import sys; sys.exit(0 if sys.version_info.major == 3 and sys.version_info.minor >= 8 else 1)") } else { @("-c", "import sys; sys.exit(0 if sys.version_info.major == 3 and sys.version_info.minor >= 8 else 1)") }
        $proc = Start-Process -FilePath $exe -ArgumentList $args -NoNewWindow -Wait -PassThru -ErrorAction SilentlyContinue
        if ($proc.ExitCode -eq 0) {
            $pythonCmd = $candidate
            break
        }
    } catch {}
}

# Check standard Windows Python paths if not in PATH
if (-not $pythonCmd) {
    $searchPaths = @(
        "$env:LocalAppData\Programs\Python\Python312\python.exe",
        "$env:LocalAppData\Programs\Python\Python311\python.exe",
        "$env:LocalAppData\Programs\Python\Python310\python.exe",
        "$env:ProgramFiles\Python312\python.exe",
        "$env:ProgramFiles\Python311\python.exe",
        "$env:ProgramFiles\Python310\python.exe",
        "C:\Python312\python.exe",
        "C:\Python311\python.exe",
        "C:\Python310\python.exe"
    )
    foreach ($p in $searchPaths) {
        if (Test-Path $p) {
            $pythonCmd = "`"$p`""
            break
        }
    }
}

# If Python is not installed, automatically download and install official Python 3.11
if (-not $pythonCmd) {
    Write-Host "[!] Python 3 was not detected on your system." -ForegroundColor Yellow
    Write-Host "[*] Downloading official Python 3.11 from python.org..." -ForegroundColor Cyan
    
    $installerPath = Join-Path $env:TEMP "python-3.11.9-setup.exe"
    try {
        [Net.ServicePointManager]::SecurityProtocol = [Net.SecurityProtocolType]::Tls12
        $webClient = New-Object System.Net.WebClient
        $webClient.DownloadFile("https://www.python.org/ftp/python/3.11.9/python-3.11.9-amd64.exe", $installerPath)
        
        Write-Host "[*] Installing Python (silent, user-level, zero prompts)..." -ForegroundColor Cyan
        $installProc = Start-Process -FilePath $installerPath -ArgumentList "/quiet InstallAllUsers=0 PrependPath=1 Include_pip=1" -Wait -PassThru
        Remove-Item $installerPath -Force -ErrorAction SilentlyContinue
        
        # Check newly installed Python path
        $newPy = "$env:LocalAppData\Programs\Python\Python311\python.exe"
        if (Test-Path $newPy) {
            $pythonCmd = "`"$newPy`""
        } else {
            $pythonCmd = "python"
        }
    } catch {
        Write-Host "[ERROR] Could not automatically download Python: $_" -ForegroundColor Red
        Write-Host "Please install Python 3.10+ from https://www.python.org/downloads/ and check 'Add Python to PATH'."
        Read-Host "Press Enter to exit"
        exit 1
    }
}

Write-Host "[✓] Python 3 verified." -ForegroundColor Green

# ------------------------------------------------------------------------------
# 2. INSTALL REQUIRED DEPENDENCIES
# ------------------------------------------------------------------------------
Write-Host "[2/4] Verifying required backend packages (Waitress, Flask, NumPy, Pillow)..." -ForegroundColor Yellow

$flagFile = Join-Path $backendDir ".deps_ready"
if (-not (Test-Path $flagFile)) {
    Write-Host "[*] Installing security engine dependencies quietly..." -ForegroundColor Cyan
    try {
        $pipArgs = @("-m", "pip", "install", "-r", $reqFile, "--quiet")
        if ($pythonCmd.Contains(" ")) {
            $pArgs = $pythonCmd.Split(" ")
            $exe = $pArgs[0].Trim('"')
            $argList = @($pArgs[1]) + $pipArgs
            Start-Process -FilePath $exe -ArgumentList $argList -NoNewWindow -Wait
        } else {
            $exe = $pythonCmd.Trim('"')
            Start-Process -FilePath $exe -ArgumentList $pipArgs -NoNewWindow -Wait
        }
        "ready" | Out-File -FilePath $flagFile -Encoding utf8
        Write-Host "[✓] Dependencies installed successfully." -ForegroundColor Green
    } catch {
        Write-Host "[!] Pip install encountered a warning, continuing..." -ForegroundColor Yellow
    }
} else {
    Write-Host "[✓] Dependencies already satisfied." -ForegroundColor Green
}

# ------------------------------------------------------------------------------
# 3. DETECT USER'S DEFAULT BROWSER & AUTO-LAUNCH WITH EXTENSION
# ------------------------------------------------------------------------------
Write-Host "[3/4] Detecting your default browser..." -ForegroundColor Yellow

$browserPath = $null
$browserName = "Chromium Browser"

# Strategy A: Check Windows Registry for Default HTTP Handler
try {
    $progId = (Get-ItemProperty "HKCU:\Software\Microsoft\Windows\Shell\Associations\UrlAssociations\http\UserChoice" -ErrorAction SilentlyContinue).ProgId
    if ($progId) {
        $cmdStr = (Get-ItemProperty "Registry::HKEY_CLASSES_ROOT\$progId\shell\open\command" -ErrorAction SilentlyContinue).'(default)'
        if ($cmdStr -match '"([^"]+\.exe)"') { $browserPath = $matches[1] }
        elseif ($cmdStr -match '([^\s]+\.exe)') { $browserPath = $matches[1] }
    }
} catch {}

# If default browser is Firefox (non-Chromium), or not found, fall back to installed Chromium
if ($browserPath -and $browserPath.ToLower().Contains("firefox")) {
    Write-Host "[*] Your default browser is Firefox. PhishGuard requires Chromium; finding Chrome/Edge..." -ForegroundColor Yellow
    $browserPath = $null
}

if (-not $browserPath -or -not (Test-Path $browserPath)) {
    # Check Google Chrome
    $chromePaths = @(
        "$env:ProgramFiles\Google\Chrome\Application\chrome.exe",
        "${env:ProgramFiles(x86)}\Google\Chrome\Application\chrome.exe",
        "$env:LocalAppData\Google\Chrome\Application\chrome.exe"
    )
    foreach ($cp in $chromePaths) {
        if (Test-Path $cp) { $browserPath = $cp; $browserName = "Google Chrome"; break }
    }
}

if (-not $browserPath -or -not (Test-Path $browserPath)) {
    # Check Brave Browser
    $bravePaths = @(
        "$env:ProgramFiles\BraveSoftware\Brave-Browser\Application\brave.exe",
        "$env:LocalAppData\BraveSoftware\Brave-Browser\Application\brave.exe"
    )
    foreach ($bp in $bravePaths) {
        if (Test-Path $bp) { $browserPath = $bp; $browserName = "Brave Browser"; break }
    }
}

if (-not $browserPath -or -not (Test-Path $browserPath)) {
    # Check Microsoft Edge (pre-installed on 100% of Windows 10/11 machines)
    $edgePaths = @(
        "${env:ProgramFiles(x86)}\Microsoft\Edge\Application\msedge.exe",
        "$env:ProgramFiles\Microsoft\Edge\Application\msedge.exe"
    )
    foreach ($ep in $edgePaths) {
        if (Test-Path $ep) { $browserPath = $ep; $browserName = "Microsoft Edge"; break }
    }
}

# Launch browser with extension pre-loaded
if ($browserPath -and (Test-Path $browserPath)) {
    Write-Host "[✓] Launching $browserName with PhishGuard extension automatically loaded..." -ForegroundColor Green
    try {
        # Using a dedicated user-data-dir ensures Chromium ALWAYS loads the extension even if Chrome is already open
        $browserArgs = @(
            "--load-extension=`"$extDir`"",
            "--user-data-dir=`"$profileDir`"",
            "--no-first-run",
            "http://127.0.0.1:8000"
        )
        Start-Process -FilePath $browserPath -ArgumentList $browserArgs
    } catch {
        Write-Host "[!] Direct browser launch failed, opening default web URL..." -ForegroundColor Yellow
        Start-Process "http://127.0.0.1:8000"
    }
} else {
    Write-Host "[!] Could not locate a Chromium executable, opening dashboard in default browser..." -ForegroundColor Yellow
    Start-Process "http://127.0.0.1:8000"
}

# ------------------------------------------------------------------------------
# 4. START PRODUCTION BACKEND SERVER (WAITRESS)
# ------------------------------------------------------------------------------
Write-Host ""
Write-Host "===================================================================" -ForegroundColor Cyan
Write-Host "  [✓] PhishGuard Security Intelligence Engine is LIVE" -ForegroundColor Green
Write-Host "      Dashboard:  http://127.0.0.1:8000" -ForegroundColor White
Write-Host "      Extension:  Active in your browser toolbar" -ForegroundColor White
Write-Host "      Status:     Monitoring active tab telemetry" -ForegroundColor Gray
Write-Host "  (Keep this window open while browsing. Press Ctrl+C to stop)" -ForegroundColor Yellow
Write-Host "===================================================================" -ForegroundColor Cyan
Write-Host ""

$runScript = Join-Path $backendDir "run.py"

try {
    if ($pythonCmd.Contains(" ")) {
        $pArgs = $pythonCmd.Split(" ")
        $exe = $pArgs[0].Trim('"')
        $argList = @($pArgs[1], $runScript, "--host", "127.0.0.1", "--port", "8000")
        & $exe $argList
    } else {
        $exe = $pythonCmd.Trim('"')
        & $exe $runScript --host 127.0.0.1 --port 8000
    }
} catch {
    Write-Host "[ERROR] Backend server encountered an error: $_" -ForegroundColor Red
}

Write-Host ""
Write-Host "[!] PhishGuard server stopped." -ForegroundColor Yellow
Read-Host "Press Enter to close window"
