import { describe, expect, it } from "vitest";
import { matchBrandIcon } from "../../src/modules/catalog/brand-icons";

describe("matchBrandIcon", () => {
  it("matches known brands by Arabic keyword", () => {
    expect(matchBrandIcon("بطاقات نتفلكس")).toBe("https://cdn.simpleicons.org/netflix/E50914");
    expect(matchBrandIcon("بلايستيشن")).toBe("https://cdn.simpleicons.org/playstation/0070D1");
    expect(matchBrandIcon("بينايس USDT")).toBe("https://cdn.simpleicons.org/tether/26A17B");
  });

  it("returns null for unrecognized or regional names rather than guessing", () => {
    expect(matchBrandIcon("مملكة الصحراء")).toBeNull();
    expect(matchBrandIcon("بطاقات الألعاب")).toBeNull();
    expect(matchBrandIcon("قبائل 84")).toBeNull();
  });
});
