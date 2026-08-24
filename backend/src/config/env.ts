import "dotenv/config";
import { z } from "zod";

const envSchema = z.object({
  PORT: z.coerce.number().int().positive().default(3000),
  NODE_ENV: z.enum(["development", "test", "production"]).default("development"),
  LOG_LEVEL: z.string().default("info"),

  DATABASE_URL: z.string().min(1, "DATABASE_URL is required"),

  SESSION_TOKEN_TTL_DAYS: z.coerce.number().int().positive().default(30),

  TOPUP_EXPIRY_MINUTES: z.coerce.number().int().positive().default(120),
  TOPUP_AMOUNT_TOLERANCE_LYD: z.coerce.number().nonnegative().default(0.001),

  SMS_WEBHOOK_HMAC_SECRET: z.string().min(16, "SMS_WEBHOOK_HMAC_SECRET must be set to a long random value"),
  SMS_TRUSTED_SENDERS: z
    .string()
    .default("Libyana,SMSLibyana")
    .transform((v) => v.split(",").map((s) => s.trim().toLowerCase()).filter(Boolean)),

  // How many proxy hops sit in front of this process. Behind the nginx config in
  // deploy/nginx.conf.template that is exactly 1. This MUST be accurate: too low and
  // every client collapses into the proxy's own IP (one shared rate-limit bucket, so a
  // single attacker can lock out every user); too high and a client can spoof its
  // address by sending its own X-Forwarded-For, dodging per-IP limits entirely.
  TRUST_PROXY_HOPS: z.coerce.number().int().nonnegative().default(0),

  // Largest request body we accept, in bytes. Nothing this API takes is big — the
  // largest legitimate payload is an SMS webhook — so keep it small; it costs an
  // attacker nothing to send megabytes at an unauthenticated endpoint otherwise.
  MAX_BODY_BYTES: z.coerce.number().int().positive().default(64 * 1024),

  // Optional. When set, rate limits are counted in Redis so every API instance shares
  // one budget. Leave unset for a single instance — the in-memory store is used instead,
  // which is correct as long as exactly one process serves traffic.
  REDIS_URL: z.string().url().optional(),

  RATE_LIMIT_GLOBAL_MAX: z.coerce.number().int().positive().default(300),
  RATE_LIMIT_GLOBAL_WINDOW_MS: z.coerce.number().int().positive().default(60_000),
  RATE_LIMIT_LOGIN_MAX: z.coerce.number().int().positive().default(5),
  RATE_LIMIT_LOGIN_WINDOW_MS: z.coerce.number().int().positive().default(60_000),
  RATE_LIMIT_REGISTER_MAX: z.coerce.number().int().positive().default(5),
  RATE_LIMIT_REGISTER_WINDOW_MS: z.coerce.number().int().positive().default(600_000),
  RATE_LIMIT_WEBHOOK_MAX: z.coerce.number().int().positive().default(120),
  RATE_LIMIT_WEBHOOK_WINDOW_MS: z.coerce.number().int().positive().default(60_000),
  // Money-moving endpoints are limited per authenticated user, not per IP — several
  // users legitimately share one mobile-carrier NAT address, and one logged-in account
  // shouldn't be able to machine-gun orders at the supplier regardless of its IP.
  RATE_LIMIT_ORDER_MAX: z.coerce.number().int().positive().default(10),
  RATE_LIMIT_ORDER_WINDOW_MS: z.coerce.number().int().positive().default(60_000),
  RATE_LIMIT_TOPUP_MAX: z.coerce.number().int().positive().default(10),
  RATE_LIMIT_TOPUP_WINDOW_MS: z.coerce.number().int().positive().default(60_000),
  RATE_LIMIT_ADMIN_WRITE_MAX: z.coerce.number().int().positive().default(60),
  RATE_LIMIT_ADMIN_WRITE_WINDOW_MS: z.coerce.number().int().positive().default(60_000),

  LOGIN_MAX_FAILED_ATTEMPTS: z.coerce.number().int().positive().default(5),
  LOGIN_LOCKOUT_MINUTES: z.coerce.number().int().positive().default(5),

  // Caps how many live sessions one account can hold. Without a cap, an attacker who
  // learns a password can quietly mint unlimited long-lived tokens; with it, the oldest
  // session is revoked on each new login, so stolen tokens age out of use.
  MAX_SESSIONS_PER_USER: z.coerce.number().int().positive().default(5),

  CORS_ALLOWED_ORIGINS: z
    .string()
    .default("")
    .transform((v) => v.split(",").map((s) => s.trim()).filter(Boolean)),

  SEED_ADMIN_EMAIL: z.string().email().optional(),
  SEED_ADMIN_PASSWORD: z.string().min(8).optional(),

  // Libya Play (gift card supplier) — optional because the adapter isn't wired into any
  // route yet (catalog/order module is a future phase); required once it is.
  LIBYA_PLAY_BASE_URL: z.string().default("https://api.libyaplay.com/portal"),
  LIBYA_PLAY_API_KEY: z.string().optional(),
  LIBYA_PLAY_EMAIL: z.string().email().optional(),

  // Plus (SMM/growth supplier) — same "optional until wired into a route" reasoning.
  PLUS_BASE_URL: z.string().default("https://hamadh.net/api/v2"),
  PLUS_API_KEY: z.string().optional(),

  // Outbound SMS gateway, used for phone verification and password-reset codes.
  // Libya has no mainstream programmable-SMS provider, so this is intentionally generic:
  // point it at whatever gateway you run (commonly an Android SMS-gateway app on the same
  // phone that forwards incoming messages). With no URL set, codes are logged instead of
  // sent — fine locally, refused in production.
  SMS_GATEWAY_URL: z.string().url().optional(),
  SMS_GATEWAY_API_KEY: z.string().optional(),
  // Field names vary by gateway; these defaults suit the most common ones.
  SMS_GATEWAY_TO_FIELD: z.string().default("to"),
  SMS_GATEWAY_TEXT_FIELD: z.string().default("message"),

  // Explicit, opt-in acknowledgement that this production deployment has no real SMS
  // gateway yet and OTP codes will only ever reach the server log — never flip this on
  // for a launch with real, untrusted users. Exists for small-scale trials (a handful of
  // people you personally relay codes to) run on a host that sets NODE_ENV=production
  // outside the app's control (e.g. Render), where the safety check below would
  // otherwise refuse to boot even though the operator already knows and accepts this.
  ALLOW_SMS_CONSOLE_FALLBACK: z
    .enum(["true", "false"])
    .default("false")
    .transform((v) => v === "true"),

  // Phone verification codes.
  OTP_TTL_MINUTES: z.coerce.number().int().positive().default(10),
  OTP_MAX_ATTEMPTS: z.coerce.number().int().positive().default(5),
  // Per phone number, so flooding one victim with codes costs an attacker more than
  // rotating IP addresses.
  OTP_REQUESTS_PER_HOUR: z.coerce.number().int().positive().default(5),

  // Shown in-app as the support contact. International format without '+', e.g. 218911234567.
  SUPPORT_WHATSAPP: z.string().optional(),

  // Public origin of this deployment, e.g. https://sayeh.ly — used to build the privacy
  // and terms URLs the app and the store listings link to.
  PUBLIC_BASE_URL: z.string().url().optional(),

  // Force-update gate for the app itself, needed while it is sideloaded (no Play Store
  // to push updates through). 0 means "not enforced" — the default, so a fresh deploy
  // never locks everyone out by accident. Set it to the pubspec build number (the
  // digits after '+') of the oldest build still allowed to run; anything older is
  // blocked with a full-screen prompt pointing at APP_UPDATE_URL. See
  // mobile/lib/services/app_config.dart.
  APP_MIN_SUPPORTED_VERSION: z.coerce.number().int().nonnegative().default(0),
  // Shown to the customer on the update screen, e.g. "1.1.0" — purely cosmetic.
  APP_LATEST_VERSION_NAME: z.string().optional(),
  // Where the update prompt sends people — a link to the APK (Google Drive, etc.).
  // Reuse the same link across releases (Drive: upload a new version of the same file
  // instead of a new one) so this never has to change, only the version number above.
  APP_UPDATE_URL: z.string().url().optional(),

  // Push notifications (Firebase Cloud Messaging). All three are optional: with any of
  // them missing the app runs normally and simply sends nothing, which keeps local
  // development and the test suite free of Firebase credentials.
  // Get these from the Firebase console: Project settings -> Service accounts.
  FCM_PROJECT_ID: z.string().optional(),
  FCM_CLIENT_EMAIL: z.string().optional(),
  // The PEM private key. In a .env file the newlines must be written as literal \n —
  // they are converted back in notifications.service.ts.
  FCM_PRIVATE_KEY: z.string().optional(),

  // Catalog sync (src/modules/catalog/catalog-sync.service.ts).
  // Markup applied over supplier cost to compute our sell price, e.g. 0.15 = +15%.
  CATALOG_MARKUP_PERCENT: z.coerce.number().nonnegative().default(0.2),
  // Plus quotes prices in USD; we normalize everything to LYD at sync time so the orders
  // engine never juggles currencies. NO sane default exists for a parallel-market rate —
  // this MUST be set to the real current rate before running a sync for real.
  PLUS_USD_TO_LYD_RATE: z.coerce.number().positive().default(5),
});

