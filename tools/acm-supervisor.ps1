$ErrorActionPreference = "Continue"

$Root = "C:\Users\Administrator\AUTO-CARD-MARKING"
$BackendDir = Join-Path $Root "backend"
$FrontendDir = Join-Path $Root "frontend"
$LogsDir = Join-Path $Root "logs"

$BackendLogOut = Join-Path $LogsDir "backend.stdout.log"
$BackendLogErr = Join-Path $LogsDir "backend.stderr.log"
$FrontendLogOut = Join-Path $LogsDir "frontend.stdout.log"
$FrontendLogErr = Join-Path $LogsDir "frontend.stderr.log"
$PrismaLogOut = Join-Path $LogsDir "prisma.stdout.log"
$PrismaLogErr = Join-Path $LogsDir "prisma.stderr.log"
$SupervisorLog = Join-Path $LogsDir "acm-supervisor.log"

New-Item -ItemType Directory -Force -Path $LogsDir | Out-Null

function Write-SupervisorLog {
    param([string]$Message)

    $line = "[{0}] {1}" -f (Get-Date -Format "yyyy-MM-dd HH:mm:ss"), $Message

    Add-Content `
        -Path $SupervisorLog `
        -Value $line `
        -Encoding UTF8
}

# ------------------------------------------------------------
# SINGLE SUPERVISOR INSTANCE
# ------------------------------------------------------------

$mutexName = "Global\AUTO_CARD_MARKING_SUPERVISOR_SINGLE_INSTANCE"
$createdNew = $false

try {
    $mutex = New-Object System.Threading.Mutex(
        $true,
        $mutexName,
        [ref]$createdNew
    )

    if (-not $createdNew) {
        Write-SupervisorLog "Another supervisor instance is already running. Exiting duplicate instance."
        return
    }
}
catch {
    Write-SupervisorLog "Supervisor mutex initialization failed: $($_.Exception.Message)"
    return
}

# ------------------------------------------------------------
# PORT CHECK
# ------------------------------------------------------------

function Get-ListeningConnection {
    param([int]$Port)

    return Get-NetTCPConnection `
        -LocalPort $Port `
        -State Listen `
        -ErrorAction SilentlyContinue |
        Select-Object -First 1
}

# ------------------------------------------------------------
# START BACKEND ONLY IF PORT IS FREE
# ------------------------------------------------------------

function Ensure-Backend {

    $existing = Get-ListeningConnection 8000

    if ($existing) {
        return
    }

    Write-SupervisorLog "Backend port 8000 is free. Starting backend."

    if (-not (Test-Path (Join-Path $BackendDir "dist\server.js"))) {
        Write-SupervisorLog "Backend dist/server.js not found. Backend will not be started."
        return
    }

    Start-Process `
        -FilePath "node.exe" `
        -ArgumentList "dist/server.js" `
        -WorkingDirectory $BackendDir `
        -RedirectStandardOutput $BackendLogOut `
        -RedirectStandardError $BackendLogErr `
        -WindowStyle Hidden

    Start-Sleep -Seconds 5

    $afterStart = Get-ListeningConnection 8000

    if ($afterStart) {
        Write-SupervisorLog "Backend is now listening on port 8000."
    }
    else {
        Write-SupervisorLog "Backend has not opened port 8000 yet. It will be checked again."
    }
}

# ------------------------------------------------------------
# START FRONTEND ONLY IF PORT IS FREE
# ------------------------------------------------------------

function Ensure-Frontend {

    $existing = Get-ListeningConnection 3000

    if ($existing) {
        return
    }

    Write-SupervisorLog "Frontend port 3000 is free. Starting frontend."

    if (-not (Test-Path (Join-Path $FrontendDir ".next\BUILD_ID"))) {
        Write-SupervisorLog "Frontend production build not found. Frontend will not be started."
        return
    }

    Start-Process `
        -FilePath "node.exe" `
        -ArgumentList "node_modules/next/dist/bin/next","start","-p","3000" `
        -WorkingDirectory $FrontendDir `
        -RedirectStandardOutput $FrontendLogOut `
        -RedirectStandardError $FrontendLogErr `
        -WindowStyle Hidden

    Start-Sleep -Seconds 5

    $afterStart = Get-ListeningConnection 3000

    if ($afterStart) {
        Write-SupervisorLog "Frontend is now listening on port 3000."
    }
    else {
        Write-SupervisorLog "Frontend has not opened port 3000 yet. It will be checked again."
    }
}

# ------------------------------------------------------------
# START PRISMA ONLY IF PORT IS FREE
# ------------------------------------------------------------

function Ensure-Prisma {

    $existing = Get-ListeningConnection 5500

    if ($existing) {
        return
    }

    Write-SupervisorLog "Prisma Studio port 5500 is free. Starting Prisma Studio."

    Start-Process `
        -FilePath "npx.cmd" `
        -ArgumentList "--no-install","prisma","studio","--port","5500","--hostname","127.0.0.1" `
        -WorkingDirectory $BackendDir `
        -RedirectStandardOutput $PrismaLogOut `
        -RedirectStandardError $PrismaLogErr `
        -WindowStyle Hidden

    Start-Sleep -Seconds 5

    $afterStart = Get-ListeningConnection 5500

    if ($afterStart) {
        Write-SupervisorLog "Prisma Studio is now listening on port 5500."
    }
    else {
        Write-SupervisorLog "Prisma Studio has not opened port 5500 yet. It will be checked again."
    }
}

Write-SupervisorLog "Supervisor started. Monitoring ports 3000, 8000 and 5500."

# ------------------------------------------------------------
# MAIN LOOP
# ------------------------------------------------------------

while ($true) {

    try {
        Ensure-Backend
    }
    catch {
        Write-SupervisorLog "Backend supervisor error: $($_.Exception.Message)"
    }

    try {
        Ensure-Frontend
    }
    catch {
        Write-SupervisorLog "Frontend supervisor error: $($_.Exception.Message)"
    }

    try {
        Ensure-Prisma
    }
    catch {
        Write-SupervisorLog "Prisma supervisor error: $($_.Exception.Message)"
    }

    Start-Sleep -Seconds 10
}
