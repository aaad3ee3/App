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
// How far a delivery's X-Timestamp may drift from "now" before it's refused — generous
// enough to absorb clock skew and Render cold-start delay, tight enough that a captured
// signature can't be replayed indefinitely.
const MAX_TIMESTAMP_DRIFT_SECONDS = 300;

export async function verifyWebhookHmac(request: FastifyRequest, _reply: FastifyReply): Promise<void> {
  const signature = request.headers["x-signature"];
  if (typeof signature !== "string" || !signature) {
    throw new HttpError(401, "unauthorized", "Missing X-Signature header");
  }
  const timestamp = request.headers["x-timestamp"];
  if (typeof timestamp !== "string" || !/^\d+$/.test(timestamp)) {
    throw new HttpError(401, "unauthorized", "Missing or invalid X-Timestamp header");
  }
  const driftSeconds = Math.abs(Date.now() / 1000 - Number(timestamp));
  if (driftSeconds > MAX_TIMESTAMP_DRIFT_SECONDS) {
    throw new HttpError(401, "unauthorized", "Stale X-Timestamp");
  }
  if (!request.rawBody) {
    throw new HttpError(401, "unauthorized", "Missing request body");
  }

  // Matches capcom6/android-sms-gateway's own PayloadSingingPlugin exactly: it signs the
  // body text with the timestamp APPENDED to it as one string (see generateSignature in
  // PayloadSingingPlugin.kt), not the raw body alone — signing the body alone, as this
  // used to, never verifies against a real delivery from that app regardless of whether
  // the shared secret itself is correct, which is why no delivery ever got past this
  // check even after rotating the secret on both ends.
  const expected = hmacSha256Hex(env.SMS_WEBHOOK_HMAC_SECRET, request.rawBody.toString("utf8") + timestamp);

  const signatureLooksHex = /^[0-9a-f]+$/i.test(signature) && signature.length === expected.length;
  if (!signatureLooksHex || !timingSafeEqualHex(expected, signature.toLowerCase())) {
    throw new HttpError(401, "unauthorized", "Invalid signature");
  }
}
