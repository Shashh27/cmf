# Apply audit SQL using backend/.env (DB_HOST / DB_NAME).
# Usage:
#   cd backend\db_security
#   .\apply_from_env.ps1
#   .\apply_from_env.ps1 -PostgresPassword 'postgres'

param(
    [string]$PostgresUser = "postgres",
    [string]$PostgresPassword = $(if ($env:PGPASSWORD) { $env:PGPASSWORD } else { "postgres" })
)

$ErrorActionPreference = "Stop"
$Here = $PSScriptRoot
$EnvFile = Join-Path (Split-Path $Here -Parent) ".env"

function Read-DotEnv {
    param([string]$Path)
    $map = @{}
    if (-not (Test-Path $Path)) { throw "Missing .env: $Path" }
    Get-Content $Path | ForEach-Object {
        $line = $_.Trim()
        if (-not $line -or $line.StartsWith("#")) { return }
        $i = $line.IndexOf("=")
        if ($i -lt 1) { return }
        $k = $line.Substring(0, $i).Trim()
        $v = $line.Substring($i + 1).Trim()
        if (($v.StartsWith('"') -and $v.EndsWith('"')) -or ($v.StartsWith("'") -and $v.EndsWith("'"))) {
            $v = $v.Substring(1, $v.Length - 2)
        }
        $map[$k] = $v
    }
    return $map
}

$envMap = Read-DotEnv -Path $EnvFile
$DbHost = if ($envMap["DB_HOST"]) { $envMap["DB_HOST"] } else { "127.0.0.1" }
$DbPort = if ($envMap["DB_PORT"]) { $envMap["DB_PORT"] } else { "5432" }
$DbName = $envMap["DB_NAME"]
if (-not $DbName) { throw "DB_NAME missing in .env" }

Write-Host "Using .env -> host=$DbHost port=$DbPort db=$DbName"

$psql = "C:\Program Files\PostgreSQL\17\bin\psql.exe"
if (-not (Test-Path $psql)) {
    $psql = (Get-Command psql -ErrorAction SilentlyContinue).Source
}
if (-not $psql) { throw "psql.exe not found" }

$env:PGPASSWORD = $PostgresPassword

$src = Join-Path $Here "04_audit_logging.sql"
$tmp = Join-Path $env:TEMP ("audit_" + [guid]::NewGuid().ToString("N") + ".sql")
(Get-Content -Raw $src).Replace("__DB_NAME__", $DbName) | Set-Content -Path $tmp -Encoding UTF8

try {
    & $psql -h $DbHost -p $DbPort -U $PostgresUser -d postgres -v ON_ERROR_STOP=1 -f $tmp
    if ($LASTEXITCODE -ne 0) { throw "psql failed (exit $LASTEXITCODE)" }
    Write-Host "Audit logging applied for database '$DbName'."
}
finally {
    Remove-Item -Force $tmp -ErrorAction SilentlyContinue
}
