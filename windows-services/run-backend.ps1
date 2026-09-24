$ErrorActionPreference = "Continue"

$ProjectRoot = "C:\Users\Administrator\AUTO-CARD-MARKING"
$BackendDir = "C:\Users\Administrator\AUTO-CARD-MARKING\backend"
$NodeExe = "C:\Program Files\nodejs\node.exe"
$NpmCmd = "C:\Program Files\nodejs\npm.cmd"
$LogDir = "C:\Users\Administrator\AUTO-CARD-MARKING\windows-services\logs"

$OutLog = Join-Path $LogDir "backend.out.log"
$ErrLog = Join-Path $LogDir "backend.err.log"

function Write-Log {
    param([string]$Message)

    $Stamp = Get-Date -Format "yyyy-MM-dd HH:mm:ss"

    Add-Content -LiteralPath $OutLog -Value "[] $Message"
}

while ($true) {

    try {

        Write-Log "Backend runner starting."

        # Kill duplicate backend processes belonging to this project.
        Get-CimInstance Win32_Process -ErrorAction SilentlyContinue |
            Where-Object {
                $_.CommandLine -and
                $_.CommandLine -match [Regex]::Escape($BackendDir) -and
                (
                    $_.Name -match "node.exe" -or
                    $_.Name -match "npm.cmd"
                )
            } |
            ForEach-Object {
                try {
                    Stop-Process -Id $_.ProcessId -Force -ErrorAction SilentlyContinue
                }
                catch {
                }
            }

        Start-Sleep -Seconds 2

        Set-Location $BackendDir

        $Process = Start-Process 
            -FilePath $NodeExe 
            -ArgumentList "dist/server.js" 
            -WorkingDirectory $BackendDir 
            -WindowStyle Hidden 
            -RedirectStandardOutput $OutLog 
            -RedirectStandardError $ErrLog 
            -PassThru

        Write-Log "Backend process started. PID=$($Process.Id)"

        $Process.WaitForExit()

        Write-Log "Backend process exited. ExitCode=$($Process.ExitCode)"

    }
    catch {
        Write-Log "Backend runner error: $(.Exception.Message)"
    }

    Write-Log "Backend restart delay: 5 seconds."

    Start-Sleep -Seconds 5
}
