import { MONEY_SCALE } from "../config/constants";

/**
 * All money in this service is LYD, stored as NUMERIC(14,3) and returned by `pg` as strings.
 * These helpers keep arithmetic in integer "millieme" space to avoid floating-point drift.
 */

const SCALE_FACTOR = 10 ** MONEY_SCALE;

export function toMillieme(amount: string | number): number {
  const n = typeof amount === "string" ? Number(amount) : amount;
  if (!Number.isFinite(n)) {
    throw new Error(`Invalid money amount: ${amount}`);
  }
  return Math.round(n * SCALE_FACTOR);
}

export function fromMillieme(millieme: number): string {
  return (millieme / SCALE_FACTOR).toFixed(MONEY_SCALE);
}

export function formatMoney(amount: string | number): string {
  return fromMillieme(toMillieme(amount));
}

export function isWithinTolerance(a: string | number, b: string | number, toleranceLyd: number): boolean {
  const diffMillieme = Math.abs(toMillieme(a) - toMillieme(b));
  return diffMillieme <= toMillieme(toleranceLyd);
}

export function isPositive(amount: string | number): boolean {
  return toMillieme(amount) > 0;
}
