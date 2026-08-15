import type { FastifyInstance } from "fastify";
import { z } from "zod";
import { env } from "../../config/env";
import { verifyWebhookHmac } from "../../plugins/webhook-hmac.plugin";
import { processIncomingSms } from "./sms.matcher";

// Deliberately permissive/passthrough: SMS-forwarding apps vary in field naming, and a
// malformed-but-signed payload should still resolve into the normal "ignored_no_match"
// pipeline outcome (§4 of the plan) rather than a hard 400, so a misbehaving gateway app
// doesn't retry-storm the endpoint.
const webhookBodySchema = z
  .object({
    sender: z.string().optional(),
    from: z.string().optional(),
    text: z.string().optional(),
    message: z.string().optional(),
    message_id: z.string().optional(),
    provider_message_id: z.string().optional(),
    timestamp: z.union([z.string(), z.number()]).optional(),
  })
  .passthrough();

export default async function smsRoutes(app: FastifyInstance) {
  // Scoped to this plugin only (Fastify content-type parsers are encapsulated) — captures
  // the raw body bytes for HMAC verification while still producing a parsed JSON `body`.
  app.addContentTypeParser("application/json", { parseAs: "buffer" }, (request, body, done) => {
    request.rawBody = body as Buffer;
    if (body.length === 0) {
      done(null, {});
      return;
    }
    try {
      done(null, JSON.parse(body.toString("utf8")));
    } catch (err) {
      done(err as Error, undefined);
    }
  });

  app.post(
    "/libyana",
    {
      config: {
        rateLimit: { max: env.RATE_LIMIT_WEBHOOK_MAX, timeWindow: env.RATE_LIMIT_WEBHOOK_WINDOW_MS },
      },
      preHandler: verifyWebhookHmac,
    },
    async (request, reply) => {
      const body = webhookBodySchema.parse(request.body);
      const reportedSender = body.sender ?? body.from ?? null;
      const rawText = body.text ?? body.message ?? "";
      const providerMessageId = body.message_id ?? body.provider_message_id ?? null;

      const result = await processIncomingSms({
        rawPayload: request.body,
        rawText,
        reportedSender,
        providerMessageId,
      });

      // Always 200 for any signature-valid delivery, matched or not — see module docstring.
      reply.status(200).send({ ok: true, match_status: result.matchStatus });
    }
  );
}
