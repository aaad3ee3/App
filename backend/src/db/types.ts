export interface UserRow {
  id: string;
  /** Primary identity. Nullable only for rows created before phone auth shipped. */
  phone: string | null;
  phone_verified_at: Date | null;
  /** Optional since phone became the identity — many customers have no email. */
  email: string | null;
  password_hash: string;
  full_name: string | null;
  is_admin: boolean;
  status: "active" | "disabled";
  failed_login_attempts: number;
  locked_until: Date | null;
  /** Lazily backfilled on first use — see referral.repository.ts `getOrCreateReferralCode`. */
  referral_code: string | null;
  referred_by: string | null;
  referral_bonus_credited_at: Date | null;
  last_reengagement_push_at: Date | null;
  created_at: Date;
  updated_at: Date;
}

export interface SessionRow {
  id: string;
  user_id: string;
  token_hash: string;
  user_agent: string | null;
  ip_address: string | null;
  created_at: Date;
  expires_at: Date;
  revoked_at: Date | null;
}

export interface WalletRow {
  id: string;
  user_id: string;
  balance: string; // NUMERIC comes back as string from pg
  currency: string;
  created_at: Date;
  updated_at: Date;
}

export type WalletTxType = "topup_credit" | "order_debit" | "admin_adjustment" | "refund" | "referral_bonus";
export type WalletTxReferenceType = "topup_request" | "order" | "manual";

export interface WalletTransactionRow {
  id: string;
  wallet_id: string;
  user_id: string;
  type: WalletTxType;
  amount: string;
  balance_after: string;
  reference_type: WalletTxReferenceType;
  reference_id: string | null;
  idempotency_key: string;
  created_by: string | null;
  note: string | null;
  created_at: Date;
}

export type TopupStatus = "pending" | "matched" | "credited" | "expired" | "cancelled" | "manual_review";

export interface TopupRequestRow {
  id: string;
  user_id: string;
  sender_phone: string;
  requested_amount: string;
  status: TopupStatus;
  matched_sms_event_id: string | null;
  credited_wallet_transaction_id: string | null;
  expires_at: Date;
  created_at: Date;
  updated_at: Date;
}

export type SmsMatchStatus =
  | "unmatched"
  | "matched"
  | "ambiguous"
  | "ignored_untrusted_sender"
  | "ignored_no_match"
  | "manually_resolved";

export interface SmsEventRow {
  id: string;
  delivery_dedupe_key: string;
  raw_payload: unknown;
  raw_text: string;
  reported_sender: string | null;
  sender_trusted: boolean;
  parsed_ok: boolean;
  parsed_amount: string | null;
  parsed_sender_phone: string | null;
  match_status: SmsMatchStatus;
  matched_topup_request_id: string | null;
  received_at: Date;
  processed_at: Date | null;
  resolved_by: string | null;
  resolution_note: string | null;
}

export interface AdminActionRow {
  id: string;
  admin_user_id: string;
  action: string;
  target_type: "sms_event" | "topup_request" | "wallet" | "order" | "product";
  target_id: string;
  details: unknown;
  created_at: Date;
}

export type ProductKind = "giftcard" | "smm";
export type Supplier = "libya_play" | "plus";

export interface CategoryRow {
  id: string;
  kind: ProductKind;
  supplier: Supplier;
  supplier_category_ref: string | null;
  name: string;
  image: string | null;
  sort_order: number;
  enabled: boolean;
  created_at: Date;
  updated_at: Date;
}

export interface ProductRow {
  id: string;
  category_id: string;
  kind: ProductKind;
  supplier: Supplier;
  supplier_product_ref: string;
  supplier_sub_category_ref: string | null;
  name: string;
  description: string | null;
  image: string | null;
  cost_price: string;
  sell_price: string;
  currency: string;
  price_per_1000: boolean;
  min_quantity: number | null;
  max_quantity: number | null;
  available: boolean;
  created_at: Date;
  updated_at: Date;
}

export type OrderStatus = "pending" | "processing" | "completed" | "failed" | "ambiguous_error" | "refunded";

export interface OrderRow {
  id: string;
  user_id: string;
  product_id: string;
  kind: ProductKind;
  quantity: number;
  target_link: string | null;
  unit_price: string;
  total_price: string;
  status: OrderStatus;
  wallet_debit_transaction_id: string | null;
  wallet_refund_transaction_id: string | null;
  supplier_order_ref: string | null;
  supplier_response: unknown;
  error_message: string | null;
  created_at: Date;
  updated_at: Date;
}

export interface FavoriteRow {
  id: string;
  user_id: string;
  product_id: string;
  created_at: Date;
}

export type CouponDiscountType = "percent" | "fixed";

export interface CouponRow {
  id: string;
  code: string;
  discount_type: CouponDiscountType;
  discount_value: string;
  min_order_amount: string;
  max_uses: number | null;
  used_count: number;
  max_uses_per_user: number;
  enabled: boolean;
  expires_at: Date | null;
  created_at: Date;
  updated_at: Date;
}

export interface CouponRedemptionRow {
  id: string;
  coupon_id: string;
  user_id: string;
  order_id: string;
  discount_amount: string;
  created_at: Date;
}
