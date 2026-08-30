#!/usr/bin/env bash
# Restores a backup taken by backup.sh.
#
# Two modes, and the default is deliberately the safe one:
#
#   # Drill (default): restore into a scratch database and report row counts.
#   sudo /opt/store/app/deploy/restore.sh /opt/store/backups/sayeh-2026....dump
#
#   # Real recovery: overwrite the live database. Stops the API first and requires you to
#   # type the confirmation phrase.
#   sudo /opt/store/app/deploy/restore.sh --live /opt/store/backups/sayeh-2026....dump
#
# Run the drill on a schedule. An untested backup is a guess: the failure you are
# protecting against is discovering at 2am that the dumps have been empty for a month.

set -euo pipefail

APP_ROOT="${APP_ROOT:-/opt/store}"
if [[ -f "${APP_ROOT}/.deploy.env" ]]; then
  # shellcheck disable=SC1090
  source "${APP_ROOT}/.deploy.env"
fi

APP_DIR="${APP_DIR:-${APP_ROOT}/app}"
ENV_FILE="${ENV_FILE:-${APP_DIR}/backend/.env}"

LIVE=0
if [[ "${1:-}" == "--live" ]]; then
  LIVE=1
  shift
fi

DUMP="${1:-}"
if [[ -z "$DUMP" ]]; then
  echo "Usage: $0 [--live] <path-to-dump>" >&2
  echo "Available backups:" >&2
  ls -1t "${APP_ROOT}/backups/"sayeh-*.dump 2>/dev/null | head -20 >&2 || echo "  (none found)" >&2
  exit 1
fi

if [[ ! -f "$DUMP" ]]; then
  echo "No such dump: ${DUMP}" >&2
  exit 1
fi

if [[ -z "${DATABASE_URL:-}" ]]; then
  DATABASE_URL="$(grep -E '^DATABASE_URL=' "$ENV_FILE" | head -1 | cut -d= -f2-)"
fi

echo "==> Checking the dump is readable before touching any database"
pg_restore --list "$DUMP" > /dev/null

# Split the connection URL so we can point at a different database on the same server.
DB_NAME="$(basename "${DATABASE_URL%%\?*}")"
SERVER_URL="$(dirname "${DATABASE_URL%%\?*}")"
# The role the app connects as — needed below so the drill database is owned by it.
DB_ROLE="$(echo "$DATABASE_URL" | sed -E 's#^[a-z]+://([^:]+):.*#\1#')"

if [[ "$LIVE" -eq 0 ]]; then
  DRILL_DB="${DB_NAME}_restore_drill"
  echo "==> Drill mode: restoring into '${DRILL_DB}' (live data untouched)"

  sudo -u postgres psql -c "DROP DATABASE IF EXISTS ${DRILL_DB};"
  # OWNER matters: pg_restore below connects as the app role, and since PostgreSQL 15 a
  # non-owner has no CREATE right on the public schema, so a postgres-owned drill
  # database would fail every restore with "permission denied for schema public".
  sudo -u postgres psql -c "CREATE DATABASE ${DRILL_DB} OWNER ${DB_ROLE};"

  # --no-owner/--no-acl: the drill database is owned by postgres, not the app role, and
  # ownership mismatches would otherwise produce noisy errors that mask real ones.
  pg_restore --no-owner --no-acl --dbname="${SERVER_URL}/${DRILL_DB}" "$DUMP" 2>&1 | tail -5 || true

  echo ""
  echo "==> Row counts recovered from this backup:"
  sudo -u postgres psql -d "$DRILL_DB" -c "
    SELECT 'users' AS table, count(*) FROM users
    UNION ALL SELECT 'wallets', count(*) FROM wallets
    UNION ALL SELECT 'wallet_transactions', count(*) FROM wallet_transactions
    UNION ALL SELECT 'orders', count(*) FROM orders
    UNION ALL SELECT 'topup_requests', count(*) FROM topup_requests
    ORDER BY 1;"

  echo ""
  echo "==> Drill complete. Review the counts above — they should look like production."
  echo "    Cleaning up the drill database."
  sudo -u postgres psql -c "DROP DATABASE IF EXISTS ${DRILL_DB};"
  exit 0
fi

# --- Live restore ---------------------------------------------------------------------
cat <<WARNING

  ****************************  LIVE RESTORE  ****************************
  This REPLACES the contents of '${DB_NAME}' with the contents of:
      ${DUMP}

  Any wallet top-up, order, or account created after that dump was taken
  WILL BE LOST. The API will be stopped during the restore.
  ************************************************************************

WARNING

read -r -p "Type 'restore ${DB_NAME}' to proceed: " CONFIRM
if [[ "$CONFIRM" != "restore ${DB_NAME}" ]]; then
  echo "Aborted." >&2
  exit 1
fi

# Take a snapshot of the current state first. If this restore turns out to be the wrong
# call, this is the only way back.
SAFETY="${APP_ROOT}/backups/pre-restore-$(date -u +%Y%m%dT%H%M%SZ).dump"
echo "==> Snapshotting current database to ${SAFETY} before overwriting"
mkdir -p "$(dirname "$SAFETY")"
pg_dump --format=custom --compress=6 --file="$SAFETY" "$DATABASE_URL"
chmod 600 "$SAFETY"

echo "==> Stopping the API"
systemctl stop store-backend

echo "==> Restoring"
# --clean --if-exists drops existing objects first; without it the restore layers onto
# current data and leaves a mix of both, which is worse than either.
pg_restore --clean --if-exists --no-owner --dbname="$DATABASE_URL" "$DUMP" 2>&1 | tail -20 || true

echo "==> Starting the API"
systemctl start store-backend
sleep 3
systemctl --no-pager --lines=10 status store-backend || true

echo ""
echo "==> Restore complete. Pre-restore snapshot kept at: ${SAFETY}"
echo "    Verify the app works, then keep that snapshot until you are certain."
