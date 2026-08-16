# Deployment (single VPS, Ubuntu)

Two scripts:

- **`provision.sh`** — run **once** on a fresh server. Installs Node.js, PostgreSQL,
  Nginx, certbot; creates a dedicated `store` OS user and database; clones the repo;
  installs the systemd service and Nginx site.
- **`deploy.sh`** — run for the **first deploy and every deploy after that**. Pulls the
  latest code on the target branch, builds the backend and admin dashboard, runs
  migrations, and restarts the backend service + reloads Nginx.

Both are idempotent — re-running `provision.sh` after code changes is harmless (it
skips anything already set up); `deploy.sh` is meant to be re-run on every release.

## 1. Get a server

See the root of the conversation / chat history for a comparison — short version:
a **2 vCPU / 4 GB RAM VPS running Ubuntu 22.04 or 24.04** is plenty for this stack
(Fastify + Postgres + a static admin SPA all on one box). Any provider that gives you
root SSH access to a fresh Ubuntu image works with these scripts unchanged.

## 2. Point a domain at it

Buy/use a domain, create an **A record** pointing at the server's IPv4 address
(e.g. `store.yourdomain.com` → `1.2.3.4`). DNS propagation can take a few minutes
to a few hours.

## 3. Provision

SSH in as root (or a sudo user) and run:

```bash
git clone --branch claude/app-plan-4fv8ik https://github.com/<owner>/App.git /tmp/app-bootstrap
sudo DOMAIN=store.yourdomain.com \
     REPO_URL=https://github.com/<owner>/App.git \
     DB_PASSWORD='pick-a-strong-password' \
     /tmp/app-bootstrap/deploy/provision.sh
```

(Keep `DB_PASSWORD` to letters, digits, and `_-.` — the script writes it straight into
a Postgres connection URL and a `sed` replacement, so `#`, `/`, `@`, and quote
characters will break both.)

(The one-line bootstrap clone is just to get the scripts onto the box before the
real, permanent clone happens at `/opt/store/app`. `REPO_URL` can be a private repo
URL too — just make sure the server has a way to authenticate, e.g. a deploy key.)

This installs everything and prints next steps, including the one file you must edit
by hand: `/opt/store/app/backend/.env`. Fill in:

- `SMS_WEBHOOK_HMAC_SECRET` — long random string, must match what you configure in
  the SMS-forwarding app on the store's Libyana phone.
- `SEED_ADMIN_EMAIL` / `SEED_ADMIN_PASSWORD` — your first admin login.
- `LIBYA_PLAY_API_KEY`, `LIBYA_PLAY_EMAIL`, `PLUS_API_KEY` — real supplier credentials.
- `PLUS_USD_TO_LYD_RATE` — today's USD→LYD parallel-market rate (no safe default).
- `CATALOG_MARKUP_PERCENT` — already defaults to `0.20` (20%), change if needed.

`DATABASE_URL`, `NODE_ENV`, and `CORS_ALLOWED_ORIGINS` are filled in automatically.

## 4. First deploy

```bash
sudo /opt/store/app/deploy/deploy.sh
```

This builds the backend (`tsc`), runs `npm run migrate`, builds the admin dashboard
with `VITE_API_BASE_URL` pointed at your domain, and starts the `store-backend`
systemd service.

## 5. Enable HTTPS

Once DNS has propagated:

```bash
sudo certbot --nginx -d store.yourdomain.com
```

Certbot rewrites the Nginx config to add the 443 server block and an HTTP→HTTPS
redirect, and installs a systemd timer that renews the certificate automatically —
nothing further to do.

## 6. Create your admin account

```bash
sudo -u store npm --prefix /opt/store/app/backend run seed:admin
```

Log into the admin dashboard at `https://store.yourdomain.com/` with
`SEED_ADMIN_EMAIL` / `SEED_ADMIN_PASSWORD`.

## 7. Point the mobile app at the real backend

Build the Flutter app with the production API URL instead of localhost:

```bash
flutter build apk --dart-define=API_BASE_URL=https://store.yourdomain.com
```

## Shipping updates

Every time you push new commits to the deployed branch:

```bash
sudo /opt/store/app/deploy/deploy.sh
```

That's the whole release process — pull, build, migrate, restart.

## Useful commands on the server

```bash
sudo systemctl status store-backend      # is it running?
sudo journalctl -u store-backend -f      # live logs
sudo -u postgres psql store              # open a DB shell
```

## Database backups

`provision.sh` installs a systemd timer that runs `backup.sh` nightly at 02:30 UTC.
Each run writes a compressed `pg_dump` to `/opt/store/backups/`, **verifies it is
readable and contains table data** before accepting it, and only then prunes dumps
older than 14 days — so a failed run can never leave you with nothing.

```bash
sudo /opt/store/app/deploy/backup.sh          # take one now (e.g. before a migration)
systemctl list-timers sayeh-backup.timer      # confirm the schedule is armed
journalctl -u sayeh-backup.service -n 50      # see recent runs
```

### Get the backups off the server

By default backups sit on the same disk as the database, which protects you from a bad
migration or a mistaken `DELETE` — but **not** from losing the server. To copy each
backup off-box, set `BACKUP_UPLOAD_CMD` in `/opt/store/.deploy.env`; it runs after each
successful backup with `$BACKUP_FILE` set to the new dump:

```bash
# Example using rclone (works with S3, Backblaze B2, Google Drive, …)
BACKUP_UPLOAD_CMD='rclone copy "$BACKUP_FILE" remote:sayeh-backups/'
```

### Test the restore — the part people skip

An untested backup is a guess. `restore.sh` defaults to a **drill**: it restores into a
throwaway database, prints the recovered row counts, and cleans up, without touching
live data.

```bash
sudo /opt/store/app/deploy/restore.sh /opt/store/backups/sayeh-<timestamp>.dump
```

The row counts should look like production. Run this monthly — the failure this guards
against is discovering during a real outage that the dumps have been empty for weeks.

For an actual recovery, add `--live`. That stops the API, snapshots the current database
first (so a wrong call is reversible), and requires you to type a confirmation phrase:

```bash
sudo /opt/store/app/deploy/restore.sh --live /opt/store/backups/sayeh-<timestamp>.dump
```

## Running more than one API instance

The default single-instance setup counts rate limits in process memory, which is correct
for one process. **With two or more instances and no shared store, each one counts
separately and every limit is silently multiplied by the instance count** — measured:
two instances let 14 requests through a 10-per-minute limit.

If you scale out, install Redis and point the backend at it:

```bash
sudo apt-get install -y redis-server
sudo systemctl enable --now redis-server
# then in /opt/store/app/backend/.env
REDIS_URL=redis://localhost:6379
```

The backend logs which store it is using at startup, so you can confirm it took effect:

```bash
journalctl -u store-backend | grep "rate limiting"
```

If Redis becomes unreachable the limiter **fails open** — requests keep flowing
unmetered rather than the API returning errors, since a Redis blip should not become a
full outage. The error is logged, so alert on it if you rely on Redis.

## Not covered here

- **Log shipping / monitoring / alerting** beyond `journalctl`.
- **Multi-server / zero-downtime deploys** — this is a single-box setup; `deploy.sh`
  restarts the backend process, causing a few seconds of downtime per deploy. Note that
  running more than one API instance also requires `REDIS_URL` (see `backend/.env.example`)
  so rate limits are shared rather than counted per-instance.
