param(
    [Parameter(Mandatory=$true)]
    [ValidateSet("backend","frontend","prisma")]
    [string]$Service
)

$ErrorActionPreference = "Continue"

$ProjectRoot = "C:\Users\Administrator\AUTO-CARD-MARKING"
$FrontendDir = "$ProjectRoot\frontend"
$BackendDir = "$ProjectRoot\backend"

$NodeExe = "C:\Program Files\nodejs\node.exe"
$NpxCmd = "C:\Program Files\nodejs\npx.cmd"

$LogDir = "$ProjectRoot\windows-services\logs"

New-Item -ItemType Directory -Force -Path $LogDir | Out-Null

switch ($Service) {

    "backend" {
        $Port = 8000
        $WorkingDirectory = $BackendDir
        $Arguments = @("dist/server.js")
        $LogName = "backend"
        $ProcessPattern = "dist/server.js"
    }

    "frontend" {
        $Port = 3000
        $WorkingDirectory = $FrontendDir
        $Arguments = @(
            "node_modules/next/dist/bin/next",
            "start",
            "-p",
            "3000"
        )
        $LogName = "frontend"
        $ProcessPattern = "node_modules/next/dist/bin/next"
    }

    "prisma" {
        $Port = 5500
        $WorkingDirectory = $BackendDir
        $Arguments = @(
            "prisma",
            "studio",
            "--port",
            "5500",
            "--hostname",
            "127.0.0.1"
        )
        $LogName = "prisma"
        $ProcessPattern = "prisma.*studio"
    }
}

$OutLog = "$LogDir\$LogName.out.log"
$ErrLog = "$LogDir\$LogName.err.log"

function Write-ServiceLog {
    param([string]$Message)

    $Stamp = Get-Date -Format "yyyy-MM-dd HH:mm:ss"
    Add-Content -LiteralPath $OutLog -Value "[$Stamp] $Message"
}

function Get-ProjectProcesses {

    Get-CimInstance Win32_Process -ErrorAction SilentlyContinue |
        Where-Object {
            $_.CommandLine -and
            (
                $_.CommandLine -match [Regex]::Escape($ProjectRoot)
            ) -and
            (
                $_.CommandLine -match $ProcessPattern
            )
        }
}

while ($true) {

    try {

        $Processes = @(Get-ProjectProcesses)

        # ----------------------------------------------------
        # Duplicate protection
        # ----------------------------------------------------

        if ($Processes.Count -gt 1) {

            Write-ServiceLog "Duplicate $Service instances detected: $($Processes.Count)."

            foreach ($Process in $Processes) {

                try {
                    Stop-Process `
                        -Id $Process.ProcessId `
                        -Force `
                        -ErrorAction SilentlyContinue
                }
                catch {
                }
            }

            Start-Sleep -Seconds 3
        }

        # Refresh process list after duplicate cleanup.
        $Processes = @(Get-ProjectProcesses)

        # ----------------------------------------------------
        # If one project process exists, monitor it.
        # ----------------------------------------------------

        if ($Processes.Count -eq 1) {

            $ExistingPid = $Processes[0].ProcessId

            Write-ServiceLog "Existing $Service process detected. PID=$ExistingPid"

            while ($true) {

                Start-Sleep -Seconds 5

                $Alive = Get-Process `
                    -Id $ExistingPid `
                    -ErrorAction SilentlyContinue

                if (-not $Alive) {
                    Write-ServiceLog "PID=$ExistingPid stopped."
                    break
                }

                $Listener = Get-NetTCPConnection `
                    -LocalPort $Port `
                    -State Listen `
                    -ErrorAction SilentlyContinue

                if (-not $Listener) {
                    Write-ServiceLog "PID=$ExistingPid is alive but port $Port is not listening."
                    break
                }
            }

            Start-Sleep -Seconds 3
            continue
        }

        # ----------------------------------------------------
        # Start clean service
        # ----------------------------------------------------

        Write-ServiceLog "Starting $Service on port $Port."

        if ($Service -eq "prisma") {

            $Process = Start-Process `
                -FilePath $NpxCmd `
                -ArgumentList @(
                    "--no-install",
                    "prisma",
                    "studio",
                    "--port",
                    "5500",
                    "--hostname",
                    "127.0.0.1"
                ) `
                -WorkingDirectory $WorkingDirectory `
                -WindowStyle Hidden `
                -RedirectStandardOutput $OutLog `
                -RedirectStandardError $ErrLog `
                -PassThru

        }
        else {

            $Process = Start-Process `
                -FilePath $NodeExe `
                -ArgumentList $Arguments `
                -WorkingDirectory $WorkingDirectory `
                -WindowStyle Hidden `
                -RedirectStandardOutput $OutLog `
                -RedirectStandardError $ErrLog `
                -PassThru
        }

        Write-ServiceLog "$Service process launched. PID=$($Process.Id)"

        Start-Sleep -Seconds 5

        $Listener = Get-NetTCPConnection `
            -LocalPort $Port `
            -State Listen `
            -ErrorAction SilentlyContinue

        if ($Listener) {
            Write-ServiceLog "$Service is listening on port $Port."
        }
        else {
            Write-ServiceLog "$Service did not open port $Port."
        }

    }
    catch {

        Write-ServiceLog "Supervisor error: $($_.Exception.Message)"
    }

    Start-Sleep -Seconds 5
}
