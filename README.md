# App

Gift-card / social-growth store — a Flutter mobile app backed by a Node.js/TypeScript API,
plus a web dashboard for admins.

- [`backend/`](backend/) — auth, wallet, the Libyana SMS auto-top-up pipeline, the gift-card
  (Libya Play) and SMM (Plus) supplier integrations, the catalog sync + orders engine, and
  the admin API. See [`backend/README.md`](backend/README.md) for setup and architecture notes.
- [`mobile/`](mobile/) — the Flutter app: auth, wallet, top-up flow, and the store (browse
  categories/products, buy gift cards, order growth services, order history). See
  [`mobile/README.md`](mobile/README.md) for setup and how it talks to `backend/`.
- [`admin/`](admin/) — the admin web dashboard: users, top-up/SMS triage, catalog sync and
  pricing, and resolving orders whose supplier outcome is ambiguous. See
  [`admin/README.md`](admin/README.md) for setup.
