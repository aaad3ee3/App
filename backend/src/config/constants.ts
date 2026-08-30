export const MONEY_SCALE = 3; // LYD smallest subunit (millieme) — NUMERIC(14,3) columns

export const DEFAULT_CURRENCY = "LYD";

export const WALLET_TX_TYPES = {
  TOPUP_CREDIT: "topup_credit",
  ORDER_DEBIT: "order_debit",
  ADMIN_ADJUSTMENT: "admin_adjustment",
  REFUND: "refund",
  REFERRAL_BONUS: "referral_bonus",
} as const;

export const WALLET_TX_REFERENCE_TYPES = {
  TOPUP_REQUEST: "topup_request",
  ORDER: "order",
  MANUAL: "manual",
  BINANCE_TOPUP: "binance_topup",
} as const;

export const TOPUP_STATUS = {
  PENDING: "pending",
  MATCHED: "matched",
  CREDITED: "credited",
  EXPIRED: "expired",
  CANCELLED: "cancelled",
  MANUAL_REVIEW: "manual_review",
} as const;

export const SMS_MATCH_STATUS = {
  UNMATCHED: "unmatched",
  MATCHED: "matched",
  AMBIGUOUS: "ambiguous",
  IGNORED_UNTRUSTED_SENDER: "ignored_untrusted_sender",
  IGNORED_NO_MATCH: "ignored_no_match",
  MANUALLY_RESOLVED: "manually_resolved",
} as const;

export const USER_STATUS = {
  ACTIVE: "active",
  DISABLED: "disabled",
} as const;

export const PRODUCT_KIND = {
  GIFTCARD: "giftcard",
  SMM: "smm",
  /** Libya Play's /social/* flow — live-app top-ups (Azal Live, Party Star, imo, ...). */
  SOCIAL_TOPUP: "social_topup",
} as const;

export const SUPPLIER = {
  LIBYA_PLAY: "libya_play",
  PLUS: "plus",
} as const;

export const ORDER_STATUS = {
  PENDING: "pending",
  PROCESSING: "processing",
  COMPLETED: "completed",
  FAILED: "failed",
  /** Supplier call's outcome is unknown (network failure, no response) — never auto-refunded, needs admin. */
  AMBIGUOUS_ERROR: "ambiguous_error",
  REFUNDED: "refunded",
} as const;
