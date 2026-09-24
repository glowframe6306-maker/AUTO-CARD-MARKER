$ErrorActionPreference = "Continue"

$ProjectRoot = "C:\Users\Administrator\AUTO-CARD-MARKING"
$BackendDir = "C:\Users\Administrator\AUTO-CARD-MARKING\backend"
$NpxCmd = "C:\Program Files\nodejs\npx.cmd"
$LogDir = "C:\Users\Administrator\AUTO-CARD-MARKING\windows-services\logs"

$OutLog = Join-Path $LogDir "prisma.out.log"
$ErrLog = Join-Path $LogDir "prisma.err.log"

function Write-Log {
    param([string]$Message)

    $Stamp = Get-Date -Format "yyyy-MM-dd HH:mm:ss"

    Add-Content -LiteralPath $OutLog -Value "[] $Message"
}

while ($true) {

    try {

        Write-Log "Prisma Studio runner starting."

        # Kill duplicate Prisma Studio processes.
        Get-CimInstance Win32_Process -ErrorAction SilentlyContinue |
            Where-Object {
                $_.CommandLine -and
                (
                    $_.CommandLine -match "prisma.*studio" -or
                    $_.CommandLine -match "node.*prisma"
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
            -FilePath $NpxCmd 
            -ArgumentList "--no-install","prisma","studio","--port","5500","--hostname","127.0.0.1" 
            -WorkingDirectory $BackendDir 
            -WindowStyle Hidden 
            -RedirectStandardOutput $OutLog 
            -RedirectStandardError $ErrLog 
            -PassThru

        Write-Log "Prisma Studio process started. PID=$($Process.Id)"

        $Process.WaitForExit()

        Write-Log "Prisma Studio process exited. ExitCode=$($Process.ExitCode)"

    }
    catch {
        Write-Log "Prisma runner error: $(.Exception.Message)"
    }

    Write-Log "Prisma restart delay: 5 seconds."

    Start-Sleep -Seconds 5
}
