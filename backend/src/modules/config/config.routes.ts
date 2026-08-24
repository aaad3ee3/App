import type { FastifyInstance } from "fastify";
import { env } from "../../config/env";

/**
 * Public app configuration.
 *
 * Deliberately unauthenticated: the app needs the support contact and the policy links
 * on the login and registration screens, before anyone has an account. Nothing here is
 * secret — it is the same information printed in the store listing.
 *
 * Serving it from the API rather than hard-coding it in the app means the support number
 * can change without shipping a new build through store review.
 */
export default async function configRoutes(app: FastifyInstance) {
  app.get("/", async () => ({
    support: {
      whatsapp: env.SUPPORT_WHATSAPP ?? null,
    },
    legal: {
      privacy_url: env.PUBLIC_BASE_URL ? `${env.PUBLIC_BASE_URL}/legal/privacy.html` : null,
      terms_url: env.PUBLIC_BASE_URL ? `${env.PUBLIC_BASE_URL}/legal/terms.html` : null,
    },
    // Lets the app show real expectations before purchase instead of leaving the customer
    // guessing whether "a minute" or "a day" is normal.
    delivery: {
      giftcard_minutes: 5,
      smm_hours: 24,
    },
    // Force-update gate — see APP_MIN_SUPPORTED_VERSION in config/env.ts. Checked on
    // every launch so an old sideloaded build can be retired without messaging anyone
    // individually.
    app: {
      min_supported_version: env.APP_MIN_SUPPORTED_VERSION,
      latest_version_name: env.APP_LATEST_VERSION_NAME ?? null,
      update_url: env.APP_UPDATE_URL ?? null,
    },
  }));
}