export type Env = z.infer<typeof envSchema>;

/** Placeholder values shipped in .env.example. Fine locally, never acceptable in production. */
const PLACEHOLDER_SECRETS = [
  "change-me",
  "change-me-strong-password",
  "changeme",
  "secret",
  "password",
  "replace-me",
  "your-secret-here",
  "test",
];

function looksPlaceholder(value: string): boolean {
  const normalized = value.trim().toLowerCase();
  return PLACEHOLDER_SECRETS.some((p) => normalized === p || normalized.startsWith(`${p}-`) || normalized.startsWith(`${p}_`));
}

/**
 * Extra checks that only make sense once real money and real customers are involved.
 * A misconfigured production box should refuse to boot loudly rather than come up
 * quietly with a guessable webhook secret or a wide-open CORS policy.
 */
function assertProductionSafety(cfg: Env): void {
  if (cfg.NODE_ENV !== "production") return;
  const problems: string[] = [];

  if (cfg.SMS_WEBHOOK_HMAC_SECRET.length < 32 || looksPlaceholder(cfg.SMS_WEBHOOK_HMAC_SECRET)) {
    problems.push(
      "SMS_WEBHOOK_HMAC_SECRET must be a unique random value of at least 32 characters " +
        "(anyone who guesses it can credit wallets at will) — generate one with: openssl rand -hex 32"
    );
  }

  if (cfg.SEED_ADMIN_PASSWORD && (cfg.SEED_ADMIN_PASSWORD.length < 12 || looksPlaceholder(cfg.SEED_ADMIN_PASSWORD))) {
    problems.push("SEED_ADMIN_PASSWORD must be a unique password of at least 12 characters, not the example placeholder");
  }

  if (cfg.CORS_ALLOWED_ORIGINS.includes("*")) {
    problems.push("CORS_ALLOWED_ORIGINS must list explicit https origins, never '*'");
  }

  const insecureOrigin = cfg.CORS_ALLOWED_ORIGINS.find((o) => o.startsWith("http://") && !o.startsWith("http://localhost"));
  if (insecureOrigin) {
    problems.push(`CORS_ALLOWED_ORIGINS contains a plaintext origin (${insecureOrigin}); use https in production`);
  }

  // The app is deployed behind nginx (deploy/nginx.conf.template). Leaving this at 0 there
  // makes every request look like it came from 127.0.0.1, so all clients share a single
  // rate-limit bucket and per-IP login throttling stops working.
  if (cfg.TRUST_PROXY_HOPS === 0) {
    problems.push(
      "TRUST_PROXY_HOPS is 0 — set it to the number of proxies in front of this process " +
        "(1 for the bundled nginx setup), otherwise every client shares one rate-limit bucket"
    );
  }

  // Without a gateway the SMS sender falls back to printing codes to the log. In
  // production that means every verification and password-reset code is readable by
  // anyone with log access, and no customer ever actually receives one.
  if (!cfg.SMS_GATEWAY_URL && !cfg.ALLOW_SMS_CONSOLE_FALLBACK) {
    problems.push(
      "SMS_GATEWAY_URL must be set — without it, phone verification and password-reset " +
        "codes are written to the server log instead of being delivered. If this is a " +
        "deliberate small-scale trial, set ALLOW_SMS_CONSOLE_FALLBACK=true instead."
    );
  }

  if (!cfg.SUPPORT_WHATSAPP) {
    problems.push(
      "SUPPORT_WHATSAPP must be set — an order held for manual review leaves a customer's " +
        "money committed with no way to reach anyone"
    );
  }

  if (problems.length > 0) {
    // eslint-disable-next-line no-console
    console.error(`Refusing to start in production:\n  - ${problems.join("\n  - ")}`);
    throw new Error("Unsafe production environment configuration");
  }
}

function loadEnv(): Env {
  const parsed = envSchema.safeParse(process.env);
  if (!parsed.success) {
    // eslint-disable-next-line no-console
    console.error("Invalid environment configuration:", parsed.error.flatten().fieldErrors);
    throw new Error("Invalid environment configuration");
  }
  assertProductionSafety(parsed.data);
  return parsed.data;
}

export const env = loadEnv();
