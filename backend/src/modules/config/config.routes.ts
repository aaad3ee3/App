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
      // Served from the same static folder as the policies. Not legally required like the
      // other two, but it deflects the support questions that otherwise arrive one by one
      // over WhatsApp — "where is my code", "why did my top-up not land".
      faq_url: env.PUBLIC_BASE_URL ? `${env.PUBLIC_BASE_URL}/legal/faq.html` : null,
    },
    auth: {
      // Android returns no ID token at all unless the sign-in call is given this, so the
      // app reads it from here rather than baking it in — and serving the same value the
      // verifier accepts makes the two impossible to configure out of sync. Public by
      // design: an OAuth client ID identifies the app, it does not authorise anything.
      // Null switches the Google button off in the app instead of showing one that fails.
      google_server_client_id: env.GOOGLE_SERVER_CLIENT_ID ?? null,
    },
    // Lets the app show real expectations before purchase instead of leaving the customer
    // guessing whether "a minute" or "a day" is normal.
    delivery: {
      giftcard_minutes: 5,
      smm_hours: 24,
    },
    payments: {
      // Null switches the Binance Pay option off in the top-up screen instead of showing
      // one that always fails at verify time. Public by design — a Pay ID identifies
      // where to send money, it authorises nothing on its own.
      binance_pay_id: env.BINANCE_API_KEY && env.BINANCE_API_SECRET ? env.BINANCE_PAY_ID ?? null : null,
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
