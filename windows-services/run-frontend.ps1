$ErrorActionPreference = "Continue"

$ProjectRoot = "C:\Users\Administrator\AUTO-CARD-MARKING"
$FrontendDir = "C:\Users\Administrator\AUTO-CARD-MARKING\frontend"
$NodeExe = "C:\Program Files\nodejs\node.exe"
$NpmCmd = "C:\Program Files\nodejs\npm.cmd"
$LogDir = "C:\Users\Administrator\AUTO-CARD-MARKING\windows-services\logs"

$OutLog = Join-Path $LogDir "frontend.out.log"
$ErrLog = Join-Path $LogDir "frontend.err.log"

function Write-Log {
    param([string]$Message)

    $Stamp = Get-Date -Format "yyyy-MM-dd HH:mm:ss"

    Add-Content -LiteralPath $OutLog -Value "[] $Message"
}

while ($true) {

    try {

        Write-Log "Frontend runner starting."

        # Kill duplicate frontend processes belonging to this project.
        Get-CimInstance Win32_Process -ErrorAction SilentlyContinue |
            Where-Object {
                $_.CommandLine -and
                $_.CommandLine -match [Regex]::Escape($FrontendDir) -and
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

        Set-Location $FrontendDir

        $Process = Start-Process 
            -FilePath $NodeExe 
            -ArgumentList "node_modules/next/dist/bin/next","start","-p","3000" 
            -WorkingDirectory $FrontendDir 
            -WindowStyle Hidden 
            -RedirectStandardOutput $OutLog 
            -RedirectStandardError $ErrLog 
            -PassThru

        Write-Log "Frontend process started. PID=$($Process.Id)"

        $Process.WaitForExit()

        Write-Log "Frontend process exited. ExitCode=$($Process.ExitCode)"

    }
    catch {
        Write-Log "Frontend runner error: $(.Exception.Message)"
    }

    Write-Log "Frontend restart delay: 5 seconds."

    Start-Sleep -Seconds 5
}
