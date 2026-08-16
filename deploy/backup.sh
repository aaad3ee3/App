#!/usr/bin/env bash
# Takes one compressed, verified snapshot of the database and prunes old ones.
#
# Installed by provision.sh to run nightly via systemd (see sayeh-backup.timer).
# Run it by hand any time — before a risky migration, for example:
#
#   sudo /opt/store/app/deploy/backup.sh
#
# Design notes:
# - Uses pg_dump's custom format (-Fc): compressed, and restorable table-by-table with
#   pg_restore, which matters when you only need to recover one table.
# - Every dump is verified by listing its table of contents before it counts as good. A
#   backup that has never been read is a guess, not a backup.
# - Old backups are pruned only AFTER a new one verifies, so a broken run can never leave
#   you with nothing.

set -euo pipefail

APP_ROOT="${APP_ROOT:-/opt/store}"
if [[ -f "${APP_ROOT}/.deploy.env" ]]; then
  # shellcheck disable=SC1090
  source "${APP_ROOT}/.deploy.env"
fi

BACKUP_DIR="${BACKUP_DIR:-${APP_ROOT}/backups}"
RETENTION_DAYS="${RETENTION_DAYS:-14}"
APP_DIR="${APP_DIR:-${APP_ROOT}/app}"
ENV_FILE="${ENV_FILE:-${APP_DIR}/backend/.env}"

# DATABASE_URL is the single source of truth for how to reach the database, so read it
# from the same file the application uses rather than duplicating credentials here.
if [[ -z "${DATABASE_URL:-}" ]]; then
  if [[ ! -f "$ENV_FILE" ]]; then
    echo "Cannot find ${ENV_FILE}; set DATABASE_URL explicitly." >&2
    exit 1
  fi
  DATABASE_URL="$(grep -E '^DATABASE_URL=' "$ENV_FILE" | head -1 | cut -d= -f2-)"
fi

if [[ -z "$DATABASE_URL" ]]; then
  echo "DATABASE_URL is empty." >&2
  exit 1
fi

mkdir -p "$BACKUP_DIR"
chmod 700 "$BACKUP_DIR"

STAMP="$(date -u +%Y%m%dT%H%M%SZ)"
TARGET="${BACKUP_DIR}/sayeh-${STAMP}.dump"
TMP="${TARGET}.partial"

echo "==> Dumping database to ${TARGET}"
# Write to .partial first: a dump interrupted halfway must never be mistaken for a
# complete one by the restore script or by a human under pressure.
pg_dump --format=custom --compress=6 --file="$TMP" "$DATABASE_URL"

echo "==> Verifying dump is readable"
if ! pg_restore --list "$TMP" > /dev/null 2>&1; then
  echo "Dump failed verification — keeping it as ${TMP} for inspection and exiting non-zero." >&2
  exit 1
fi

TABLE_COUNT="$(pg_restore --list "$TMP" | grep -c 'TABLE DATA' || true)"
if [[ "$TABLE_COUNT" -lt 1 ]]; then
  echo "Dump contains no table data — refusing to accept it as a backup." >&2
  exit 1
fi

mv "$TMP" "$TARGET"
chmod 600 "$TARGET"
SIZE="$(du -h "$TARGET" | cut -f1)"
echo "==> Backup OK: ${TARGET} (${SIZE}, ${TABLE_COUNT} tables)"

# Prune only after a good backup exists.
echo "==> Pruning backups older than ${RETENTION_DAYS} days"
find "$BACKUP_DIR" -name 'sayeh-*.dump' -type f -mtime "+${RETENTION_DAYS}" -print -delete

REMAINING="$(find "$BACKUP_DIR" -name 'sayeh-*.dump' -type f | wc -l)"
echo "==> Done. ${REMAINING} backup(s) retained in ${BACKUP_DIR}"

# A local-only backup dies with the server. This is the hook for shipping it off-box —
# see deploy/README.md for the trade-offs and a worked rclone example.
if [[ -n "${BACKUP_UPLOAD_CMD:-}" ]]; then
  echo "==> Running BACKUP_UPLOAD_CMD"
  BACKUP_FILE="$TARGET" bash -c "$BACKUP_UPLOAD_CMD"
  echo "==> Off-site upload finished"
else
  echo "NOTE: backups are on this server only. Set BACKUP_UPLOAD_CMD to copy them off-box;"
  echo "      a disk failure or a lost server takes these with it."
fi
