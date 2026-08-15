/**
 * Plus's service list has no category structure (unlike Libya Play) — just a flat list of
 * ~180 services with everything encoded in the Arabic name ("متابعين تيك توك...",
 * "لايكات إنستجرام..."). This heuristically groups them into store-facing platform
 * categories by keyword match. Not exact — a service with an ambiguous or unrecognized
 * name lands in "other" rather than being mis-filed under the wrong platform.
 *
 * Images: Simple Icons CDN (brand logos, no auth/API key needed) — Plus provides no
 * per-service images of its own (see plus.client.ts), unlike Libya Play which does.
 */
interface PlatformDef {
  key: string;
  label: string;
  slug: string;
  color: string;
  keywords: string[];
}

const PLATFORMS: PlatformDef[] = [
  { key: "instagram", label: "إنستغرام", slug: "instagram", color: "E4405F", keywords: ["انستا", "إنستا", "إنستغرام", "إنستجرام", "انستقرام", "إنستقرام"] },
  { key: "tiktok", label: "تيك توك", slug: "tiktok", color: "000000", keywords: ["تيك توك", "تيكتوك"] },
  { key: "facebook", label: "فيسبوك", slug: "facebook", color: "1877F2", keywords: ["فيسبوك"] },
  { key: "telegram", label: "تيليجرام", slug: "telegram", color: "26A5E4", keywords: ["تيليجرام", "تيلجرام", "تليجرام"] },
  { key: "whatsapp", label: "واتساب", slug: "whatsapp", color: "25D366", keywords: ["واتساب", "واتس"] },
  { key: "youtube", label: "يوتيوب", slug: "youtube", color: "FF0000", keywords: ["يوتيوب"] },
  { key: "twitter", label: "تويتر (X)", slug: "x", color: "000000", keywords: ["تويتر"] },
];

export interface PlusCategoryMatch {
  key: string;
  label: string;
  image: string | null;
}

export function categorizePlusService(serviceName: string): PlusCategoryMatch {
  for (const platform of PLATFORMS) {
    if (platform.keywords.some((kw) => serviceName.includes(kw))) {
      return { key: platform.key, label: platform.label, image: `https://cdn.simpleicons.org/${platform.slug}/${platform.color}` };
    }
  }
  return { key: "other", label: "خدمات أخرى", image: null };
}
