import { describe, expect, it } from "vitest";
import { escapeLikePattern, expandTerm, normalizeSearchText, tokenizeQuery } from "../../src/lib/search";

describe("normalizeSearchText", () => {
  it("folds the alef variants customers type interchangeably", () => {
    // A customer typing "العاب" must find a category stored as "ألعاب".
    expect(normalizeSearchText("ألعاب")).toBe(normalizeSearchText("العاب"));
    expect(normalizeSearchText("إشتراك")).toBe(normalizeSearchText("اشتراك"));
  });

  it("folds ta marbuta and alef maqsura", () => {
    expect(normalizeSearchText("بطاقة")).toBe(normalizeSearchText("بطاقه"));
    expect(normalizeSearchText("مصطفى")).toBe(normalizeSearchText("مصطفي"));
  });

  it("drops tashkeel", () => {
    // Supplier names occasionally arrive vocalized; the customer will never type that.
    const vocalized = `شَحْن`;
    expect(normalizeSearchText(vocalized)).toBe("شحن");
  });

  it("lowercases Latin so PUBG finds pubg", () => {
    expect(normalizeSearchText("PUBG Mobile")).toBe("pubg mobile");
  });
});

describe("escapeLikePattern", () => {
  it("neutralizes LIKE wildcards", () => {
    // Unescaped, "%" alone would match the whole catalog.
    expect(escapeLikePattern("100%")).toBe("100\\%");
    expect(escapeLikePattern("a_b")).toBe("a\\_b");
    expect(escapeLikePattern("back\\slash")).toBe("back\\\\slash");
  });
});

describe("expandTerm", () => {
  it("bridges Latin and Arabic spellings of the same brand", () => {
    // Our catalog is labelled in Arabic, but plenty of customers type the Latin name.
    expect(expandTerm("instagram")).toContain("انستغرام");
    expect(expandTerm("انستقرام")).toContain("instagram");
    expect(expandTerm("ببجي")).toContain("pubg");
  });

  it("puts the customer's own wording first", () => {
    expect(expandTerm("pubg")[0]).toBe("pubg");
  });

  it("leaves unknown words alone", () => {
    expect(expandTerm("زوهدي")).toEqual(["زوهدي"]);
  });
});

describe("tokenizeQuery", () => {
  it("splits on whitespace and drops empties", () => {
    expect(tokenizeQuery("  متابعين   عرب  ").map((group) => group[0])).toEqual(["متابعين", "عرب"]);
  });

  it("returns nothing for a query with no searchable content", () => {
    expect(tokenizeQuery("   ")).toEqual([]);
    expect(tokenizeQuery("")).toEqual([]);
  });

  it("caps the term count, so one request cannot build an unbounded query", () => {
    expect(tokenizeQuery("a b c d e f g h i j")).toHaveLength(6);
  });

  it("normalizes, expands and escapes in one pass", () => {
    const groups = tokenizeQuery("ألعاب 50%");
    expect(groups[0]).toEqual(["العاب"]);
    expect(groups[1]).toEqual(["50\\%"]);
  });
});
