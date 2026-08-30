import type { Knex } from "knex";

export async function up(knex: Knex): Promise<void> {
  await knex.raw(`
    CREATE TABLE orders (
      id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
      user_id uuid NOT NULL REFERENCES users(id) ON DELETE RESTRICT,
      product_id uuid NOT NULL REFERENCES products(id) ON DELETE RESTRICT,
      kind text NOT NULL CHECK (kind IN ('giftcard', 'smm')),
      quantity int NOT NULL CHECK (quantity > 0),
      -- SMM: the URL/username to deliver to. Null for giftcard (Libya Play's pay
      -- endpoint takes no such parameter for the product types we sync — see
      -- giftcard-supplier.interface.ts for the one documented undocumented edge case).
      target_link text,
      unit_price NUMERIC(14,4) NOT NULL,
      total_price NUMERIC(14,4) NOT NULL,
      status text NOT NULL DEFAULT 'pending'
        CHECK (status IN ('pending', 'processing', 'completed', 'failed', 'ambiguous_error', 'refunded')),
      wallet_debit_transaction_id uuid REFERENCES wallet_transactions(id) ON DELETE SET NULL,
      wallet_refund_transaction_id uuid REFERENCES wallet_transactions(id) ON DELETE SET NULL,
      -- Libya Play: none (no order id on their side, purchase is synchronous — see
      -- supplier_response.cardCode instead). Plus: their order_number.
      supplier_order_ref text,
      -- Giftcard: { cardCode, serialNumber, expiresAt }. SMM: last known status snapshot.
      supplier_response jsonb,
      error_message text,
      created_at timestamptz NOT NULL DEFAULT now(),
      updated_at timestamptz NOT NULL DEFAULT now()
    )
  `);
  await knex.raw("CREATE INDEX idx_orders_user_created ON orders (user_id, created_at)");
  await knex.raw("CREATE INDEX idx_orders_status ON orders (status, created_at)");
}

export async function down(knex: Knex): Promise<void> {
  await knex.raw("DROP TABLE IF EXISTS orders");
}
