import { afterAll, beforeEach, describe, expect, it } from "vitest";
import { db } from "../../src/db/knex";
import { processIncomingSms } from "../../src/modules/sms/sms.matcher";
import * as walletRepo from "../../src/modules/wallet/wallet.repository";
import { createPendingTopup, createTestUser, libyanaSmsText, resetDb } from "../helpers";

const TRUSTED_SENDER = "Libyana";

beforeEach(async () => {
  await resetDb();
});

afterAll(async () => {
  await db.destroy();
});

describe("processIncomingSms — matching & crediting pipeline", () => {
  it("credits the wallet on a clean single match", async () => {
    const { user, wallet } = await createTestUser();
    const topup = await createPendingTopup({ userId: user.id, senderPhone: "0912345678", requestedAmount: 50 });

    const result = await processIncomingSms({
      rawPayload: { sender: TRUSTED_SENDER, text: libyanaSmsText(50, "0912345678") },
      rawText: libyanaSmsText(50, "0912345678"),
      reportedSender: TRUSTED_SENDER,
      providerMessageId: "msg-1",
    });

    expect(result.matchStatus).toBe("matched");

    const updatedTopup = await db("topup_requests").where({ id: topup.id }).first();
    expect(updatedTopup.status).toBe("credited");
    expect(updatedTopup.matched_sms_event_id).toBe(result.eventId);

    const updatedWallet = await walletRepo.getWalletByUserId(user.id);
    expect(Number(updatedWallet!.balance)).toBe(50);
    expect(Number(updatedWallet!.balance)).not.toBe(Number(wallet.balance));

    const ledgerRows = await db("wallet_transactions").where({ user_id: user.id });
    expect(ledgerRows).toHaveLength(1);
    expect(ledgerRows[0].type).toBe("topup_credit");
    expect(Number(ledgerRows[0].amount)).toBe(50);
  });

  it("does not credit anything when no pending top-up matches", async () => {
    const { user } = await createTestUser();

    const result = await processIncomingSms({
      rawPayload: {},
      rawText: libyanaSmsText(75, "0923456789"),
      reportedSender: TRUSTED_SENDER,
      providerMessageId: "msg-2",
    });

    expect(result.matchStatus).toBe("unmatched");
    const wallet = await walletRepo.getWalletByUserId(user.id);
    expect(Number(wallet!.balance)).toBe(0);
  });

  it("flags ambiguous when two pending requests could both match, and credits neither", async () => {
    const { user: userA } = await createTestUser();
    const { user: userB } = await createTestUser();
    await createPendingTopup({ userId: userA.id, senderPhone: "0912345678", requestedAmount: 100 });
    await createPendingTopup({ userId: userB.id, senderPhone: "0912345678", requestedAmount: 100 });

    const result = await processIncomingSms({
      rawPayload: {},
      rawText: libyanaSmsText(100, "0912345678"),
      reportedSender: TRUSTED_SENDER,
      providerMessageId: "msg-3",
    });

    expect(result.matchStatus).toBe("ambiguous");

    const walletA = await walletRepo.getWalletByUserId(userA.id);
    const walletB = await walletRepo.getWalletByUserId(userB.id);
    expect(Number(walletA!.balance)).toBe(0);
    expect(Number(walletB!.balance)).toBe(0);

    const pendingCount = await db("topup_requests").where({ status: "pending" }).count();
    expect(Number(pendingCount[0].count)).toBe(2);
  });

  it("ignores SMS from an untrusted sender without touching any wallet", async () => {
    const { user } = await createTestUser();
    await createPendingTopup({ userId: user.id, senderPhone: "0912345678", requestedAmount: 50 });

    const result = await processIncomingSms({
      rawPayload: {},
      rawText: libyanaSmsText(50, "0912345678"),
      reportedSender: "SomeRandomSender",
      providerMessageId: "msg-4",
    });

    expect(result.matchStatus).toBe("ignored_untrusted_sender");
    const wallet = await walletRepo.getWalletByUserId(user.id);
    expect(Number(wallet!.balance)).toBe(0);
  });

  it("ignores text that doesn't match the Libyana transfer pattern", async () => {
    const result = await processIncomingSms({
      rawPayload: {},
      rawText: "رصيدك الحالي هو 20 دينار",
      reportedSender: TRUSTED_SENDER,
      providerMessageId: "msg-5",
    });

    expect(result.matchStatus).toBe("ignored_no_match");
  });

  it("is idempotent under webhook retry: the same delivery never double-credits", async () => {
    const { user } = await createTestUser();
    await createPendingTopup({ userId: user.id, senderPhone: "0912345678", requestedAmount: 50 });

    const payload = {
      rawPayload: { sender: TRUSTED_SENDER, text: libyanaSmsText(50, "0912345678") },
      rawText: libyanaSmsText(50, "0912345678"),
      reportedSender: TRUSTED_SENDER,
      providerMessageId: "msg-retry-1",
    };

    const first = await processIncomingSms(payload);
    const second = await processIncomingSms(payload); // simulates the gateway app retrying the same delivery

    expect(first.matchStatus).toBe("matched");
    expect(second.matchStatus).toBe("matched");
    expect(second.eventId).toBe(first.eventId); // same sms_events row, not reprocessed

    const wallet = await walletRepo.getWalletByUserId(user.id);
    expect(Number(wallet!.balance)).toBe(50); // credited exactly once, not 100

    const ledgerRows = await db("wallet_transactions").where({ user_id: user.id });
    expect(ledgerRows).toHaveLength(1);

    const eventRows = await db("sms_events").where({ delivery_dedupe_key: "provider:msg-retry-1" });
    expect(eventRows).toHaveLength(1);
  });

  it("under concurrent deliveries for the same topup, credits it exactly once", async () => {
    const { user } = await createTestUser();
    await createPendingTopup({ userId: user.id, senderPhone: "0934567890", requestedAmount: 30 });

    const text = libyanaSmsText(30, "0934567890");
    // Two distinct SMS deliveries (different provider message ids) racing to match the
    // same single pending topup — FOR UPDATE SKIP LOCKED + the transactional status
    // re-check must ensure only one wins.
    const [resultA, resultB] = await Promise.all([
      processIncomingSms({ rawPayload: {}, rawText: text, reportedSender: TRUSTED_SENDER, providerMessageId: "race-a" }),
      processIncomingSms({ rawPayload: {}, rawText: text, reportedSender: TRUSTED_SENDER, providerMessageId: "race-b" }),
    ]);

    const outcomes = [resultA.matchStatus, resultB.matchStatus].sort();
    // Exactly one matched; the other finds zero remaining pending candidates.
    expect(outcomes).toEqual(["matched", "unmatched"]);

    const wallet = await walletRepo.getWalletByUserId(user.id);
    expect(Number(wallet!.balance)).toBe(30); // credited exactly once, never 60

    const ledgerRows = await db("wallet_transactions").where({ user_id: user.id });
    expect(ledgerRows).toHaveLength(1);
  });

  it("an amount-free request (no requested_amount declared) credits whatever the SMS says", async () => {
    const { user } = await createTestUser();
    await createPendingTopup({ userId: user.id, senderPhone: "0966677788" }); // no requestedAmount

    const result = await processIncomingSms({
      rawPayload: {},
      rawText: libyanaSmsText(37.5, "0966677788"),
      reportedSender: TRUSTED_SENDER,
      providerMessageId: "msg-free-1",
    });

    expect(result.matchStatus).toBe("matched");
    const wallet = await walletRepo.getWalletByUserId(user.id);
    expect(Number(wallet!.balance)).toBe(37.5);

    const updatedTopup = await db("topup_requests").where({ user_id: user.id }).first();
    expect(updatedTopup.status).toBe("credited");
  });

  it("an amount-free request still goes ambiguous if a second pending request shares the phone", async () => {
    const { user: userA } = await createTestUser();
    const { user: userB } = await createTestUser();
    await createPendingTopup({ userId: userA.id, senderPhone: "0977788899" }); // amount-free
    await createPendingTopup({ userId: userB.id, senderPhone: "0977788899", requestedAmount: 20 });

    const result = await processIncomingSms({
      rawPayload: {},
      rawText: libyanaSmsText(20, "0977788899"),
      reportedSender: TRUSTED_SENDER,
      providerMessageId: "msg-free-2",
    });

    expect(result.matchStatus).toBe("ambiguous");
    expect(Number((await walletRepo.getWalletByUserId(userA.id))!.balance)).toBe(0);
    expect(Number((await walletRepo.getWalletByUserId(userB.id))!.balance)).toBe(0);
  });

  it("rejects a phone number normalization mismatch (e.g. +218 prefix vs local 0-prefix) correctly", async () => {
    const { user } = await createTestUser();
    // User registered the sender phone in local form...
    await createPendingTopup({ userId: user.id, senderPhone: "0955512345", requestedAmount: 40 });

    // ...but the SMS reports the payer number without the leading 0 (as Libyana's real
    // SMS format does) — normalization in both directions must land on the same canonical form.
    const result = await processIncomingSms({
      rawPayload: {},
      rawText: libyanaSmsText(40, "955512345"),
      reportedSender: TRUSTED_SENDER,
      providerMessageId: "msg-6",
    });

    expect(result.matchStatus).toBe("matched");
  });
});
