#!/usr/bin/env bash
# Backup Reach PostgreSQL database (managed or self-hosted)
# Usage: DATABASE_URL="postgresql://..." ./deploy/scripts/backup-postgres.sh [output_dir]
set -euo pipefail

OUT_DIR="${1:-./backups}"
mkdir -p "$OUT_DIR"
STAMP=$(date +%Y%m%d_%H%M%S)
FILE="$OUT_DIR/reach_${STAMP}.sql.gz"

if [ -z "${DATABASE_URL:-}" ]; then
  echo "ERROR: Set DATABASE_URL" >&2
  exit 1
fi

echo "Backing up to $FILE ..."
pg_dump "$DATABASE_URL" --no-owner --no-acl | gzip > "$FILE"
echo "Done. Size: $(du -h "$FILE" | cut -f1)"

# Keep last 14 daily backups
find "$OUT_DIR" -name 'reach_*.sql.gz' -mtime +14 -delete 2>/dev/null || true
