/**
 * Connectivity/credentials smoke check against the real Libya Play API. Run after
 * setting LIBYA_PLAY_API_KEY and LIBYA_PLAY_EMAIL in .env:
 *
 *   npm run check:libyaplay
 *
 * Read-only: app-info, profile (includes your Libya Play wallet balance), and a walk
 * through the first category -> first sub-category -> its products. Never calls pay().
 */
import { LibyaPlayAdapter } from "../adapters/giftcards/libyaplay.adapter";
import { createLibyaPlayClientFromEnv, LibyaPlayApiError } from "../adapters/giftcards/libyaplay.client";

async function main() {
  const adapter = new LibyaPlayAdapter();
  const client = createLibyaPlayClientFromEnv();

  try {
    const info = await client.getAppInfo();
    console.log("✅ Connected to Libya Play API:", info);
    if (info.maintenance) {
      console.warn("⚠️  Libya Play reports maintenance mode is ON (maintenance=1).");
    }

    const profile = await client.getProfile();
    console.log(`✅ Reseller profile: ${profile.name} <${profile.email}> — Libya Play wallet: ${profile.wallet} ${profile.currency_code}`);

    const categories = await adapter.listCategories();
    console.log(`✅ Fetched ${categories.length} categories.`);
    const firstCategory = categories[0];
    if (!firstCategory) return;

    const subCategories = await adapter.listSubCategories(firstCategory.id);
    console.log(`✅ Category "${firstCategory.name}" has ${subCategories.length} sub-categories.`);
    const firstSubCategory = subCategories[0];
    if (!firstSubCategory) return;

    const products = await adapter.listProducts(firstSubCategory.id);
    console.log(`✅ Sub-category "${firstSubCategory.name}" has ${products.length} direct-pay ("digt") products.`);
    for (const p of products.slice(0, 5)) {
      console.log(`   - ${p.name}: ${p.price} ${p.currency} (${p.available ? "available" : "unavailable"})`);
    }
  } catch (err) {
    if (err instanceof LibyaPlayApiError) {
      console.error(`❌ Libya Play API returned ${err.status}:`, err.body);
    } else {
      console.error("❌ Failed to reach Libya Play API:", err);
    }
    process.exitCode = 1;
  }
}

main();
