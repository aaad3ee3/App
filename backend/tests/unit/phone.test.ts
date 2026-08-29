import { describe, expect, it } from "vitest";
import { isLibyanaNumber, normalizeLibyanPhone, normalizeLibyanaPhone, toInternationalLibyanPhone } from "../../src/lib/phone";

/**
 * The carrier split is the kind of fact that is easy to get backwards and impossible to
 * spot by reading the code — nothing about `092` looks more Libyana than `091`. These
 * tests pin it down explicitly:
 *
 *   Libyana  → 092, 094   (accepted: can fund a wallet and receive our codes)
 *   Al-Madar → 091, 093   (rejected: can do neither)
 */
describe("normalizeLibyanPhone", () => {
  it("normalizes every format a customer or gateway might produce", () => {
    for (const input of ["0921234567", "+218921234567", "00218921234567", "218921234567", "092 123 4567", "092-123-4567"]) {
      expect(normalizeLibyanPhone(input), input).toBe("0921234567");
    }
  });

  it("stays carrier-agnostic, since it also parses numbers out of incoming SMS", () => {
    expect(normalizeLibyanPhone("0911234567")).toBe("0911234567");
    expect(normalizeLibyanPhone("0931234567")).toBe("0931234567");
  });

  it("rejects anything that is not a Libyan mobile number", () => {
    for (const bad of ["", "123", "0812345678", "abcdefghij", "09212345", "09212345678"]) {
      expect(normalizeLibyanPhone(bad), bad).toBeNull();
    }
  });
});

describe("Libyana vs Al-Madar", () => {
  it("treats 092 and 094 as Libyana", () => {
    expect(isLibyanaNumber("0921234567")).toBe(true);
    expect(isLibyanaNumber("0941234567")).toBe(true);
  });

  it("treats 091 and 093 as Al-Madar", () => {
    expect(isLibyanaNumber("0911234567")).toBe(false);
    expect(isLibyanaNumber("0931234567")).toBe(false);
  });
});

describe("normalizeLibyanaPhone", () => {
  it("accepts Libyana numbers in any format", () => {
    expect(normalizeLibyanaPhone("0921234567")).toBe("0921234567");
    expect(normalizeLibyanaPhone("+218941234567")).toBe("0941234567");
    expect(normalizeLibyanaPhone("00218 92 123 4567")).toBe("0921234567");
  });

  it("rejects Al-Madar numbers", () => {
    // Not a preference: an Al-Madar number can neither fund a wallet through the Libyana
    // transfer flow nor receive our verification codes, so an account on one could never
    // be topped up or recovered.
    for (const madar of ["0911234567", "0931234567", "+218911234567", "00218931234567"]) {
      expect(normalizeLibyanaPhone(madar), madar).toBeNull();
    }
  });
});

describe("toInternationalLibyanPhone", () => {
  it("converts the local form to country-code form with no leading zero", () => {
    // Regression: Resala's /pins expects exactly this shape (e.g. "218921234567") — the
    // local form doesn't error, it just silently never reaches a real handset.
    expect(toInternationalLibyanPhone("0921234567")).toBe("218921234567");
    expect(toInternationalLibyanPhone("0941234567")).toBe("218941234567");
  });

  it("rejects anything that isn't already a normalized local number", () => {
    for (const bad of ["", "921234567", "+218921234567", "218921234567", "092123456", "09212345678"]) {
      expect(toInternationalLibyanPhone(bad), bad).toBeNull();
    }
  });
});
