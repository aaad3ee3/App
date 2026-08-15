import Fastify from "fastify";
import cors from "@fastify/cors";
import helmet from "@fastify/helmet";
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

export function buildApp() {
  const app = Fastify({
    logger: {
      level: env.LOG_LEVEL,
      transport: env.NODE_ENV === "development" ? { target: "pino-pretty" } : undefined,
      // Never let phone numbers, SMS text, or bearer tokens leak into aggregated logs —
      // sms_events (access-controlled) is the right place for that detail, not app logs.
      redact: ["req.headers.authorization", 'req.headers["x-signature"]'],
    },
  });

  app.register(errorHandlerPlugin);
  app.register(helmet);
  app.register(cors, {
    // Bearer-token clients (Flutter app) don't need CORS at all; this only matters for a
    // future browser-based admin dashboard, added explicitly via CORS_ALLOWED_ORIGINS.
    origin: env.CORS_ALLOWED_ORIGINS.length > 0 ? env.CORS_ALLOWED_ORIGINS : false,
  });
  app.register(rateLimitPlugin);
  app.register(authPlugin);
  app.register(adminAuthPlugin);

  app.get("/health", async () => ({ ok: true }));

  app.register(authRoutes, { prefix: "/api/v1/auth" });
  app.register(walletRoutes, { prefix: "/api/v1/wallet" });
  app.register(topupsRoutes, { prefix: "/api/v1/topups" });
  app.register(smsRoutes, { prefix: "/api/v1/webhooks/sms" });
  app.register(adminRoutes, { prefix: "/api/v1/admin" });

  return app;
}
