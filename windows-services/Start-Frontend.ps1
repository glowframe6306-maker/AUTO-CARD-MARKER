$ErrorActionPreference = "Continue"

$project = "C:\Users\Administrator\AUTO-CARD-MARKING\frontend"
$log = "C:\Users\Administrator\AUTO-CARD-MARKING\windows-services\logs\frontend.log"

while ($true) {
    try {
        Add-Content $log ""
        Add-Content $log "[$(Get-Date -Format 'yyyy-MM-dd HH:mm:ss')] FRONTEND STARTING"

        Set-Location $project

        & npm.cmd start >> $log 2>&1

        Add-Content $log "[$(Get-Date -Format 'yyyy-MM-dd HH:mm:ss')] FRONTEND STOPPED - RESTARTING"
    }
    catch {
        Add-Content $log "[$(Get-Date -Format 'yyyy-MM-dd HH:mm:ss')] FRONTEND ERROR: $($_.Exception.Message)"
    }

    Start-Sleep -Seconds 5
}
