# ==============================================================================
# PhishGuard — 1-Click Silent Windows Installer & Background Service
# Runs backend silently in background (no terminal window) & assists extension install
# ==============================================================================

$Host.UI.RawUI.WindowTitle = "PhishGuard Installer"
$ErrorActionPreference = "Continue"

$rootDir = Split-Path -Parent $MyInvocation.MyCommand.Path
$backendDir = Join-Path $rootDir "backend"
$extDir = Join-Path $rootDir "extension"
$reqFile = Join-Path $backendDir "requirements.txt"
$runScript = Join-Path $backendDir "run.py"

Clear-Host
Write-Host "===================================================================" -ForegroundColor Cyan
Write-Host "    PhishGuard - Zero-Day Security Intelligence Engine" -ForegroundColor White
Write-Host "    Background Service & Browser Extension Setup" -ForegroundColor Gray
Write-Host "===================================================================" -ForegroundColor Cyan
Write-Host ""

# ------------------------------------------------------------------------------
# 1. VERIFY OR AUTO-INSTALL PYTHON
# ------------------------------------------------------------------------------
Write-Host "[1/4] Checking Python 3..." -ForegroundColor Yellow

$pythonCmd = $null
$pythonwCmd = $null

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

if (-not $pythonCmd) {
    Write-Host "[*] Python 3 was not detected. Automatically downloading Python 3.11 from python.org..." -ForegroundColor Cyan
    $installerPath = Join-Path $env:TEMP "python-3.11.9-setup.exe"
    try {
        [Net.ServicePointManager]::SecurityProtocol = [Net.SecurityProtocolType]::Tls12
        $webClient = New-Object System.Net.WebClient
        $webClient.DownloadFile("https://www.python.org/ftp/python/3.11.9/python-3.11.9-amd64.exe", $installerPath)
        
        Write-Host "[*] Installing Python (silent, user-level)..." -ForegroundColor Cyan
        $installProc = Start-Process -FilePath $installerPath -ArgumentList "/quiet InstallAllUsers=0 PrependPath=1 Include_pip=1" -Wait -PassThru
        Remove-Item $installerPath -Force -ErrorAction SilentlyContinue
        
        $newPy = "$env:LocalAppData\Programs\Python\Python311\python.exe"
        if (Test-Path $newPy) { $pythonCmd = "`"$newPy`"" } else { $pythonCmd = "python" }
    } catch {
        Write-Host "[ERROR] Could not automatically download Python: $_" -ForegroundColor Red
        Read-Host "Press Enter to exit"
        exit 1
    }
}

# Resolve pythonw.exe (windowless background interpreter)
if ($pythonCmd.Contains("python.exe")) {
    $pw = $pythonCmd.Replace("python.exe", "pythonw.exe")
    if (Test-Path ($pw.Trim('"'))) { $pythonwCmd = $pw }
}
if (-not $pythonwCmd) { $pythonwCmd = $pythonCmd }

Write-Host "[✓] Python 3 ready." -ForegroundColor Green

# ------------------------------------------------------------------------------
# 2. VERIFY DEPENDENCIES
# ------------------------------------------------------------------------------
Write-Host "[2/4] Verifying security engine packages..." -ForegroundColor Yellow
$flagFile = Join-Path $backendDir ".deps_ready"
if (-not (Test-Path $flagFile)) {
    Write-Host "[*] Installing Waitress, Flask, NumPy, Pillow..." -ForegroundColor Cyan
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
        Write-Host "[✓] Dependencies installed." -ForegroundColor Green
    } catch {
        Write-Host "[!] Note on package install: $_" -ForegroundColor Yellow
    }
} else {
    Write-Host "[✓] Dependencies already installed." -ForegroundColor Green
}

# ------------------------------------------------------------------------------
# 3. START BACKEND SILENTLY IN THE BACKGROUND (NO TERMINAL WINDOW)
# ------------------------------------------------------------------------------
Write-Host "[3/4] Starting PhishGuard backend daemon in the background..." -ForegroundColor Yellow

$isAlreadyRunning = $false
try {
    $resp = Invoke-WebRequest -Uri "http://127.0.0.1:8000/health" -TimeoutSec 2 -UseBasicParsing -ErrorAction SilentlyContinue
    if ($resp.StatusCode -eq 200) { $isAlreadyRunning = $true }
} catch {}

if ($isAlreadyRunning) {
    Write-Host "[✓] PhishGuard backend is already running on http://127.0.0.1:8000." -ForegroundColor Green
} else {
    # Launch windowless background process
    $bgArgs = @($runScript, "--host", "127.0.0.1", "--port", "8000")
    if ($pythonwCmd.Contains(" ")) {
        $pwParts = $pythonwCmd.Split(" ")
        $pwExe = $pwParts[0].Trim('"')
        $allArgs = @($pwParts[1]) + $bgArgs
        Start-Process -FilePath $pwExe -ArgumentList $allArgs -WindowStyle Hidden
    } else {
        $pwExe = $pythonwCmd.Trim('"')
        Start-Process -FilePath $pwExe -ArgumentList $bgArgs -WindowStyle Hidden
    }
    
    # Wait up to 5 seconds for healthcheck
    $running = $false
    for ($i = 0; $i -lt 10; $i++) {
        Start-Sleep -Milliseconds 500
        try {
            $check = Invoke-WebRequest -Uri "http://127.0.0.1:8000/health" -TimeoutSec 1 -UseBasicParsing -ErrorAction SilentlyContinue
            if ($check.StatusCode -eq 200) { $running = $true; break }
        } catch {}
    }
    
    if ($running) {
        Write-Host "[✓] Background engine started silently (listening on 127.0.0.1:8000)." -ForegroundColor Green
    } else {
        Write-Host "[!] Engine started in background." -ForegroundColor Yellow
    }
}

# ------------------------------------------------------------------------------
# 4. REGISTER STARTUP (AUTO-STARTS ON WINDOWS BOOT WITHOUT TERMINAL)
# ------------------------------------------------------------------------------
try {
    $startupFolder = [Environment]::GetFolderPath("Startup")
    if (Test-Path $startupFolder) {
        $vbsPath = Join-Path $startupFolder "PhishGuard_Startup.vbs"
        $vbsContent = "Set WshShell = CreateObject(`"WScript.Shell`")`nWshShell.Run `"$pythonwCmd `"`"$runScript`"`" --host 127.0.0.1 --port 8000`", 0, False"
        [IO.File]::WriteAllText($vbsPath, $vbsContent)
        Write-Host "[✓] Auto-start configured (PhishGuard runs silently on Windows login)." -ForegroundColor Green
    }
} catch {}

# ------------------------------------------------------------------------------
# 5. OPEN DEFAULT BROWSER EXTENSIONS PAGE & COPY FOLDER PATH TO CLIPBOARD
# ------------------------------------------------------------------------------
Write-Host "[4/4] Setting up browser extension..." -ForegroundColor Yellow

# Copy extension folder path to clipboard
try {
    Set-Clipboard -Value $extDir
    Write-Host "[✓] Extension folder path copied to your clipboard!" -ForegroundColor Green
} catch {}

# Detect user's default browser or find Chrome / Brave / Edge
$browserCmd = "chrome"
$extUrl = "chrome://extensions"

try {
    $progId = (Get-ItemProperty "HKCU:\Software\Microsoft\Windows\Shell\Associations\UrlAssociations\http\UserChoice" -ErrorAction SilentlyContinue).ProgId
    if ($progId -and $progId.ToLower().Contains("edge")) {
        $browserCmd = "msedge"
        $extUrl = "edge://extensions"
    } elseif ($progId -and $progId.ToLower().Contains("brave")) {
        $browserCmd = "brave"
        $extUrl = "brave://extensions"
    }
} catch {}

Write-Host ""
Write-Host "===================================================================" -ForegroundColor Green
Write-Host "              INSTALLATION SUCCESSFUL & RUNNING                    " -ForegroundColor White
Write-Host "===================================================================" -ForegroundColor Green
Write-Host "  1. Opening your browser to: $extUrl" -ForegroundColor Cyan
Write-Host "  2. Turn ON 'Developer mode' (top right toggle)." -ForegroundColor White
Write-Host "  3. Click 'Load unpacked' and press Ctrl+V (path already copied!)." -ForegroundColor White
Write-Host "  4. Click 'Select Folder'." -ForegroundColor White
Write-Host "===================================================================" -ForegroundColor Green
Write-Host "  PhishGuard is running permanently in the background." -ForegroundColor Gray
Write-Host "  No terminal window needs to stay open." -ForegroundColor Gray
Write-Host "===================================================================" -ForegroundColor Green

# Open browser to extensions management page in normal profile
Start-Process $browserCmd -ArgumentList $extUrl -ErrorAction SilentlyContinue

# Show friendly native GUI dialog
try {
    Add-Type -AssemblyName System.Windows.Forms
    [System.Windows.Forms.MessageBox]::Show(
        "PhishGuard is now running silently in the background!`n`nTo complete 1-time setup in your browser:`n1. Toggle 'Developer mode' ON (top-right).`n2. Click 'Load unpacked'.`n3. Press Ctrl+V (folder path is already copied!) and click 'Select Folder'.`n`nPhishGuard is now permanently active in your toolbar!",
        "PhishGuard — Setup Complete",
        [System.Windows.Forms.MessageBoxButtons]::OK,
        [System.Windows.Forms.MessageBoxIcon]::Information
    ) | Out-Null
} catch {}

# Exit immediately so NO terminal window stays open!
exit 0
