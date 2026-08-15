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

  RATE_LIMIT_LOGIN_MAX: z.coerce.number().int().positive().default(5),
  RATE_LIMIT_LOGIN_WINDOW_MS: z.coerce.number().int().positive().default(60_000),
  RATE_LIMIT_REGISTER_MAX: z.coerce.number().int().positive().default(5),
  RATE_LIMIT_REGISTER_WINDOW_MS: z.coerce.number().int().positive().default(600_000),
  RATE_LIMIT_WEBHOOK_MAX: z.coerce.number().int().positive().default(120),
  RATE_LIMIT_WEBHOOK_WINDOW_MS: z.coerce.number().int().positive().default(60_000),

  LOGIN_MAX_FAILED_ATTEMPTS: z.coerce.number().int().positive().default(5),
  LOGIN_LOCKOUT_MINUTES: z.coerce.number().int().positive().default(5),

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
});

export type Env = z.infer<typeof envSchema>;

function loadEnv(): Env {
  const parsed = envSchema.safeParse(process.env);
  if (!parsed.success) {
    // eslint-disable-next-line no-console
    console.error("Invalid environment configuration:", parsed.error.flatten().fieldErrors);
    throw new Error("Invalid environment configuration");
  }
  return parsed.data;
}

export const env = loadEnv();
