# Run this script once from an Administrator PowerShell.
# It installs the weekly (Friday) backup and five-minute security monitor tasks.

$ErrorActionPreference = "Stop"

$identity = [Security.Principal.WindowsIdentity]::GetCurrent()
$principalCheck = New-Object Security.Principal.WindowsPrincipal($identity)
if (-not $principalCheck.IsInRole(
    [Security.Principal.WindowsBuiltInRole]::Administrator
)) {
    throw "Administrator rights are required. Right-click PowerShell and choose 'Run as administrator'."
}

$securityDir = Split-Path -Parent $MyInvocation.MyCommand.Path
$backupScript = Join-Path $securityDir "backup_pg_dump.ps1"
$monitorScript = Join-Path $securityDir "monitor_postgres_security.ps1"
# Machine-wide credential so the SYSTEM account (not a user profile) can read it.
$pgpass = "D:\backups\cmf_postgres\pgpass.conf"

foreach ($required in @($backupScript, $monitorScript, $pgpass)) {
    if (-not (Test-Path $required)) {
        throw "Required file not found: $required"
    }
}

# Tasks run as the local SYSTEM account: no stored password, runs whether or
# not a user is logged in, and does not depend on any user's AppData folder.
$taskPrincipal = New-ScheduledTaskPrincipal `
    -UserId "SYSTEM" `
    -LogonType ServiceAccount `
    -RunLevel Highest

$commonSettings = New-ScheduledTaskSettingsSet `
    -StartWhenAvailable `
    -ExecutionTimeLimit (New-TimeSpan -Hours 2) `
    -RestartCount 2 `
    -RestartInterval (New-TimeSpan -Minutes 10)

$backupAction = New-ScheduledTaskAction `
    -Execute "powershell.exe" `
    -Argument "-NoProfile -ExecutionPolicy Bypass -File `"$backupScript`""
# Once per week on Friday at 02:15 AM
$backupTrigger = New-ScheduledTaskTrigger -Weekly -DaysOfWeek Friday -At 2:15AM

# Remove old daily task name if present
Unregister-ScheduledTask -TaskName "CMF PostgreSQL Daily Backup" -Confirm:$false -ErrorAction SilentlyContinue

Register-ScheduledTask `
    -TaskName "CMF PostgreSQL Weekly Backup" `
    -Action $backupAction `
    -Trigger $backupTrigger `
    -Settings $commonSettings `
    -Principal $taskPrincipal `
    -Description "Weekly verified pg_dump every Friday 02:15; keeps ~8 weeks of backups." `
    -Force | Out-Null

$monitorAction = New-ScheduledTaskAction `
    -Execute "powershell.exe" `
    -Argument "-NoProfile -ExecutionPolicy Bypass -File `"$monitorScript`""
$monitorTrigger = New-ScheduledTaskTrigger `
    -Once `
    -At (Get-Date).AddMinutes(1) `
    -RepetitionInterval (New-TimeSpan -Minutes 5)

Register-ScheduledTask `
    -TaskName "CMF PostgreSQL Security Monitor" `
    -Action $monitorAction `
    -Trigger $monitorTrigger `
    -Settings $commonSettings `
    -Principal $taskPrincipal `
    -Description "Checks PostgreSQL logs every five minutes and writes security alerts." `
    -Force | Out-Null

Get-ScheduledTask `
    -TaskName "CMF PostgreSQL Weekly Backup", "CMF PostgreSQL Security Monitor" |
    Select-Object TaskName, State

Write-Host ""
Write-Host "Tasks installed (running as SYSTEM)."
Write-Host "Backup: every Friday at 02:15 AM -> D:\backups\cmf_postgres\YYYY-MM-DD\"
Write-Host "Security alerts: D:\backups\cmf_postgres\security-alerts.jsonl"
Write-Host "Optional webhook: set a machine-level CMF_SECURITY_WEBHOOK_URL env var."
