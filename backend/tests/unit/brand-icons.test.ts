import { describe, expect, it } from "vitest";
import { matchBrandIcon } from "../../src/modules/catalog/brand-icons";

describe("matchBrandIcon", () => {
  it("matches known brands by Arabic keyword", () => {
    expect(matchBrandIcon("بطاقات نتفلكس")).toBe("https://cdn.simpleicons.org/netflix/E50914");
    expect(matchBrandIcon("بلايستيشن")).toBe("https://cdn.simpleicons.org/playstation/0070D1");
    expect(matchBrandIcon("بينايس USDT")).toBe("https://cdn.simpleicons.org/tether/26A17B");
  });

  it("matches the expanded batch of brands added for the image-coverage pass", () => {
    expect(matchBrandIcon("بطاقة جوجل بلاي")).toBe("https://cdn.simpleicons.org/googleplay/01875F");
    expect(matchBrandIcon("اشتراك سبوتيفاي")).toBe("https://cdn.simpleicons.org/spotify/1DB954");
    expect(matchBrandIcon("شحن ببجي")).toBe("https://cdn.simpleicons.org/pubg/F2A900");
    expect(matchBrandIcon("فورتنايت")).toBe("https://cdn.simpleicons.org/fortnite/000000");
    expect(matchBrandIcon("ريوت بوينتس")).toBe("https://cdn.simpleicons.org/leagueoflegends/C28F2C");
  });

  it("matches the digital-goods/subscription batch added after the blank-icons complaint", () => {
    expect(matchBrandIcon("اشتراك تيك توك")).toBe("https://cdn.simpleicons.org/tiktok/000000");
    expect(matchBrandIcon("نيترو ديسكورد")).toBe("https://cdn.simpleicons.org/discord/5865F2");
    expect(matchBrandIcon("اشتراك نورد في بي ان")).toBe("https://cdn.simpleicons.org/nordvpn/4687FF");
    expect(matchBrandIcon("كانفا برو")).toBe("https://cdn.simpleicons.org/canva/00C4CC");
    expect(matchBrandIcon("اشتراك يوديمي")).toBe("https://cdn.simpleicons.org/udemy/A435F0");
  });

  it("matches English/Latin-script brand names, case-insensitively", () => {
    // Regression: a real customer report — the "Xbox" category showed no logo at all
    // because Libya Play sent it in Latin script, and the keyword list was Arabic-only.
    expect(matchBrandIcon("Xbox")).toBe("https://cdn.simpleicons.org/xbox/107C10");
    expect(matchBrandIcon("XBOX Game Pass")).toBe("https://cdn.simpleicons.org/xbox/107C10");
    expect(matchBrandIcon("PlayStation Store")).toBe("https://cdn.simpleicons.org/playstation/0070D1");
    expect(matchBrandIcon("Steam Wallet")).toBe("https://cdn.simpleicons.org/steam/1B2838");
  });

  it("does not let the broad iTunes/Apple entry shadow the more specific Apple Music one", () => {
    expect(matchBrandIcon("Apple Music")).toBe("https://cdn.simpleicons.org/applemusic/FA243C");
    expect(matchBrandIcon("iTunes")).toBe("https://cdn.simpleicons.org/itunes/FB5BC5");
  });

  it("returns null for unrecognized or regional names rather than guessing", () => {
    expect(matchBrandIcon("مملكة الصحراء")).toBeNull();
    expect(matchBrandIcon("بطاقات الألعاب")).toBeNull();
    expect(matchBrandIcon("قبائل 84")).toBeNull();
  });
});
