/**
 * Ported from the old LibyanaPay prototype (`db.py`'s `LIBYANA_SMS_PATTERN`) — this is the
 * one piece of that codebase worth keeping. Group 1 = LYD amount, group 2 = the payer's
 * phone number (the SMS reads "transferred from number Y", where Y is exactly the phone
 * we match against topup_requests.sender_phone).
 */
const LIBYANA_SMS_PATTERN =
  /تم\s*تحويل\s*([\d.,]+)\s*دينار\s*من\s*الرقم\s*(\d+)\s*إلى\s*رصيدك\s*بنجاح/;

export interface ParsedLibyanaSms {
  amount: number;
  senderPhoneRaw: string;
}

export function parseLibyanaSms(text: string): ParsedLibyanaSms | null {
  if (!text) return null;
  const match = LIBYANA_SMS_PATTERN.exec(text);
  if (!match || !match[1] || !match[2]) return null;

  const amount = Number(match[1].replace(/,/g, ""));
  if (!Number.isFinite(amount) || amount <= 0) return null;

  return { amount, senderPhoneRaw: match[2] };
}

export function isTrustedSender(reportedSender: string | null | undefined, trustedSenders: string[]): boolean {
  if (!reportedSender) return false;
  return trustedSenders.includes(reportedSender.trim().toLowerCase());
}
