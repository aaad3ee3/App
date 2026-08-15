export interface UserRow {
  id: string;
  email: string;
  password_hash: string;
  full_name: string | null;
  is_admin: boolean;
  status: "active" | "disabled";
  failed_login_attempts: number;
  locked_until: Date | null;
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

export type WalletTxType = "topup_credit" | "order_debit" | "admin_adjustment" | "refund";
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
  target_type: "sms_event" | "topup_request" | "wallet";
  target_id: string;
  details: unknown;
  created_at: Date;
}
