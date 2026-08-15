# Admin dashboard

A small React + TypeScript SPA (Vite) for operating the store: reviewing Libyana SMS
top-ups, resolving ambiguous supplier orders, syncing/pricing the catalog, and looking
up users. Talks to the same backend API as the mobile app, scoped to admin-only routes
(`/api/v1/admin/*`).

## Requirements

- The backend must be running and reachable.
- The logged-in account must have `is_admin = true` (see `backend/src/scripts/seed-admin.ts`).
- `CORS_ALLOWED_ORIGINS` on the backend must include this app's origin (defaults to
  `http://localhost:5173` in `backend/.env.example`).

## Development

```bash
npm install
cp .env.example .env   # point VITE_API_BASE_URL at your backend if not localhost:3000
npm run dev
```

## Build

```bash
npm run build           # outputs static files to dist/
```

`dist/` is a static site — serve it behind any web server (Nginx, etc.) alongside the
backend, or from the same origin to avoid configuring CORS at all.

## Pages

- **المستخدمون (Users)** — list + detail, balances, account status.
- **طلبات الشحن (Top-ups)** — Libyana top-up requests: reject or credit manually.
- **رسائل الشحن (SMS)** — incoming SMS events the auto-matcher couldn't resolve;
  link to the correct top-up request or ignore.
- **الكتالوج (Catalog)** — trigger a supplier sync, enable/disable categories,
  override a product's sell price or availability.
- **الطلبات (Orders)** — browse orders by status; for `ambiguous_error` orders
  (supplier call outcome unknown), mark completed or refund after checking the
  supplier's own dashboard.
