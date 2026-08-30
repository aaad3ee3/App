import { describe, expect, it } from "vitest";
import { categorizePlusService } from "../../src/modules/catalog/plus-categorization";

describe("categorizePlusService", () => {
  it("matches the platforms already covered before this batch", () => {
    expect(categorizePlusService("متابعين انستقرام حقيقيين").key).toBe("instagram");
    expect(categorizePlusService("لايكات تيك توك").key).toBe("tiktok");
  });

  it("matches the platforms added for the الرشق re-classification pass", () => {
    expect(categorizePlusService("أعضاء سيرفر ديسكورد").key).toBe("discord");
    expect(categorizePlusService("متابعين سناب شات").key).toBe("snapchat");
    expect(categorizePlusService("متابعين بينترست").key).toBe("pinterest");
    expect(categorizePlusService("متابعين لينكد ان").key).toBe("linkedin");
    expect(categorizePlusService("متابعين تويتش").key).toBe("twitch");
    expect(categorizePlusService("متابعين ثريدز").key).toBe("threads");
  });

  it("falls back to 'other' with no image for an unrecognized service, rather than guessing", () => {
    const result = categorizePlusService("خدمة غريبة غير معروفة");
    expect(result.key).toBe("other");
    expect(result.image).toBeNull();
  });
});
