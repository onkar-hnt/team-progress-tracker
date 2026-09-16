<#
    Stops the hosts started by run-all.ps1.

    Usage: pwsh ./scripts/stop-all.ps1
#>

foreach ($name in 'Identity.Api', 'Team.Api', 'Work.Api', 'Notifications.Api', 'Reporting.Api', 'ApiGateway') {
    $running = Get-Process -Name $name -ErrorAction SilentlyContinue

    if ($running) {
        $running | Stop-Process -Force
        Write-Host "stopped $name"
    }
}
