import type { Knex } from "knex";
import { db } from "../../db/knex";
import type { SmsEventRow, SmsMatchStatus, TopupRequestRow } from "../../db/types";

export interface InsertEventInput {
  dedupeKey: string;
  rawPayload: unknown;
  rawText: string;
  reportedSender: string | null;
  senderTrusted: boolean;
  receivedAt: Date;
}

/**
 * Idempotent insert keyed on `delivery_dedupe_key`. If a row with the same key already
 * exists (a retried webhook delivery), returns `isNew: false` with the *existing* row so
 * the caller can short-circuit and return its already-computed outcome instead of
 * re-running matching/crediting.
 */
export async function insertEventIfNew(input: InsertEventInput): Promise<{ isNew: boolean; event: SmsEventRow }> {
  const inserted = await db<SmsEventRow>("sms_events")
    .insert({
      delivery_dedupe_key: input.dedupeKey,
      raw_payload: input.rawPayload,
      raw_text: input.rawText,
      reported_sender: input.reportedSender,
      sender_trusted: input.senderTrusted,
      received_at: input.receivedAt,
    })
    .onConflict("delivery_dedupe_key")
    .ignore()
    .returning("*");

  if (inserted.length > 0 && inserted[0]) {
    return { isNew: true, event: inserted[0] };
  }

  const existing = await db<SmsEventRow>("sms_events").where({ delivery_dedupe_key: input.dedupeKey }).first();
  if (!existing) {
    throw new Error(`Expected an existing sms_event for dedupe key ${input.dedupeKey} after conflict`);
  }
  return { isNew: false, event: existing };
}

export interface UpdateEventOutcomeInput {
  parsedOk?: boolean;
  parsedAmount?: number;
  parsedSenderPhone?: string;
  matchStatus?: SmsMatchStatus;
  matchedTopupRequestId?: string;
  processedAt?: Date;
  resolvedBy?: string;
  resolutionNote?: string;
}

export function updateEventOutcome(
  eventId: string,
  fields: UpdateEventOutcomeInput,
  trx: Knex | Knex.Transaction = db
): Promise<number> {
  const update: Record<string, unknown> = {};
  if (fields.parsedOk !== undefined) update.parsed_ok = fields.parsedOk;
  if (fields.parsedAmount !== undefined) update.parsed_amount = fields.parsedAmount;
  if (fields.parsedSenderPhone !== undefined) update.parsed_sender_phone = fields.parsedSenderPhone;
  if (fields.matchStatus !== undefined) update.match_status = fields.matchStatus;
  if (fields.matchedTopupRequestId !== undefined) update.matched_topup_request_id = fields.matchedTopupRequestId;
  if (fields.processedAt !== undefined) update.processed_at = fields.processedAt;
  if (fields.resolvedBy !== undefined) update.resolved_by = fields.resolvedBy;
  if (fields.resolutionNote !== undefined) update.resolution_note = fields.resolutionNote;
  return trx("sms_events").where({ id: eventId }).update(update);
}

export function findEventById(id: string, trx: Knex | Knex.Transaction = db): Promise<SmsEventRow | undefined> {
  return trx<SmsEventRow>("sms_events").where({ id }).first();
}

export async function listEventsByMatchStatus(
  matchStatus: SmsMatchStatus | undefined,
  opts: { limit: number; offset: number }
): Promise<{ items: SmsEventRow[]; total: number }> {
  const base = db<SmsEventRow>("sms_events");
  if (matchStatus) base.where({ match_status: matchStatus });

  const [items, countRow] = await Promise.all([
    base.clone().orderBy("received_at", "desc").limit(opts.limit).offset(opts.offset),
    base.clone().count<{ count: string }[]>("id as count"),
  ]);
  return { items, total: Number(countRow[0]?.count ?? 0) };
}

/**
 * Candidate pending top-ups for a parsed SMS, locked `FOR UPDATE SKIP LOCKED` so two
 * concurrent webhook deliveries never race on the same row. Must be called inside a
 * transaction — the lock is released on commit/rollback.
 *
 * A request with no declared `requested_amount` (see topups.service.ts — a customer can
 * skip declaring one) matches ANY amount from its phone, not just one within tolerance —
 * that's the whole point of not declaring a figure. This can only widen which requests
 * are *candidates*, never silently pick one: two or more candidates (declared or not)
 * still falls through to the ambiguous, no-auto-credit path below in sms.matcher.ts.
 */
export function findMatchCandidates(
  trx: Knex.Transaction,
  params: { senderPhone: string; amount: number; toleranceLyd: number; now: Date }
): Promise<TopupRequestRow[]> {
  return trx<TopupRequestRow>("topup_requests")
    .where({ status: "pending", sender_phone: params.senderPhone })
    .andWhere("expires_at", ">", params.now)
    .andWhere((qb) =>
      qb.whereNull("requested_amount").orWhereRaw("ABS(requested_amount - ?) <= ?", [params.amount, params.toleranceLyd])
    )
    .orderBy("created_at", "asc")
    .forUpdate()
    .skipLocked();
}
