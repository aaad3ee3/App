#!/usr/bin/env bash
# One-time setup for running Sayeh on a machine you own — a spare laptop or desktop at
# home — instead of a rented VPS. Same software as the VPS path, three differences:
#
#   * No public IP and no port forwarding. Tailscale Funnel holds the public HTTPS
#     listener and reaches nginx over the loopback, so nothing on the router changes and
#     it works behind carrier-grade NAT (which is most Libyan home internet).
#   * No certbot. Tailscale issues and renews the certificate for the machine's *.ts.net
#     name, which is also the stable address the mobile app is built against.
#   * Sleep is disabled. A laptop that suspends when you close the lid is a store that
#     goes offline when you close the lid.
#
# Run on Ubuntu 22.04/24.04 — natively, or inside WSL2 on Windows (see README.md).
#
#   sudo REPO_URL=https://github.com/<owner>/App.git DB_PASSWORD='strong-password' \
#        ./deploy/home/setup-home.sh
#
# Safe to re-run: every step skips work already done.

set -euo pipefail

REPO_URL="${REPO_URL:?Set REPO_URL, e.g. https://github.com/<owner>/App.git}"
BRANCH="${BRANCH:-main}"
DB_NAME="${DB_NAME:-store}"
DB_USER="${DB_USER:-store}"
DB_PASSWORD="${DB_PASSWORD:?Set DB_PASSWORD to a strong password}"
APP_USER="${APP_USER:-store}"
APP_ROOT="${APP_ROOT:-/opt/store}"
APP_DIR="${APP_ROOT}/app"
NODE_MAJOR="${NODE_MAJOR:-22}"
# The machine name Tailscale registers, which becomes the public hostname:
# <TS_HOSTNAME>.<your-tailnet>.ts.net
TS_HOSTNAME="${TS_HOSTNAME:-sayeh}"
NGINX_PORT="${NGINX_PORT:-8080}"

if [[ $EUID -ne 0 ]]; then
  echo "Run this as root (sudo)." >&2
  exit 1
fi

if ! command -v systemctl >/dev/null 2>&1 || ! systemctl is-system-running --quiet 2>/dev/null; then
  cat >&2 <<'MSG'
systemd is not running on this machine.

Everything here (the API, PostgreSQL, Tailscale, the nightly backup) is a systemd
service, so without it nothing starts on boot and the store dies with your terminal.

On WSL2, enable it once and restart WSL:

  printf '[boot]\nsystemd=true\n' | sudo tee -a /etc/wsl.conf
  # then from Windows PowerShell:  wsl --shutdown

See deploy/home/README.md.
MSG
  exit 1
fi

echo "==> Updating system packages"
apt-get update -y

echo "==> Installing base packages"
apt-get install -y curl git jq nginx postgresql postgresql-contrib openssl

echo "==> Installing Node.js ${NODE_MAJOR}.x"
if ! command -v node >/dev/null 2>&1 || [[ "$(node -v)" != v${NODE_MAJOR}.* ]]; then
  curl -fsSL "https://deb.nodesource.com/setup_${NODE_MAJOR}.x" | bash -
  apt-get install -y nodejs
fi

echo "==> Installing Tailscale"
if ! command -v tailscale >/dev/null 2>&1; then
  curl -fsSL https://tailscale.com/install.sh | sh
fi
systemctl enable --now tailscaled

echo "==> Creating dedicated app user (${APP_USER})"
if ! id -u "$APP_USER" >/dev/null 2>&1; then
  useradd --system --create-home --shell /usr/sbin/nologin "$APP_USER"
fi

echo "==> Configuring PostgreSQL role + database"
systemctl enable --now postgresql
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

echo "==> Connecting to Tailscale"
# --ssh is deliberately absent: this box needs no remote shell, and Tailscale SSH would
# hand one to anything that gets hold of the account.
if ! tailscale status >/dev/null 2>&1; then
  echo ""
  echo "    A browser link will appear below. Open it and sign in to authorise this"
  echo "    machine. Create the free account with Google or GitHub — no card needed."
  echo ""
  tailscale up --hostname="$TS_HOSTNAME"
fi

# --peers=false so the only DNSName in the document is this machine's, and jq rather than
# grep so the answer does not depend on key order. The name comes back with a trailing dot
# ("sayeh.tail1234.ts.net."), which is valid DNS but not a valid URL host.
PUBLIC_HOST="$(tailscale status --json --peers=false | jq -r '.Self.DNSName' | sed 's/\.$//')"
if [[ "$PUBLIC_HOST" == "null" ]]; then PUBLIC_HOST=""; fi
if [[ -z "$PUBLIC_HOST" ]]; then
  echo "Could not read this machine's Tailscale DNS name. Run 'tailscale status' and check it is connected." >&2
  exit 1
