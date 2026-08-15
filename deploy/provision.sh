#!/usr/bin/env bash
# One-time server setup for a fresh Ubuntu 22.04/24.04 VPS: installs Node.js,
# PostgreSQL, Nginx and certbot; creates a dedicated app user and database;
# clones the repo; and wires up the systemd service + Nginx site.
#
# Run as root:
#   DOMAIN=store.example.com \
#   REPO_URL=https://github.com/<owner>/App.git \
#   DB_PASSWORD='pick-a-strong-password' \
#   ./provision.sh
#
# Safe to re-run — steps are idempotent (skips anything already done).

set -euo pipefail

DOMAIN="${DOMAIN:?Set DOMAIN, e.g. DOMAIN=store.example.com}"
REPO_URL="${REPO_URL:?Set REPO_URL, e.g. https://github.com/<owner>/App.git}"
BRANCH="${BRANCH:-main}"
DB_NAME="${DB_NAME:-store}"
DB_USER="${DB_USER:-store}"
DB_PASSWORD="${DB_PASSWORD:?Set DB_PASSWORD to a strong password}"
APP_USER="${APP_USER:-store}"
APP_ROOT="${APP_ROOT:-/opt/store}"
APP_DIR="${APP_ROOT}/app"
NODE_MAJOR="${NODE_MAJOR:-22}"

if [[ $EUID -ne 0 ]]; then
  echo "Run this as root (sudo)." >&2
  exit 1
fi

echo "==> Updating system packages"
apt-get update -y
apt-get upgrade -y

echo "==> Installing base packages"
apt-get install -y curl git ufw nginx postgresql postgresql-contrib certbot python3-certbot-nginx

echo "==> Installing Node.js ${NODE_MAJOR}.x"
if ! command -v node >/dev/null 2>&1 || [[ "$(node -v)" != v${NODE_MAJOR}.* ]]; then
  curl -fsSL "https://deb.nodesource.com/setup_${NODE_MAJOR}.x" | bash -
  apt-get install -y nodejs
fi

echo "==> Creating dedicated app user (${APP_USER})"
if ! id -u "$APP_USER" >/dev/null 2>&1; then
  useradd --system --create-home --shell /usr/sbin/nologin "$APP_USER"
fi

echo "==> Configuring PostgreSQL role + database"
sudo -u postgres psql -tc "SELECT 1 FROM pg_roles WHERE rolname='${DB_USER}'" | grep -q 1 \
  || sudo -u postgres psql -c "CREATE ROLE ${DB_USER} LOGIN PASSWORD '${DB_PASSWORD}';"
sudo -u postgres psql -tc "SELECT 1 FROM pg_database WHERE datname='${DB_NAME}'" | grep -q 1 \
  || sudo -u postgres psql -c "CREATE DATABASE ${DB_NAME} OWNER ${DB_USER};"

echo "==> Cloning application into ${APP_DIR}"
mkdir -p "$APP_ROOT"
if [[ ! -d "$APP_DIR/.git" ]]; then
  git clone --branch "$BRANCH" "$REPO_URL" "$APP_DIR"
fi
chown -R "$APP_USER":"$APP_USER" "$APP_ROOT"

echo "==> Persisting deploy config to ${APP_ROOT}/.deploy.env"
cat > "${APP_ROOT}/.deploy.env" <<EOF
DOMAIN=${DOMAIN}
BRANCH=${BRANCH}
APP_USER=${APP_USER}
APP_DIR=${APP_DIR}
EOF

echo "==> Preparing backend/.env"
ENV_FILE="$APP_DIR/backend/.env"
if [[ ! -f "$ENV_FILE" ]]; then
  cp "$APP_DIR/backend/.env.example" "$ENV_FILE"
  sed -i "s#^DATABASE_URL=.*#DATABASE_URL=postgres://${DB_USER}:${DB_PASSWORD}@localhost:5432/${DB_NAME}#" "$ENV_FILE"
  sed -i "s#^NODE_ENV=.*#NODE_ENV=production#" "$ENV_FILE"
  sed -i "s#^CORS_ALLOWED_ORIGINS=.*#CORS_ALLOWED_ORIGINS=https://${DOMAIN}#" "$ENV_FILE"
  # Exactly one proxy (the nginx site installed below) sits in front of the API. The
  # backend refuses to start in production with this at 0, because that would collapse
  # every client into one rate-limit bucket.
  sed -i "s#^TRUST_PROXY_HOPS=.*#TRUST_PROXY_HOPS=1#" "$ENV_FILE"
  # A signed webhook is the only thing standing between a stranger and free wallet
  # credit, so generate a real secret rather than leaving the example placeholder.
  if command -v openssl >/dev/null 2>&1; then
    sed -i "s#^SMS_WEBHOOK_HMAC_SECRET=.*#SMS_WEBHOOK_HMAC_SECRET=$(openssl rand -hex 32)#" "$ENV_FILE"
  fi
  chown "$APP_USER":"$APP_USER" "$ENV_FILE"
  chmod 600 "$ENV_FILE"
  NEEDS_ENV_EDIT=1
else
  NEEDS_ENV_EDIT=0
fi

echo "==> Installing systemd service"
sed -e "s#__APP_DIR__#${APP_DIR}/backend#g" -e "s#__APP_USER__#${APP_USER}#g" \
  "$APP_DIR/deploy/store-backend.service" > /etc/systemd/system/store-backend.service
systemctl daemon-reload
systemctl enable store-backend

echo "==> Configuring Nginx (HTTP only for now — certbot adds HTTPS below)"
mkdir -p /etc/nginx/snippets
cp "$APP_DIR/deploy/security-headers.conf" /etc/nginx/snippets/sayeh-security-headers.conf
sed -e "s#__DOMAIN__#${DOMAIN}#g" -e "s#__APP_DIR__#${APP_DIR}#g" \
  "$APP_DIR/deploy/nginx.conf.template" > /etc/nginx/sites-available/store
ln -sf /etc/nginx/sites-available/store /etc/nginx/sites-enabled/store
rm -f /etc/nginx/sites-enabled/default
mkdir -p "${APP_DIR}/admin/dist"
echo "<!doctype html><title>deploying…</title>deploying…" > "${APP_DIR}/admin/dist/index.html"
chown -R "$APP_USER":"$APP_USER" "${APP_DIR}/admin/dist"
chmod -R o+rX "${APP_DIR}/admin/dist"
nginx -t && systemctl reload nginx

echo "==> Configuring firewall"
ufw allow OpenSSH
ufw allow 'Nginx Full'
ufw --force enable

echo ""
echo "==> Provisioning done. Next steps:"
echo "1. Point ${DOMAIN}'s DNS A record at this server's IP."
if [[ "$NEEDS_ENV_EDIT" == "1" ]]; then
  echo "2. Edit ${ENV_FILE} and fill in: SMS_WEBHOOK_HMAC_SECRET, SEED_ADMIN_EMAIL/PASSWORD,"
  echo "   LIBYA_PLAY_API_KEY/EMAIL, PLUS_API_KEY, PLUS_USD_TO_LYD_RATE."
fi
echo "3. Run: sudo ${APP_DIR}/deploy/deploy.sh   (first deploy — builds, migrates, starts everything)"
echo "4. Once DNS has propagated: sudo certbot --nginx -d ${DOMAIN}"
echo "5. Bootstrap your admin account: sudo -u ${APP_USER} npm --prefix ${APP_DIR}/backend run seed:admin"
