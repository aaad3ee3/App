import { db } from "../src/db/knex";
import { DEFAULT_CURRENCY, WALLET_TX_REFERENCE_TYPES, WALLET_TX_TYPES } from "../src/config/constants";
import * as walletRepo from "../src/modules/wallet/wallet.repository";
import type { CategoryRow, ProductKind, ProductRow, Supplier, UserRow, WalletRow } from "../src/db/types";

export async function resetDb(): Promise<void> {
  await db.raw(
    `TRUNCATE TABLE admin_actions, orders, products, categories, wallet_transactions, sms_events, topup_requests, sessions, wallets, users RESTART IDENTITY CASCADE`
  );
}

let userCounter = 0;

export async function createTestUser(overrides: Partial<Pick<UserRow, "email" | "is_admin">> = {}): Promise<{
  user: UserRow;
  wallet: WalletRow;
}> {
  userCounter += 1;
  const email = overrides.email ?? `test-user-${userCounter}@example.com`;

  const [user] = await db<UserRow>("users")
    .insert({
      email,
      password_hash: "not-a-real-hash",
      is_admin: overrides.is_admin ?? false,
    })
    .returning("*");
  if (!user) throw new Error("failed to insert test user");

  const [wallet] = await db<WalletRow>("wallets")
    .insert({ user_id: user.id, balance: 0, currency: DEFAULT_CURRENCY })
    .returning("*");
  if (!wallet) throw new Error("failed to insert test wallet");

  return { user, wallet };
}

export async function createPendingTopup(input: {
  userId: string;
  senderPhone: string;
  requestedAmount: number;
  expiresInMinutes?: number;
}) {
  const [topup] = await db("topup_requests")
    .insert({
      user_id: input.userId,
      sender_phone: input.senderPhone,
      requested_amount: input.requestedAmount,
      status: "pending",
      expires_at: new Date(Date.now() + (input.expiresInMinutes ?? 120) * 60_000),
    })
    .returning("*");
  return topup;
}

export function libyanaSmsText(amount: number, senderPhone: string): string {
  return `تم تحويل ${amount} دينار من الرقم ${senderPhone} إلى رصيدك بنجاح`;
}

export async function creditTestWallet(userId: string, walletId: string, amount: number): Promise<void> {
  await db.transaction(async (trx) => {
    await walletRepo.creditWallet(trx, {
      userId,
      walletId,
      amount,
      type: WALLET_TX_TYPES.ADMIN_ADJUSTMENT,
      referenceType: WALLET_TX_REFERENCE_TYPES.MANUAL,
      referenceId: null,
      idempotencyKey: `test-credit:${userId}:${Date.now()}:${Math.random()}`,
      createdBy: null,
      note: "test fixture credit",
    });
  });
}

export async function createTestCategory(overrides: Partial<{ kind: ProductKind; supplier: Supplier; name: string }> = {}): Promise<CategoryRow> {
  const [category] = await db<CategoryRow>("categories")
    .insert({
      kind: overrides.kind ?? "giftcard",
      supplier: overrides.supplier ?? "libya_play",
      supplier_category_ref: `test-cat-${Date.now()}-${Math.random()}`,
      name: overrides.name ?? "Test Category",
      image: null,
    })
    .returning("*");
  if (!category) throw new Error("failed to insert test category");
  return category;
}

export async function createTestProduct(
  categoryId: string,
  overrides: Partial<{
    kind: ProductKind;
    supplier: Supplier;
    name: string;
    sellPrice: number;
    pricePer1000: boolean;
    minQuantity: number | null;
    maxQuantity: number | null;
    available: boolean;
    supplierProductRef: string;
  }> = {}
): Promise<ProductRow> {
  const [product] = await db<ProductRow>("products")
    .insert({
      category_id: categoryId,
      kind: overrides.kind ?? "giftcard",
      supplier: overrides.supplier ?? "libya_play",
      supplier_product_ref: overrides.supplierProductRef ?? `test-prod-${Date.now()}-${Math.random()}`,
      name: overrides.name ?? "Test Product",
      cost_price: (overrides.sellPrice ?? 10) * 0.8,
      sell_price: overrides.sellPrice ?? 10,
      currency: "LYD",
      price_per_1000: overrides.pricePer1000 ?? false,
      min_quantity: overrides.minQuantity ?? null,
      max_quantity: overrides.maxQuantity ?? null,
      available: overrides.available ?? true,
    })
    .returning("*");
  if (!product) throw new Error("failed to insert test product");
  return product;
}
