# Monitor PostgreSQL's native log and emit security alerts.
# pgaudit is preferred when its PostgreSQL 17 Windows binaries are installed.

param(
    [string]$LogDir = "C:\Program Files\PostgreSQL\17\data\log",
    [string]$AlertDir = "D:\backups\cmf_postgres",
    [int]$BusinessHourStart = 6,
    [int]$BusinessHourEnd = 20,
    [int]$StatementVolumeThreshold = 500
)

$ErrorActionPreference = "Stop"
New-Item -ItemType Directory -Force -Path $AlertDir | Out-Null

$stateFile = Join-Path $AlertDir "security-monitor-state.json"
$alertFile = Join-Path $AlertDir "security-alerts.jsonl"
$allowedClients = @(
    "127.0.0.1",
    "::1",
    "172.18.7.86",
    # Temporary legacy clients retained in pg_hba.conf during migration:
    "172.18.7.85",
    "172.18.7.89",
    "172.18.100.54",
    "172.18.100.80"
)

$latestLog = Get-ChildItem -Path $LogDir -Filter "postgresql-*.log" |
    Sort-Object LastWriteTime -Descending |
    Select-Object -First 1

if (-not $latestLog) {
    throw "No PostgreSQL log found in $LogDir"
}

$state = if (Test-Path $stateFile) {
    Get-Content $stateFile -Raw | ConvertFrom-Json
} else {
    [pscustomobject]@{ file = ""; lineCount = 0 }
}

$allLines = @(Get-Content -Path $latestLog.FullName)
$startLine = if ($state.file -eq $latestLog.FullName) {
    [math]::Min([int]$state.lineCount, $allLines.Count)
} else {
    # On first run, inspect only the last 5,000 lines instead of replaying history.
    [math]::Max(0, $allLines.Count - 5000)
}
$newLines = @($allLines | Select-Object -Skip $startLine)
$alerts = [System.Collections.Generic.List[object]]::new()
$deleteStatements = [System.Collections.Generic.List[string]]::new()
$statementCount = 0

function Add-SecurityAlert {
    param(
        [string]$Severity,
        [string]$Category,
        [string]$Message
    )
    $alerts.Add([pscustomobject]@{
        detectedAt = (Get-Date).ToString("o")
        severity = $Severity
        category = $Category
        message = $Message
        sourceLog = $latestLog.Name
    })
}

foreach ($line in $newLines) {
    if ($line -match "\b(statement|execute [^:]+):") {
        $statementCount++
    }

    if ($line -match "(password authentication failed|no pg_hba\.conf entry|authentication failed)") {
        Add-SecurityAlert "CRITICAL" "failed-login-or-blocked-host" $line
        continue
    }

    if ($line -match "connection authorized:" -and $line -match "client=(?<client>\S+)") {
        $client = $Matches.client -replace "[:(]\d+\)?$", ""
        if ($client -notin $allowedClients) {
            Add-SecurityAlert "CRITICAL" "unknown-client" $line
        }
        if ($line -match "user=postgres" -and $client -notin @("127.0.0.1", "::1", "172.18.7.86")) {
            Add-SecurityAlert "HIGH" "remote-superuser" $line
        }

        if ($line -match "^(?<date>\d{4}-\d{2}-\d{2} \d{2}:\d{2}:\d{2})") {
            $connectionTime = [datetime]::Parse($Matches.date)
            if ($connectionTime.Hour -lt $BusinessHourStart -or
                $connectionTime.Hour -ge $BusinessHourEnd) {
                Add-SecurityAlert "MEDIUM" "odd-hours-access" $line
            }
        }
    }

    if ($line -match "(?i)\b(statement|execute [^:]+):.*\b(CREATE|ALTER|DROP|TRUNCATE)\b") {
        Add-SecurityAlert "HIGH" "schema-change" $line
        continue
    }

    if ($line -match "(?i)\b(statement|execute [^:]+):.*\bDELETE\s+FROM\b") {
        # Native logs do not include affected-row counts. Aggregate statements
        # so one cascading application delete produces one useful alert.
        $deleteStatements.Add($line)
        continue
    }

    if ($line -match "(?i)\b(COPY\s+.+\s+TO|COPY\s*\(.+\)\s+TO)\b") {
        Add-SecurityAlert "HIGH" "bulk-export" $line
        continue
    }

    if ($line -match "duration:\s+(?<duration>\d+(\.\d+)?)\s+ms" -and
        [double]$Matches.duration -ge 10000) {
        Add-SecurityAlert "MEDIUM" "very-slow-query" $line
    }
}

if ($deleteStatements.Count -ge 10) {
    $sample = ($deleteStatements | Select-Object -First 3) -join " | "
    Add-SecurityAlert(
        "HIGH",
        "bulk-delete-burst",
        "$($deleteStatements.Count) DELETE statements since the previous run. Samples: $sample"
    )
}
elseif ($deleteStatements.Count -gt 0) {
    Add-SecurityAlert(
        "MEDIUM",
        "data-deletion",
        "$($deleteStatements.Count) DELETE statement(s): $($deleteStatements -join ' | ')"
    )
}

if ($statementCount -gt $StatementVolumeThreshold) {
    Add-SecurityAlert(
        "MEDIUM",
        "unusual-query-volume",
        "$statementCount statements appeared since the previous monitor run."
    )
}

foreach ($alert in $alerts) {
    $json = $alert | ConvertTo-Json -Compress
    Add-Content -Path $alertFile -Value $json
    Write-Host "[$($alert.severity)] $($alert.category): $($alert.message)"
}

# Optional generic Teams/Slack-compatible webhook.
if ($alerts.Count -gt 0 -and $env:CMF_SECURITY_WEBHOOK_URL) {
    $summary = ($alerts | ForEach-Object {
        "[$($_.severity)] $($_.category): $($_.message)"
    }) -join "`n"
    try {
        Invoke-RestMethod -Method Post -Uri $env:CMF_SECURITY_WEBHOOK_URL `
            -ContentType "application/json" `
            -Body (@{ text = "CMF PostgreSQL security alerts`n$summary" } |
                ConvertTo-Json)
    }
    catch {
        Add-Content -Path $alertFile -Value (
            [pscustomobject]@{
                detectedAt = (Get-Date).ToString("o")
                severity = "ERROR"
                category = "webhook-delivery-failed"
                message = $_.Exception.Message
            } | ConvertTo-Json -Compress
        )
    }
}

[pscustomobject]@{
    file = $latestLog.FullName
    lineCount = $allLines.Count
    checkedAt = (Get-Date).ToString("o")
} | ConvertTo-Json | Set-Content -Encoding UTF8 $stateFile

Write-Host "Security monitor checked $($newLines.Count) new lines; alerts=$($alerts.Count)"