fi
DOMAIN="$PUBLIC_HOST"
echo "    Public address will be: https://${DOMAIN}"

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
  sed -i "s#^PUBLIC_BASE_URL=.*#PUBLIC_BASE_URL=https://${DOMAIN}#" "$ENV_FILE"
  # TWO proxies here, unlike the VPS: Tailscale's ingress forwards to nginx, and nginx
  # forwards to the API — each appending to X-Forwarded-For. Setting this to 1 would make
  # the backend read nginx's own loopback address and put every customer in the world
  # into a single rate-limit bucket, silently. README.md shows how to verify the count
  # against the real access log rather than trusting this comment.
  sed -i "s#^TRUST_PROXY_HOPS=.*#TRUST_PROXY_HOPS=2#" "$ENV_FILE"
  sed -i "s#^SMS_WEBHOOK_HMAC_SECRET=.*#SMS_WEBHOOK_HMAC_SECRET=$(openssl rand -hex 32)#" "$ENV_FILE"
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

echo "==> Configuring Nginx (localhost only — Tailscale is the public listener)"
mkdir -p /etc/nginx/snippets /etc/nginx/conf.d
cp "$APP_DIR/deploy/security-headers.conf" /etc/nginx/snippets/sayeh-security-headers.conf
cp "$APP_DIR/deploy/home/log-format.conf" /etc/nginx/conf.d/sayeh-log-format.conf
sed -e "s#__APP_DIR__#${APP_DIR}#g" \
  "$APP_DIR/deploy/nginx-locations.conf" > /etc/nginx/snippets/sayeh-locations.conf
sed -e "s#127.0.0.1:8080#127.0.0.1:${NGINX_PORT}#" \
  "$APP_DIR/deploy/nginx.home.conf.template" > /etc/nginx/sites-available/store
ln -sf /etc/nginx/sites-available/store /etc/nginx/sites-enabled/store
rm -f /etc/nginx/sites-enabled/default
mkdir -p "${APP_DIR}/admin/dist"
echo "<!doctype html><title>deploying…</title>deploying…" > "${APP_DIR}/admin/dist/index.html"
chown -R "$APP_USER":"$APP_USER" "${APP_DIR}/admin/dist"
chmod -R o+rX "${APP_DIR}/admin/dist"
systemctl enable nginx
nginx -t && systemctl restart nginx

echo "==> Publishing to the internet via Tailscale Funnel"
# Funnel persists across reboots once set, and exposes only this one port. The flag form
# changed across Tailscale releases, so fall back to the older syntax rather than leaving
# the store unreachable on an older build.
tailscale funnel --bg "${NGINX_PORT}" 2>/dev/null \
  || tailscale funnel "${NGINX_PORT}" on \
  || { echo "Could not enable Funnel automatically. Run 'tailscale funnel ${NGINX_PORT}' by hand and check the Tailscale admin console has HTTPS and Funnel enabled for this tailnet." >&2; exit 1; }

echo "==> Installing nightly database backup"
mkdir -p "${APP_ROOT}/backups"
chmod 700 "${APP_ROOT}/backups"
sed -e "s#__APP_DIR__#${APP_DIR}#g" "$APP_DIR/deploy/sayeh-backup.service" > /etc/systemd/system/sayeh-backup.service
cp "$APP_DIR/deploy/sayeh-backup.timer" /etc/systemd/system/sayeh-backup.timer
systemctl daemon-reload
systemctl enable --now sayeh-backup.timer

echo "==> Stopping this machine from going to sleep"
# A closed lid or an idle timeout takes the whole store offline, and unlike a VPS there
# is nobody to notice at 3am. Both the lid switch and the sleep targets have to go —
# masking the targets alone still lets logind suspend on lid close.
mkdir -p /etc/systemd/logind.conf.d
cat > /etc/systemd/logind.conf.d/sayeh-no-sleep.conf <<'EOF'
[Login]
HandleLidSwitch=ignore
HandleLidSwitchExternalPower=ignore
HandleLidSwitchDocked=ignore
IdleAction=ignore
EOF
systemctl mask sleep.target suspend.target hibernate.target hybrid-sleep.target >/dev/null 2>&1 || true
systemctl restart systemd-logind || true

echo ""
echo "==> Setup done. Public address: https://${DOMAIN}"
echo ""
if [[ "$NEEDS_ENV_EDIT" == "1" ]]; then
  echo "1. Edit ${ENV_FILE} and fill in:"
  echo "   - SMS_GATEWAY_URL      (required: verification and password-reset codes)"
  echo "   - SUPPORT_WHATSAPP     (required: the contact shown to customers)"
  echo "   - SEED_ADMIN_EMAIL / SEED_ADMIN_PASSWORD"
  echo "   - LIBYA_PLAY_API_KEY / LIBYA_PLAY_EMAIL / PLUS_API_KEY"
  echo "   - PLUS_USD_TO_LYD_RATE"
  echo "   The app refuses to start in production until the required ones are set."
  echo ""
fi
echo "2. Run: sudo ${APP_DIR}/deploy/deploy.sh"
echo "3. Bootstrap your admin account: sudo -u ${APP_USER} npm --prefix ${APP_DIR}/backend run seed:admin"
echo "4. Point the mobile app at https://${DOMAIN}/api/v1 (mobile/lib/config/api_config.dart) and rebuild."
echo "5. Verify TRUST_PROXY_HOPS from a phone on mobile data — see deploy/home/README.md."
