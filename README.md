# App

Gift-card / social-growth store — a Flutter mobile app backed by a Node.js/TypeScript API.

- [`backend/`](backend/) — phase 1: auth, wallet, and the Libyana SMS auto-top-up pipeline.
  See [`backend/README.md`](backend/README.md) for setup and architecture notes.
- [`mobile/`](mobile/) — phase 2: the Flutter app (auth, wallet, top-up flow). See
  [`mobile/README.md`](mobile/README.md) for setup and how it talks to `backend/`.

Future phases (not yet started): product catalog + supplier integrations (gift cards,
SMM/growth services), order fulfillment, and an admin dashboard web app.
