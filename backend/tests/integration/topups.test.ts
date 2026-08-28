import { afterAll, beforeEach, describe, expect, it } from "vitest";
import { db } from "../../src/db/knex";
import { createTopup } from "../../src/modules/topups/topups.service";
import { createTestUser, resetDb } from "../helpers";

afterAll(async () => {
  await db.destroy();
});

/**
 * Regression coverage for a real vulnerability: sender_phone used to be accepted as
 * free-text with no check that the caller actually controls it. Since sms.matcher.ts
 * auto-credits whichever account holds the sole pending request matching an incoming
 * transfer's phone+amount, that let any authenticated user declare someone else's Libyana
 * number and steal a transfer intended for that number's real owner.
 */
describe("topups — sender_phone must be the caller's own verified phone", () => {
  beforeEach(async () => {
    await resetDb();
  });

  async function linkPhone(userId: string, phone: string): Promise<void> {
    await db("users").where({ id: userId }).update({ phone, phone_verified_at: new Date() });
  }

  it("rejects a top-up when the caller has no linked phone at all", async () => {
    const { user } = await createTestUser();

    await expect(createTopup(user.id, { sender_phone: "0921234567" })).rejects.toMatchObject({
      statusCode: 403,
      code: "phone_not_linked",
    });

    const rows = await db("topup_requests").where({ user_id: user.id });
    expect(rows).toHaveLength(0);
  });

  it("rejects a top-up declaring a phone number that isn't the caller's own linked one", async () => {
    const { user } = await createTestUser();
    await linkPhone(user.id, "0921234567");

    // Attempting to steal a transfer from a different (e.g. a victim's) Libyana number.
    await expect(createTopup(user.id, { sender_phone: "0949999999" })).rejects.toMatchObject({
      statusCode: 403,
      code: "phone_mismatch",
    });

    const rows = await db("topup_requests").where({ user_id: user.id });
    expect(rows).toHaveLength(0);
  });

  it("accepts a top-up declaring exactly the caller's own linked and verified phone", async () => {
    const { user } = await createTestUser();
    await linkPhone(user.id, "0921234567");

    const row = await createTopup(user.id, { sender_phone: "0921234567" });
    expect(row.sender_phone).toBe("0921234567");
    expect(row.status).toBe("pending");
  });

  it("rejects an Al-Madar number even if somehow declared as the sender", async () => {
    const { user } = await createTestUser();
    await linkPhone(user.id, "0921234567");

    // 091/093 are Al-Madar prefixes — normalizeLibyanaPhone rejects them outright, before
    // the ownership check even runs.
    await expect(createTopup(user.id, { sender_phone: "0911234567" })).rejects.toMatchObject({
      statusCode: 400,
      code: "invalid_phone",
    });
  });
});
