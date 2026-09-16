<#
    Starts the gateway and all five services, each in its own process, and
    waits until every one answers /health. Development only: the hosts apply
    their own migrations and seed on startup in that environment.

    Usage:  pwsh ./scripts/run-all.ps1
    Stop:   pwsh ./scripts/stop-all.ps1
#>

$ErrorActionPreference = 'Stop'

$backend = Split-Path -Parent $PSScriptRoot
$logs = Join-Path $backend 'logs'

New-Item -ItemType Directory -Force -Path $logs | Out-Null

$env:ASPNETCORE_ENVIRONMENT = 'Development'

# Identity first: it seeds the administrator. Team next, because the Work
# seeder skips unless there is a roster to attach work to.
$hosts = @(
    @{ Name = 'Identity';      Project = 'src\Services\Identity\Identity.Api';           Port = 5101 }
    @{ Name = 'Team';          Project = 'src\Services\Team\Team.Api';                   Port = 5102 }
    @{ Name = 'Work';          Project = 'src\Services\Work\Work.Api';                   Port = 5103 }
    @{ Name = 'Notifications'; Project = 'src\Services\Notifications\Notifications.Api'; Port = 5104 }
    @{ Name = 'Reporting';     Project = 'src\Services\Reporting\Reporting.Api';         Port = 5105 }
    @{ Name = 'Gateway';       Project = 'src\ApiGateway';                               Port = 5100 }
)

foreach ($service in $hosts) {
    Start-Process -FilePath 'dotnet' `
        -ArgumentList "run --project $(Join-Path $backend $service.Project) --no-launch-profile" `
        -WorkingDirectory $backend `
        -RedirectStandardOutput (Join-Path $logs "$($service.Name).out.log") `
        -RedirectStandardError (Join-Path $logs "$($service.Name).err.log") `
        -WindowStyle Hidden

    Write-Host "starting $($service.Name) on $($service.Port)"
}

foreach ($service in $hosts) {
    $healthy = $false

    foreach ($attempt in 1..40) {
        try {
            Invoke-WebRequest -Uri "http://localhost:$($service.Port)/health" `
                -UseBasicParsing -TimeoutSec 3 | Out-Null
            $healthy = $true
            break
        }
        catch {
            Start-Sleep -Seconds 2
        }
    }

    if ($healthy) {
        Write-Host "  ok   $($service.Name) http://localhost:$($service.Port)"
    }
    else {
        Write-Warning "  down $($service.Name) - see logs/$($service.Name).err.log"
    }
}

Write-Host ''
Write-Host 'Gateway:  http://localhost:5100'
Write-Host 'Swagger:  http://localhost:5101/swagger (and 5102-5105)'
