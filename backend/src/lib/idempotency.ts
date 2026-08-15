import { sha256Hex } from "./crypto";

/**
 * Derives the sms_events.delivery_dedupe_key. Prefers a provider-supplied message id
 * (if the SMS-forwarding app sends one) since that's a true unique identifier for the
 * delivery. Falls back to a content hash bucketed to the minute, so the *same* SMS
 * re-delivered by a retrying gateway app hashes identically, while two distinct SMS
 * with coincidentally identical text more than a minute apart do not collide.
 */
export function buildSmsDedupeKey(input: {
  providerMessageId?: string | null;
  reportedSender: string | null;
  rawText: string;
  receivedAt: Date;
}): string {
  if (input.providerMessageId) {
    return `provider:${input.providerMessageId}`;
  }
  const minuteBucket = Math.floor(input.receivedAt.getTime() / 60_000);
  return `hash:${sha256Hex(`${input.reportedSender ?? ""}|${input.rawText}|${minuteBucket}`)}`;
}
