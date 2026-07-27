# Daily PostgreSQL backup via pg_dump (Linux / cron)
# Usage:
#   export PGPASSWORD='...'   # or use .pgpass
#   ./backup_pg_dump.sh
# Cron example (02:15 daily):
#   15 2 * * * /opt/cmf/backend/db_security/backup_pg_dump.sh >> /var/log/cmf_pg_backup.log 2>&1

set -euo pipefail

DB_HOST="${DB_HOST:-172.18.7.86}"
DB_PORT="${DB_PORT:-5432}"
DB_NAME="${DB_NAME:-CMF_Demo}"
# Prefer a backup-only role; postgres via bastion is acceptable for dumps
DB_USER="${DB_USER:-cmf_owner}"
BACKUP_DIR="${BACKUP_DIR:-/var/backups/cmf_postgres}"
KEEP_DAYS="${KEEP_DAYS:-14}"

mkdir -p "$BACKUP_DIR"
STAMP="$(date +%Y%m%d_%H%M%S)"
OUT="${BACKUP_DIR}/${DB_NAME}_${STAMP}.dump"

pg_dump -h "$DB_HOST" -p "$DB_PORT" -U "$DB_USER" -d "$DB_NAME" \
  -Fc --file="$OUT"

echo "Backup written: $OUT ($(du -h "$OUT" | cut -f1))"

# Prune old backups
find "$BACKUP_DIR" -name "${DB_NAME}_*.dump" -type f -mtime +"$KEEP_DAYS" -delete
echo "Pruned backups older than ${KEEP_DAYS} days"
