$ErrorActionPreference = "Continue"

$project = "C:\Users\Administrator\AUTO-CARD-MARKING\backend"
$log = "C:\Users\Administrator\AUTO-CARD-MARKING\windows-services\logs\backend.log"

while ($true) {
    try {
        Add-Content $log ""
        Add-Content $log "[$(Get-Date -Format 'yyyy-MM-dd HH:mm:ss')] BACKEND STARTING"

        Set-Location $project

        & npm.cmd start >> $log 2>&1

        Add-Content $log "[$(Get-Date -Format 'yyyy-MM-dd HH:mm:ss')] BACKEND STOPPED - RESTARTING"
    }
    catch {
        Add-Content $log "[$(Get-Date -Format 'yyyy-MM-dd HH:mm:ss')] BACKEND ERROR: $($_.Exception.Message)"
    }

    Start-Sleep -Seconds 5
}
