import { HttpError } from "../../plugins/error-handler.plugin";
import * as repo from "./wallet.repository";

export async function getMyWallet(userId: string) {
  const wallet = await repo.getWalletByUserId(userId);
  if (!wallet) throw new HttpError(404, "not_found", "Wallet not found");
  return { balance: wallet.balance, currency: wallet.currency };
}

export async function listMyTransactions(userId: string, page: number, pageSize: number) {
  const limit = Math.min(Math.max(pageSize, 1), 100);
  const offset = (Math.max(page, 1) - 1) * limit;
  const { items, total } = await repo.listTransactions(userId, { limit, offset });
  return {
    items: items.map((t) => ({
      id: t.id,
      type: t.type,
      amount: t.amount,
      balance_after: t.balance_after,
      reference_type: t.reference_type,
      reference_id: t.reference_id,
      note: t.note,
      created_at: t.created_at,
    })),
    page,
    page_size: limit,
    total,
  };
}
