# Store App (Flutter)

Mobile app for the gift-card / SMM store — phase 2, covering auth, wallet, and the
Libyana top-up flow against the [`backend`](../backend) API. Product catalog (gift cards
+ social growth services) is a placeholder screen until the backend catalog/order module
ships (see `backend/README.md` "What's next").

## Screens

- **Login / Register** — email + password against `/api/v1/auth/*`.
- **Wallet** — balance card, recent transactions, pending top-up banner.
- **Top-up** — create a top-up request (Libyana phone + amount), see transfer
  instructions, cancel a pending request.
- **Store** — placeholder ("قريبًا") until the catalog module exists.
- **Profile** — account info, logout.

## Running

Point the app at a running instance of `../backend` (see its README to get one up):

```
flutter run --dart-define=API_BASE_URL=http://localhost:3000
```

- **Android emulator**: the emulator can't reach the host's `localhost` directly — use
  `http://10.0.2.2:3000` instead.
- **Physical device**: use the host machine's real LAN IP.
- **Web** (`flutter run -d chrome` or `flutter build web`): `localhost:3000` works
  directly, but the backend's `CORS_ALLOWED_ORIGINS` env var must include whatever origin
  the web app is served from (e.g. `http://localhost:8000`) — browsers enforce CORS
  regardless of the bearer-token auth scheme.

The store's real Libyana top-up phone number (`lib/config/store_config.dart`) is a
placeholder — set it before shipping.

## Arabic font (Cairo)

The app bundles the Cairo font (`assets/fonts/`, weights 400/600/700) rather than relying
on Flutter's default CanvasKit CDN font fallback — that fallback fetches from Google's CDN
at runtime, which added a hard network dependency (and failed outright in this project's
sandboxed build/test environment) purely to shape Arabic text correctly. `AppTheme`
(`lib/theme/app_theme.dart`) sets `Cairo` as the primary family with `Roboto` as a
`fontFamilyFallback` for Latin glyphs Cairo's Arabic-focused subset doesn't cover.

## Testing

```
flutter analyze
flutter test
```

`flutter test` currently only covers an app-boots smoke test — the real auth/wallet/top-up
flows were verified manually end-to-end against a live backend (register → create top-up →
HMAC-signed webhook simulating the Libyana SMS → wallet credited, visible immediately in
the UI). Widget/integration tests against a mocked `ApiClient` are a reasonable next step
once the screens stabilize.
