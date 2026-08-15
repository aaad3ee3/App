#!/usr/bin/env bash
# Pulls the latest code, builds the backend and admin dashboard, runs
# migrations, and restarts everything. Run this for the first deploy (after
# provision.sh) and every time after that to ship new changes.
#
#   sudo /opt/store/app/deploy/deploy.sh
#
# Reads its defaults from /opt/store/.deploy.env (written by provision.sh);
# override any of DOMAIN/BRANCH/APP_USER/APP_DIR/APP_ROOT as env vars if needed.

set -euo pipefail

APP_ROOT="${APP_ROOT:-/opt/store}"
if [[ -f "${APP_ROOT}/.deploy.env" ]]; then
  # shellcheck disable=SC1090
  source "${APP_ROOT}/.deploy.env"
fi

DOMAIN="${DOMAIN:?Set DOMAIN (or run provision.sh first so .deploy.env has it)}"
BRANCH="${BRANCH:-main}"
APP_USER="${APP_USER:-store}"
APP_DIR="${APP_DIR:-${APP_ROOT}/app}"

if [[ $EUID -ne 0 ]]; then
  echo "Run this as root (sudo) — it drops to ${APP_USER} for build steps." >&2
  exit 1
fi

run_as_app() {
  sudo -u "$APP_USER" -- "$@"
}

echo "==> Pulling latest code (${BRANCH})"
run_as_app git -C "$APP_DIR" fetch origin "$BRANCH"
run_as_app git -C "$APP_DIR" checkout "$BRANCH"
run_as_app git -C "$APP_DIR" reset --hard "origin/${BRANCH}"

echo "==> Installing backend dependencies"
run_as_app npm --prefix "$APP_DIR/backend" ci

echo "==> Building backend"
run_as_app npm --prefix "$APP_DIR/backend" run build

echo "==> Running database migrations"
run_as_app npm --prefix "$APP_DIR/backend" run migrate

echo "==> Building admin dashboard"
run_as_app npm --prefix "$APP_DIR/admin" ci
run_as_app env VITE_API_BASE_URL="https://${DOMAIN}/api/v1" npm --prefix "$APP_DIR/admin" run build
chmod -R o+rX "$APP_DIR/admin/dist"

echo "==> Restarting backend service"
systemctl restart store-backend
sleep 2
systemctl --no-pager --lines=10 status store-backend || true

echo "==> Reloading Nginx"
nginx -t && systemctl reload nginx

echo ""
echo "==> Deploy complete. Backend: https://${DOMAIN}/api/v1  Admin: https://${DOMAIN}/"
