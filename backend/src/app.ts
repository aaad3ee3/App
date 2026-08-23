import path from "node:path";
import Fastify from "fastify";
import cors from "@fastify/cors";
import helmet from "@fastify/helmet";
import fastifyStatic from "@fastify/static";
import { env } from "./config/env";
import errorHandlerPlugin from "./plugins/error-handler.plugin";
import authPlugin from "./plugins/auth.plugin";
import adminAuthPlugin from "./plugins/admin-auth.plugin";
import rateLimitPlugin from "./plugins/rate-limit.plugin";
import authRoutes from "./modules/auth/auth.routes";
import walletRoutes from "./modules/wallet/wallet.routes";
import topupsRoutes from "./modules/topups/topups.routes";
import smsRoutes from "./modules/sms/sms.routes";
import adminRoutes from "./modules/admin/admin.routes";
import adminAuthRoutes from "./modules/admin/admin-auth.routes";
import catalogRoutes from "./modules/catalog/catalog.routes";
import ordersRoutes from "./modules/orders/orders.routes";
import notificationsRoutes from "./modules/notifications/notifications.routes";
import configRoutes from "./modules/config/config.routes";

export function buildApp() {
  const app = Fastify({
    // Behind nginx, request.ip is the proxy's address unless we opt in. Every rate limit
    // in the app keys off request.ip, so with this unset all clients share one bucket and
    // one attacker can exhaust everyone's quota. Trusting a *hop count* rather than
    // `true` also means a client can't spoof its own address via X-Forwarded-For: only
    // the value written by our own proxy is honoured.
    trustProxy: env.TRUST_PROXY_HOPS > 0 ? env.TRUST_PROXY_HOPS : false,
    bodyLimit: env.MAX_BODY_BYTES,
    logger: {
      level: env.LOG_LEVEL,
      transport: env.NODE_ENV === "development" ? { target: "pino-pretty" } : undefined,
      // Never let phone numbers, SMS text, or bearer tokens leak into aggregated logs —
      // sms_events (access-controlled) is the right place for that detail, not app logs.
      redact: ["req.headers.authorization", 'req.headers["x-signature"]', 'req.headers.cookie'],
    },
  });

  app.register(errorHandlerPlugin);
  app.register(helmet, {
    // Almost everything here is JSON, so the default stays "permit nothing": if a
    // reflected value ever lands in an error page, the browser still won't run it.
    // style-src is the one exception, needed for the two static legal pages below —
    // their inline <style> block is the same one nginx already serves with
    // style-src 'self' 'unsafe-inline' in the VPS/home deploys (deploy/security-headers.conf).
    contentSecurityPolicy: {
      directives: {
        "default-src": ["'none'"],
        "style-src": ["'self'", "'unsafe-inline'"],
        "frame-ancestors": ["'none'"],
        "base-uri": ["'none'"],
      },
    },
    crossOriginResourcePolicy: { policy: "same-site" },
    referrerPolicy: { policy: "no-referrer" },
    // Only meaningful over HTTPS, which is how this is deployed (see deploy/README.md).
    hsts: env.NODE_ENV === "production" ? { maxAge: 31_536_000, includeSubDomains: true } : false,
  });
  app.register(cors, {
    // Bearer-token clients (the Flutter app) don't use CORS at all; this exists for the
    // browser-based admin dashboard, whose origin is listed in CORS_ALLOWED_ORIGINS.
    // Empty list => no cross-origin browser access at all, which is the safe default.
    origin: env.CORS_ALLOWED_ORIGINS.length > 0 ? env.CORS_ALLOWED_ORIGINS : false,
    credentials: false,
    methods: ["GET", "POST"],
    allowedHeaders: ["Content-Type", "Authorization"],
    maxAge: 86_400,
  });
  app.register(rateLimitPlugin);
  app.register(authPlugin);
  app.register(adminAuthPlugin);

  app.get("/health", async () => ({ ok: true }));

  // Privacy policy and terms need a stable public URL — the app and the store listings
  // link to them directly, and a store review fails on a dead link. Deployments that put
  // nginx in front (deploy/README.md, deploy/home/README.md) already serve these via a
  // /legal/ alias; on a platform with no reverse-proxy layer of our own (e.g. Render)
  // this is the only thing serving them, so it stays registered unconditionally rather
  // than only when nginx is absent — one code path instead of two to keep in sync.
  app.register(fastifyStatic, {
    root: path.join(__dirname, "..", "..", "legal"),
    prefix: "/legal/",
  });

  app.register(authRoutes, { prefix: "/api/v1/auth" });
  app.register(walletRoutes, { prefix: "/api/v1/wallet" });
  app.register(topupsRoutes, { prefix: "/api/v1/topups" });
  app.register(smsRoutes, { prefix: "/api/v1/webhooks/sms" });
  app.register(adminAuthRoutes, { prefix: "/api/v1/admin" });
  app.register(adminRoutes, { prefix: "/api/v1/admin" });
  app.register(catalogRoutes, { prefix: "/api/v1/catalog" });
  app.register(ordersRoutes, { prefix: "/api/v1/orders" });
  app.register(notificationsRoutes, { prefix: "/api/v1/notifications" });
  app.register(configRoutes, { prefix: "/api/v1/config" });

  return app;
}
