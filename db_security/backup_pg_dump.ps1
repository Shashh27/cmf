# Weekly PostgreSQL backup via pg_dump (Windows Task Scheduler — every Friday).
# Defaults are loaded from backend/.env (DB_HOST / DB_PORT / DB_NAME).
# Authentication: machine-wide pgpass (D:\backups\cmf_postgres\pgpass.conf)
# or %APPDATA%\postgresql\pgpass.conf for interactive runs.

param(
    [string]$DbHost,
    [string]$DbPort,
    [string]$DbName,
    [string]$DbUser = $(if ($env:DB_USER) { $env:DB_USER } else { "postgres" }),
    [string]$BackupDir = $(if ($env:BACKUP_DIR) { $env:BACKUP_DIR } else { "D:\backups\cmf_postgres" }),
    [int]$KeepDays = $(if ($env:KEEP_DAYS) { [int]$env:KEEP_DAYS } else { 56 })
)

$ErrorActionPreference = "Stop"

# Load DB_* from backend/.env so host/name stay in one place
$EnvFile = Join-Path (Split-Path $PSScriptRoot -Parent) ".env"
if (Test-Path $EnvFile) {
    Get-Content $EnvFile | ForEach-Object {
        $line = $_.Trim()
        if (-not $line -or $line.StartsWith("#")) { return }
        $i = $line.IndexOf("=")
        if ($i -lt 1) { return }
        $k = $line.Substring(0, $i).Trim()
        $v = $line.Substring($i + 1).Trim()
        if ($k -eq "DB_HOST" -and -not $DbHost) { $DbHost = $v }
        if ($k -eq "DB_PORT" -and -not $DbPort) { $DbPort = $v }
        if ($k -eq "DB_NAME" -and -not $DbName) { $DbName = $v }
        if ($k -eq "DB_USER" -and -not $env:DB_USER) { $DbUser = $v }
    }
}
if ($env:DB_HOST -and -not $DbHost) { $DbHost = $env:DB_HOST }
if ($env:DB_PORT -and -not $DbPort) { $DbPort = $env:DB_PORT }
if ($env:DB_NAME -and -not $DbName) { $DbName = $env:DB_NAME }
if (-not $DbHost) { $DbHost = "172.18.7.86" }
if (-not $DbPort) { $DbPort = "5432" }
if (-not $DbName) { $DbName = "CMF_Demo" }
if (-not $DbUser) { $DbUser = "postgres" }

New-Item -ItemType Directory -Force -Path $BackupDir | Out-Null

$pgDump = "C:\Program Files\PostgreSQL\17\bin\pg_dump.exe"
$pgRestore = "C:\Program Files\PostgreSQL\17\bin\pg_restore.exe"

$machinePgPass = "D:\backups\cmf_postgres\pgpass.conf"
$userPgPass = Join-Path $env:APPDATA "postgresql\pgpass.conf"
$env:PGPASSFILE = if (Test-Path $machinePgPass) { $machinePgPass } else { $userPgPass }

foreach ($required in @($pgDump, $pgRestore, $env:PGPASSFILE)) {
    if (-not (Test-Path $required)) {
        throw "Required backup dependency not found: $required"
    }
}

# Store each day's backups in their own subfolder, e.g. D:\backups\cmf_postgres\2026-07-21
$dayFolder = Get-Date -Format "yyyy-MM-dd"
$dayDir = Join-Path $BackupDir $dayFolder
New-Item -ItemType Directory -Force -Path $dayDir | Out-Null

$stamp = Get-Date -Format "yyyyMMdd_HHmmss"
$out = Join-Path $dayDir "${DbName}_${stamp}.dump"
$temp = "${out}.partial"
$log = Join-Path $BackupDir "backup.log"

try {
    # -w never prompts for a password; a credential problem fails fast
    # instead of hanging the scheduled task indefinitely.
    & $pgDump -w -h $DbHost -p $DbPort -U $DbUser -d $DbName `
        -Fc --no-owner --no-privileges --file=$temp
    if ($LASTEXITCODE -ne 0) {
        throw "pg_dump failed with exit code $LASTEXITCODE"
    }

    # Listing the archive verifies that pg_restore can read its catalog.
    & $pgRestore --list $temp | Out-Null
    if ($LASTEXITCODE -ne 0) {
        throw "pg_restore validation failed with exit code $LASTEXITCODE"
    }

    Move-Item -Force $temp $out
    $hash = (Get-FileHash -Algorithm SHA256 $out).Hash
    "$hash  $(Split-Path -Leaf $out)" | Set-Content -Encoding ASCII "${out}.sha256"

    $sizeMb = [math]::Round((Get-Item $out).Length / 1MB, 2)
    $message = "$(Get-Date -Format o) SUCCESS file=$out size_mb=$sizeMb sha256=$hash"
    Add-Content -Path $log -Value $message
    Write-Host $message
}
catch {
    Remove-Item -Force $temp -ErrorAction SilentlyContinue
    $message = "$(Get-Date -Format o) ERROR $($_.Exception.Message)"
    Add-Content -Path $log -Value $message
    Write-Error $message
    exit 1
}

$cutoff = (Get-Date).AddDays(-$KeepDays)
# Recurse so per-month subfolders are pruned too.
Get-ChildItem -Path $BackupDir -Recurse -Filter "${DbName}_*.dump" |
    Where-Object { $_.LastWriteTime -lt $cutoff } |
    Remove-Item -Force
Get-ChildItem -Path $BackupDir -Recurse -Filter "${DbName}_*.dump.sha256" |
    Where-Object { $_.LastWriteTime -lt $cutoff } |
    Remove-Item -Force

# Remove now-empty date subfolders (keeps the root tidy).
Get-ChildItem -Path $BackupDir -Directory |
    Where-Object { $_.Name -match '^\d{4}-\d{2}(-\d{2})?$' -and -not (Get-ChildItem -Path $_.FullName -File) } |
    Remove-Item -Force -Recurse

Write-Host "Pruned backups older than $KeepDays days"
