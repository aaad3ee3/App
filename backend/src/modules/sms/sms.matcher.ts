import { db } from "../../db/knex";
import { env } from "../../config/env";
import { SMS_MATCH_STATUS, WALLET_TX_REFERENCE_TYPES, WALLET_TX_TYPES } from "../../config/constants";
import { buildSmsDedupeKey } from "../../lib/idempotency";
import { normalizeLibyanPhone } from "../../lib/phone";
import type { SmsMatchStatus } from "../../db/types";
import * as walletRepo from "../wallet/wallet.repository";
import { isTrustedSender, parseLibyanaSms } from "./sms.parser";
import * as smsRepo from "./sms.repository";

export interface IncomingSms {
  rawPayload: unknown;
  rawText: string;
  reportedSender: string | null;
  providerMessageId?: string | null;
  receivedAt?: Date;
}

export interface SmsProcessResult {
  eventId: string;
  matchStatus: SmsMatchStatus;
}

/**
 * Full pipeline for one webhook delivery: idempotency check → trusted-sender check →
 * regex parse → phone normalize → locked candidate match → atomic credit.
 *
 * See §4 of the phase-1 plan for the full rationale. In short: this function is safe to
 * call twice with the exact same delivery (retry-safe via the dedupe key), and never
 * auto-credits when more than one pending top-up could plausibly match (ambiguous cases
 * always go to admin, never guessed).
 */
export async function processIncomingSms(input: IncomingSms): Promise<SmsProcessResult> {
  const receivedAt = input.receivedAt ?? new Date();
  const dedupeKey = buildSmsDedupeKey({
    providerMessageId: input.providerMessageId ?? null,
    reportedSender: input.reportedSender,
    rawText: input.rawText,
    receivedAt,
  });

  const senderTrusted = isTrustedSender(input.reportedSender, env.SMS_TRUSTED_SENDERS);

  const insertResult = await smsRepo.insertEventIfNew({
    dedupeKey,
    rawPayload: input.rawPayload,
    rawText: input.rawText,
    reportedSender: input.reportedSender,
    senderTrusted,
    receivedAt,
  });

  // Retried delivery of an already-processed event — never re-run matching/crediting.
  if (!insertResult.isNew) {
    return { eventId: insertResult.event.id, matchStatus: insertResult.event.match_status };
  }

  const eventId = insertResult.event.id;

  if (!senderTrusted) {
    await smsRepo.updateEventOutcome(eventId, {
      matchStatus: SMS_MATCH_STATUS.IGNORED_UNTRUSTED_SENDER,
      processedAt: new Date(),
    });
    return { eventId, matchStatus: SMS_MATCH_STATUS.IGNORED_UNTRUSTED_SENDER };
  }

  const parsed = parseLibyanaSms(input.rawText);
  if (!parsed) {
    await smsRepo.updateEventOutcome(eventId, {
      parsedOk: false,
      matchStatus: SMS_MATCH_STATUS.IGNORED_NO_MATCH,
      processedAt: new Date(),
    });
    return { eventId, matchStatus: SMS_MATCH_STATUS.IGNORED_NO_MATCH };
  }

  const normalizedPhone = normalizeLibyanPhone(parsed.senderPhoneRaw);
  if (!normalizedPhone) {
    await smsRepo.updateEventOutcome(eventId, {
      parsedOk: true,
      parsedAmount: parsed.amount,
      matchStatus: SMS_MATCH_STATUS.IGNORED_NO_MATCH,
      processedAt: new Date(),
    });
    return { eventId, matchStatus: SMS_MATCH_STATUS.IGNORED_NO_MATCH };
  }

  const matchStatus = await db.transaction(async (trx) => {
    const candidates = await smsRepo.findMatchCandidates(trx, {
      senderPhone: normalizedPhone,
      amount: parsed.amount,
      toleranceLyd: env.TOPUP_AMOUNT_TOLERANCE_LYD,
      now: receivedAt,
    });

    const commonFields = {
      parsedOk: true,
      parsedAmount: parsed.amount,
      parsedSenderPhone: normalizedPhone,
      processedAt: new Date(),
    };

    if (candidates.length === 0) {
      await smsRepo.updateEventOutcome(
        eventId,
        { ...commonFields, matchStatus: SMS_MATCH_STATUS.UNMATCHED },
        trx
      );
      return SMS_MATCH_STATUS.UNMATCHED;
    }

    if (candidates.length > 1) {
      // Never auto-pick between multiple plausible matches — wrong-account credit is the
      // one failure mode worse than making the user wait for admin review.
      await smsRepo.updateEventOutcome(
        eventId,
        { ...commonFields, matchStatus: SMS_MATCH_STATUS.AMBIGUOUS },
        trx
      );
      return SMS_MATCH_STATUS.AMBIGUOUS;
    }

    const topup = candidates[0]!;

    const wallet = await walletRepo.getWalletByUserId(topup.user_id, trx);
    if (!wallet) {
      throw new Error(`Wallet missing for user ${topup.user_id} while crediting topup ${topup.id}`);
    }

    const walletTx = await walletRepo.creditWallet(trx, {
      userId: topup.user_id,
      walletId: wallet.id,
      amount: parsed.amount,
      type: WALLET_TX_TYPES.TOPUP_CREDIT,
      referenceType: WALLET_TX_REFERENCE_TYPES.TOPUP_REQUEST,
      referenceId: topup.id,
      idempotencyKey: `sms_event:${eventId}`,
      createdBy: null,
      note: null,
    });

    await trx("topup_requests").where({ id: topup.id }).update({
      status: "credited",
      matched_sms_event_id: eventId,
      credited_wallet_transaction_id: walletTx?.id ?? null,
      updated_at: new Date(),
    });

    await smsRepo.updateEventOutcome(
      eventId,
      { ...commonFields, matchStatus: SMS_MATCH_STATUS.MATCHED, matchedTopupRequestId: topup.id },
      trx
    );

    return SMS_MATCH_STATUS.MATCHED;
  });

  return { eventId, matchStatus };
}
