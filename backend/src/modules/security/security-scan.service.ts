import { db } from "../../db/knex";
import { env } from "../../config/env";
import * as findingsRepo from "./security-findings.repository";

/**
 * A periodic internal integrity check — NOT a general-purpose vulnerability scanner (no
 * dependency scanning, no penetration testing, nothing that inspects request/response
 * traffic). What it actually does: look for a handful of specific, checkable conditions in
 * our own data that should never be true if every safeguard elsewhere in the app (wallet
 * CHECK constraints, argon2 password hashing, the session-per-user cap, ...) is working as
 * designed. Finding one of these means a real safeguard was bypassed somewhere, not a
 * theoretical risk.
 */
export async function runSecurityScan(): Promise<void> {
  await Promise.all([
    checkNegativeWalletBalances(),
    checkStaleAmbiguousOrders(),
    checkSessionCapViolations(),
    checkUnderpricedProducts(),
    checkNonArgon2PasswordHashes(),
  ]);
}

const STALE_AMBIGUOUS_HOURS = 48;

/** wallets.balance already has a DB-level CHECK (balance >= 0) — this should be
 *  structurally impossible. Checked anyway as a canary: the only way to see one is if that
 *  constraint itself was ever dropped or bypassed (e.g. a hand-run migration), which is
 *  exactly the kind of silent regression this scan exists to catch. */
async function checkNegativeWalletBalances(): Promise<void> {
  const rows = await db("wallets").where("balance", "<", 0).select("id", "user_id", "balance");
  for (const row of rows) {
    await findingsRepo.upsertOpenFinding({
      checkKey: `negative_wallet_balance:${row.id}`,
      severity: "critical",
      title: "رصيد محفظة سالب",
      description: `المحفظة ${row.id} (المستخدم ${row.user_id}) رصيدها ${row.balance} — هذا لا يجب أن يحدث أبداً؛ يعني قيداً أُدخل من مكان تجاوز الحماية المعتادة.`,
    });
  }
  await findingsRepo.autoResolveStaleFindings(
    "negative_wallet_balance",
    rows.map((r) => `negative_wallet_balance:${r.id}`)
  );
}

/** An order stuck unresolved this long is real money (already debited from a customer)
 *  sitting in limbo — a financial risk left hanging, not a hypothetical one. */
async function checkStaleAmbiguousOrders(): Promise<void> {
  const rows = await db("orders")
    .where("status", "ambiguous_error")
    .andWhere("created_at", "<", db.raw(`now() - interval '${STALE_AMBIGUOUS_HOURS} hours'`))
    .select("id", "user_id", "total_price", "created_at");
  for (const row of rows) {
    await findingsRepo.upsertOpenFinding({
      checkKey: `stale_ambiguous_order:${row.id}`,
      severity: "warning",
      title: "طلب معلّق بدون حل لأكثر من 48 ساعة",
      description: `الطلب ${row.id} (المستخدم ${row.user_id}, ${row.total_price} د.ل) بحالة "غير مؤكد" منذ ${row.created_at.toISOString()} — يحتاج قرار يدوي من لوحة الطلبات (تأكيد إتمام أو استرجاع).`,
    });
  }
  await findingsRepo.autoResolveStaleFindings(
    "stale_ambiguous_order",
    rows.map((r) => `stale_ambiguous_order:${r.id}`)
  );
}

/** Only a user actually over the cap right now is a real bypass — findAndRevokeExcess
 *  already runs on every login, so this only ever fires if something else inserted a
 *  session row outside that path. */
async function checkSessionCapViolations(): Promise<void> {
  const rows = await db("sessions")
    .whereNull("revoked_at")
    .andWhere("expires_at", ">", db.fn.now())
    .groupBy("user_id")
    .havingRaw("count(*) > ?", [env.MAX_SESSIONS_PER_USER])
    .select("user_id")
    .count<{ user_id: string; count: string }[]>("id as count");
  for (const row of rows) {
    await findingsRepo.upsertOpenFinding({
      checkKey: `session_cap_violation:${row.user_id}`,
      severity: "warning",
      title: "مستخدم تجاوز الحد الأقصى لعدد الجلسات",
      description: `المستخدم ${row.user_id} لديه ${row.count} جلسة فعّالة، أكثر من الحد المسموح (${env.MAX_SESSIONS_PER_USER}) — تحقق من طريقة إنشاء هذه الجلسات.`,
    });
  }
  await findingsRepo.autoResolveStaleFindings(
    "session_cap_violation",
    rows.map((r) => `session_cap_violation:${r.user_id}`)
  );
}

/** A product selling at or below its own cost is a real, checkable business-integrity
 *  problem (every sale loses money), not a security issue — kept in the same feed since
 *  it's the same "something that should never be true just was" shape. */
async function checkUnderpricedProducts(): Promise<void> {
  const rows = await db("products")
    .where("available", true)
    .andWhere("sell_price", "<=", db.ref("cost_price"))
    .select("id", "name", "cost_price", "sell_price");
  for (const row of rows) {
    await findingsRepo.upsertOpenFinding({
      checkKey: `underpriced_product:${row.id}`,
      severity: "warning",
      title: "منتج يُباع بسعر أقل من أو يساوي تكلفته",
      description: `"${row.name}" — سعر البيع ${row.sell_price} مقابل تكلفة ${row.cost_price}. راجع السعر يدوياً من لوحة الكتالوج.`,
    });
  }
  await findingsRepo.autoResolveStaleFindings(
    "underpriced_product",
    rows.map((r) => `underpriced_product:${r.id}`)
  );
}

/** "deleted" is the intentional, unusable sentinel account-deletion writes (see
 *  auth.repository.ts) — excluded on purpose, not a hash format. Anything else that isn't
 *  a real argon2id hash means a password was somehow persisted outside the normal
 *  argon2.hash() path. */
async function checkNonArgon2PasswordHashes(): Promise<void> {
  const rows = await db("users")
    .whereNot("password_hash", "like", "$argon2id$%")
    .andWhereNot("password_hash", "deleted")
    .select("id");
  for (const row of rows) {
    await findingsRepo.upsertOpenFinding({
      checkKey: `non_argon2_password_hash:${row.id}`,
      severity: "critical",
      title: "كلمة مرور مخزّنة بصيغة غير متوقعة",
      description: `المستخدم ${row.id} — قيمة password_hash ليست argon2id ولا القيمة الخاصة بحساب محذوف. راجع فوراً.`,
    });
  }
  await findingsRepo.autoResolveStaleFindings(
    "non_argon2_password_hash",
    rows.map((r) => `non_argon2_password_hash:${r.id}`)
  );
}
