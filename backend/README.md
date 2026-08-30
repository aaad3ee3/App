# Store Backend — Phase 1

Backend API for the gift-card / SMM store: auth, wallet, and the Libyana SMS auto-top-up
pipeline. This is phase 1 only — product catalog, supplier order fulfillment, the Flutter
app, and the admin dashboard UI are deliberately out of scope (see "What's next" below).

## Stack

TypeScript (strict) + Fastify + Knex (Postgres) + Zod + Argon2id + opaque bearer session
tokens. See `src/` folder comments and module docstrings for the reasoning behind each
choice.

## Local setup

1. **Database.** Either run Postgres via Docker (`docker compose up -d`, if Docker is
   available in your environment) or point `DATABASE_URL` at any Postgres 13+ instance you
   already have running. The dev-compose default is
   `postgres://store:store@localhost:5432/store_dev` — create that role/database yourself
   if not using the provided `docker-compose.yml`.

2. **Env file.**
   ```
   cp .env.example .env
   ```
   Fill in `SMS_WEBHOOK_HMAC_SECRET` with a real random value, and `SEED_ADMIN_EMAIL` /
   `SEED_ADMIN_PASSWORD` for the first admin account.

3. **Install & migrate.**
   ```
   npm install
   npm run migrate
   npm run seed:admin
   ```

4. **Run.**
   ```
   npm run dev
   ```
   `GET /health` should return `{"ok":true}`.

## Testing

Integration tests run against a real Postgres database (`store_test` by default, see
`.env.test`) — create it and run migrations against it once:

```
sudo -u postgres psql -c "CREATE ROLE store LOGIN PASSWORD 'store';"
sudo -u postgres psql -c "CREATE DATABASE store_test OWNER store;"
DATABASE_URL=postgres://store:store@localhost:5432/store_test npx tsx node_modules/knex/bin/cli.js --knexfile knexfile.ts migrate:latest
npm test
```

Test files run serially (`fileParallelism: false` in `vitest.config.ts`) since they share
one database and truncate tables between tests (`tests/helpers.ts#resetDb`).

The core suite (`tests/integration/sms-matching.test.ts`) exercises the money-critical
path directly: successful match, no match, ambiguous match (never auto-credits between two
plausible candidates), untrusted sender, non-matching text, webhook-retry idempotency (a
duplicate delivery never double-credits), and a genuine concurrency race between two SMS
deliveries for the same pending top-up (exactly one wins).

## The Libyana auto-top-up flow, end to end

1. User calls `POST /api/v1/topups` with the phone number they'll send from and an amount
   → a `pending` top-up request is created (one active pending request per user, enforced
   both at the app level and by a partial unique index in Postgres).
2. The user sends that amount via Libyana balance transfer to the store's Libyana number.
3. An SMS-forwarding app on a phone holding that Libyana line posts the incoming SMS to
   `POST /api/v1/webhooks/sms/libyana`, HMAC-signed with `SMS_WEBHOOK_HMAC_SECRET`
   (`X-Signature: hex(hmac-sha256(secret, raw_body))`).
4. The backend parses the SMS, matches it against pending requests by phone + amount +
   not-yet-expired, and credits the wallet automatically on an unambiguous single match.
   Zero matches or multiple plausible matches are never auto-resolved — they land in
   `GET /api/v1/admin/sms-events?match_status=unmatched|ambiguous` for manual review.

See `src/modules/sms/sms.matcher.ts` for the full pipeline and the idempotency/locking
guarantees (three independent layers prevent double-crediting — see the docstring there).

## Bootstrapping the first admin

There's deliberately no API endpoint that can promote a user to admin. Run:

```
SEED_ADMIN_EMAIL=you@example.com SEED_ADMIN_PASSWORD=... npm run seed:admin
```

This creates the account if it doesn't exist, or promotes an existing account to admin.

## What's next (not in this phase)

- Real supplier integrations: `src/adapters/giftcards/libyaplay.adapter.ts` and
  `src/adapters/smm/plus.adapter.ts` are stubs — every method throws until filled in
  against real API docs. The generic interfaces they implement are meant to stay stable.
- Product catalog + order/fulfillment engine (the ledger already reserves `order_debit`
  and `refund` wallet-transaction types for this).
- Flutter mobile app and the admin dashboard web app — both are plain bearer-token
  consumers of `/api/v1/*` as it stands; no backend changes anticipated to support them.
- Production hardening: Redis-backed rate limiting and job queue once running more than
  one instance; revoke `UPDATE`/`DELETE` grants on `wallet_transactions` at the DB role
  level; a scheduled ledger-reconciliation job (`wallets.balance` vs
  `SUM(wallet_transactions.amount)`).
