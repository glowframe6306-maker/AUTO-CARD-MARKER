$ErrorActionPreference = "Continue"

$ProjectRoot = "C:\Users\Administrator\AUTO-CARD-MARKING"

$NodePath = "$env:ProgramFiles\nodejs\node.exe"
if (-not (Test-Path $NodePath)) {
    $NodePath = "node.exe"
}

function Get-PortPids {
    param([int]$Port)

    @(
        Get-NetTCPConnection `
            -LocalPort $Port `
            -State Listen `
            -ErrorAction SilentlyContinue |
        ForEach-Object { $_.OwningProcess } |
        Where-Object { $_ -gt 0 } |
        Sort-Object -Unique
    )
}

function Stop-Port {
    param(
        [int]$Port,
        [string]$Name
    )

    Write-Host ""
    Write-Host "Stopping $Name on port $Port..." -ForegroundColor Yellow

    $pids = @(Get-PortPids -Port $Port)

    if ($pids.Count -eq 0) {
        Write-Host "$Name is not running." -ForegroundColor DarkGray
        return
    }

    foreach ($processId in $pids) {
        try {
            Stop-Process -Id $processId -Force -ErrorAction Stop
            Write-Host "Stopped PID $processId" -ForegroundColor Green
        }
        catch {
            Write-Host "Could not stop PID $processId : $($_.Exception.Message)" -ForegroundColor Red
        }
    }

    Start-Sleep -Seconds 2
}

function Start-Frontend {
    Write-Host "Starting Frontend on port 3000..." -ForegroundColor Cyan

    Start-Process `
        -FilePath $NodePath `
        -ArgumentList "node_modules/next/dist/bin/next start -p 3000" `
        -WorkingDirectory "$ProjectRoot\frontend" `
        -WindowStyle Hidden

    Start-Sleep -Seconds 5
}

function Start-Backend {
    Write-Host "Starting Backend on port 8000..." -ForegroundColor Cyan

    Start-Process `
        -FilePath $NodePath `
        -ArgumentList "dist/server.js" `
        -WorkingDirectory "$ProjectRoot\backend" `
        -WindowStyle Hidden

    Start-Sleep -Seconds 5
}

function Start-Prisma {
    Write-Host "Starting Prisma Studio on port 5500..." -ForegroundColor Cyan

    Start-Process `
        -FilePath "$env:SystemRoot\System32\cmd.exe" `
        -ArgumentList "/c npx.cmd --no-install prisma studio --port 5500 --hostname 127.0.0.1" `
        -WorkingDirectory "$ProjectRoot\backend" `
        -WindowStyle Hidden

    Start-Sleep -Seconds 5
}

function Restart-Frontend {
    Stop-Port -Port 3000 -Name "Frontend"
    Start-Frontend
}

function Restart-Backend {
    Stop-Port -Port 8000 -Name "Backend"
    Start-Backend
}

function Restart-Prisma {
    Stop-Port -Port 5500 -Name "Prisma Studio"
    Start-Prisma
}

function Restart-All {
    Write-Host ""
    Write-Host "=== RESTARTING ALL ACM SERVICES ===" -ForegroundColor Magenta

    Stop-Port -Port 3000 -Name "Frontend"
    Stop-Port -Port 8000 -Name "Backend"
    Stop-Port -Port 5500 -Name "Prisma Studio"

    Start-Frontend
    Start-Backend
    Start-Prisma

    Write-Host ""
    Write-Host "All restart commands completed." -ForegroundColor Green
}

function Force-Stop-OtherACMProcesses {
    Write-Host ""
    Write-Host "=== FORCE STOP OTHER ACM RUNTIMES ===" -ForegroundColor Red

    $processes = @(
        Get-CimInstance Win32_Process -ErrorAction SilentlyContinue |
        Where-Object {
            $_.CommandLine -and
            (
                $_.CommandLine -match [regex]::Escape($ProjectRoot) -or
                $_.CommandLine -match "AUTO-CARD-MARKING"
            )
        }
    )

    foreach ($processInfo in $processes) {
        $processId = [int]$processInfo.ProcessId

        if ($processId -eq $PID) {
            continue
        }

        $port3000 = @(Get-PortPids -Port 3000)
        $port8000 = @(Get-PortPids -Port 8000)
        $port5500 = @(Get-PortPids -Port 5500)

        if (
            $port3000 -contains $processId -or
            $port8000 -contains $processId -or
            $port5500 -contains $processId
        ) {
            continue
        }

        try {
            Stop-Process -Id $processId -Force -ErrorAction Stop
            Write-Host "Force stopped ACM process PID $processId" -ForegroundColor Yellow
        }
        catch {
            Write-Host "Could not stop PID $processId" -ForegroundColor DarkYellow
        }
    }

    Write-Host ""
    Write-Host "Other ACM runtimes force-stop completed." -ForegroundColor Green
}

function Show-Status {
    Write-Host ""
    Write-Host "=== CURRENT ACM PORT STATUS ===" -ForegroundColor Cyan
    Write-Host ""

    $items = @(
        @{ Port = 3000; Name = "Frontend" },
        @{ Port = 8000; Name = "Backend" },
        @{ Port = 5500; Name = "Prisma Studio" }
    )

    foreach ($item in $items) {
        $pids = @(Get-PortPids -Port $item.Port)

        if ($pids.Count -eq 1) {
            Write-Host "$($item.Name) : OK  | Port $($item.Port) | PID $($pids[0])" -ForegroundColor Green
        }
        elseif ($pids.Count -eq 0) {
            Write-Host "$($item.Name) : STOPPED | Port $($item.Port)" -ForegroundColor Red
        }
        else {
            Write-Host "$($item.Name) : DUPLICATE | Port $($item.Port) | PIDs $($pids -join ', ')" -ForegroundColor Red
        }
    }
}

while ($true) {

    Write-Host ""
    Write-Host "============================================" -ForegroundColor Cyan
    Write-Host "       AUTO CARD MARKING CONTROL" -ForegroundColor Cyan
    Write-Host "============================================" -ForegroundColor Cyan
    Write-Host ""
    Write-Host "[1] Restart Frontend       (3000)"
    Write-Host "[2] Restart Backend        (8000)"
    Write-Host "[3] Restart Prisma Studio  (5500)"
    Write-Host "[4] Restart ALL             (3000 + 8000 + 5500)"
    Write-Host "[5] Force Stop OTHER ACM runtimes"
    Write-Host "[S] Show Status"
    Write-Host "[Q] Quit"
    Write-Host ""

    $choice = Read-Host "Enter option"

    switch ($choice.ToUpper()) {
        "1" {
            Restart-Frontend
            Show-Status
        }

        "2" {
            Restart-Backend
            Show-Status
        }

        "3" {
            Restart-Prisma
            Show-Status
        }

        "4" {
            Restart-All
            Show-Status
        }

        "5" {
            Force-Stop-OtherACMProcesses
            Show-Status
        }

        "S" {
            Show-Status
        }

        "Q" {
            Write-Host ""
            Write-Host "Closing ACM terminal control." -ForegroundColor Cyan
            break
        }

        default {
            Write-Host ""
            Write-Host "Invalid option. Use 1, 2, 3, 4, 5, S or Q." -ForegroundColor Red
        }
    }
}
