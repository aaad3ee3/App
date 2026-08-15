import type { FastifyReply, FastifyRequest } from "fastify";
import { env } from "../config/env";
import { hmacSha256Hex, timingSafeEqualHex } from "../lib/crypto";
import { HttpError } from "./error-handler.plugin";

declare module "fastify" {
  interface FastifyRequest {
    rawBody?: Buffer;
  }
}

/**
 * Not a registered Fastify plugin — just a preHandler used by sms.routes.ts. Requires the
 * route's Fastify instance to have a content-type parser that populates `request.rawBody`
 * (see sms.routes.ts, which adds one scoped to just that plugin so the rest of the app
 * keeps Fastify's normal JSON parsing).
 */
export async function verifyWebhookHmac(request: FastifyRequest, _reply: FastifyReply): Promise<void> {
  const signature = request.headers["x-signature"];
  if (typeof signature !== "string" || !signature) {
    throw new HttpError(401, "unauthorized", "Missing X-Signature header");
  }
  if (!request.rawBody) {
    throw new HttpError(401, "unauthorized", "Missing request body");
  }

  const expected = hmacSha256Hex(env.SMS_WEBHOOK_HMAC_SECRET, request.rawBody.toString("utf8"));

  const signatureLooksHex = /^[0-9a-f]+$/i.test(signature) && signature.length === expected.length;
  if (!signatureLooksHex || !timingSafeEqualHex(expected, signature.toLowerCase())) {
    throw new HttpError(401, "unauthorized", "Invalid signature");
  }
}
