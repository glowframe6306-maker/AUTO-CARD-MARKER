$ErrorActionPreference = "Continue"

$Root = "C:\Users\Administrator\AUTO-CARD-MARKING"
$Node = "$env:ProgramFiles\nodejs\node.exe"

if (-not (Test-Path $Node)) {
    $Node = "node.exe"
}

function Get-PidsOnPort {
    param([int]$Port)

    @(
        Get-NetTCPConnection -LocalPort $Port -State Listen -ErrorAction SilentlyContinue |
        ForEach-Object { $_.OwningProcess } |
        Sort-Object -Unique
    )
}

function Restart-Port {
    param(
        [int]$Port,
        [string]$Name
    )

    Write-Host ""
    Write-Host "Restarting $Name ($Port)..." -ForegroundColor Cyan

    $pids = @(Get-PidsOnPort $Port)

    foreach ($processId in $pids) {
        try {
            Stop-Process -Id $processId -Force -ErrorAction Stop
            Write-Host "Stopped PID $processId" -ForegroundColor Yellow
        }
        catch {
            Write-Host "Failed to stop PID $processId" -ForegroundColor Red
        }
    }

    Start-Sleep -Seconds 2

    if ($Port -eq 3000) {
        Start-Process `
            -FilePath $Node `
            -ArgumentList "node_modules/next/dist/bin/next start -p 3000" `
            -WorkingDirectory "$Root\frontend" `
            -WindowStyle Hidden
    }
    elseif ($Port -eq 8000) {
        Start-Process `
            -FilePath $Node `
            -ArgumentList "dist/server.js" `
            -WorkingDirectory "$Root\backend" `
            -WindowStyle Hidden
    }
    elseif ($Port -eq 5500) {
        Start-Process `
            -FilePath "$env:SystemRoot\System32\cmd.exe" `
            -ArgumentList "/c npx.cmd --no-install prisma studio --port 5500 --hostname 127.0.0.1" `
            -WorkingDirectory "$Root\backend" `
            -WindowStyle Hidden
    }

    Write-Host "$Name restart command completed." -ForegroundColor Green
}

function Show-ACMStatus {
    Write-Host ""
    Write-Host "=== ACM STATUS ===" -ForegroundColor Cyan

    foreach ($item in @(
        @{Port=3000; Name="Frontend"},
        @{Port=8000; Name="Backend"},
        @{Port=5500; Name="Prisma Studio"}
    )) {
        $pids = @(Get-PidsOnPort $item.Port)

        if ($pids.Count -eq 1) {
            Write-Host "$($item.Name) : OK | Port $($item.Port) | PID $($pids[0])" -ForegroundColor Green
        }
        elseif ($pids.Count -eq 0) {
            Write-Host "$($item.Name) : STOPPED | Port $($item.Port)" -ForegroundColor Red
        }
        else {
            Write-Host "$($item.Name) : DUPLICATE | Port $($item.Port) | PIDs $($pids -join ', ')" -ForegroundColor Red
        }
    }

    Write-Host ""
}

function Force-Stop-OtherACM {
    Write-Host ""
    Write-Host "Force stopping other ACM runtimes..." -ForegroundColor Red

    $protected = @(
        @(Get-PidsOnPort 3000)
        @(Get-PidsOnPort 8000)
        @(Get-PidsOnPort 5500)
    ) | Sort-Object -Unique

    $processes = @(
        Get-CimInstance Win32_Process -ErrorAction SilentlyContinue |
        Where-Object {
            $_.CommandLine -and
            $_.CommandLine -match [regex]::Escape($Root)
        }
    )

    foreach ($p in $processes) {
        $processId = [int]$p.ProcessId

        if ($processId -eq $PID) {
            continue
        }

        if ($protected -contains $processId) {
            continue
        }

        try {
            Stop-Process -Id $processId -Force -ErrorAction Stop
            Write-Host "Force stopped PID $processId" -ForegroundColor Yellow
        }
        catch {
        }
    }

    Write-Host "Other ACM runtimes stopped." -ForegroundColor Green
}

Clear-Host

Write-Host "========================================" -ForegroundColor Cyan
Write-Host "       AUTO CARD MARKING TERMINAL" -ForegroundColor Cyan
Write-Host "========================================" -ForegroundColor Cyan
Write-Host ""
Write-Host "1 + ENTER  = Restart 3000"
Write-Host "2 + ENTER  = Restart 8000"
Write-Host "3 + ENTER  = Restart 5500"
Write-Host "4 + ENTER  = Restart ALL"
Write-Host "5 + ENTER  = Force Stop OTHER ACM"
Write-Host ""
Write-Host "Q + ENTER  = Close"
Write-Host ""

while ($true) {

    $inputValue = Read-Host

    switch ($inputValue.Trim()) {

        "1" {
            Restart-Port -Port 3000 -Name "Frontend"
        }

        "2" {
            Restart-Port -Port 8000 -Name "Backend"
        }

        "3" {
            Restart-Port -Port 5500 -Name "Prisma Studio"
        }

        "4" {
            Restart-Port -Port 3000 -Name "Frontend"
            Restart-Port -Port 8000 -Name "Backend"
            Restart-Port -Port 5500 -Name "Prisma Studio"
        }

        "5" {
            Force-Stop-OtherACM
        }

        "Q" {
            break
        }

        default {
            Write-Host "Unknown command. Use 1, 2, 3, 4, 5 or Q." -ForegroundColor Red
        }
    }

    Show-ACMStatus
    Write-Host "Ready." -ForegroundColor DarkGray
}
