/**
 * Connectivity/credentials smoke check against the real Plus SMM panel API. Run after
 * setting PLUS_API_KEY in .env:
 *
 *   npm run check:plus
 *
 * Read-only: balance and the first few services. Never calls addOrder().
 */
import { createPlusClientFromEnv, PlusApiError } from "../adapters/smm/plus.client";

async function main() {
  const client = createPlusClientFromEnv();

  try {
    const balance = await client.getBalance();
    console.log(`✅ Connected to Plus API — balance: ${balance.balanceFormatted} (user_id: ${balance.userId})`);

    const services = await client.getServices();
    console.log(`✅ Fetched ${services.length} services. First 5:`);
    for (const s of services.slice(0, 5)) {
      console.log(`   - [${s.serviceId}] ${s.name}: $${s.pricePer1000Usd}/1000 (min ${s.min}, max ${s.max})`);
    }
  } catch (err) {
    if (err instanceof PlusApiError) {
      console.error(`❌ Plus API returned ${err.status}:`, err.body);
    } else {
      console.error("❌ Failed to reach Plus API:", err);
    }
    process.exitCode = 1;
  }
}

main();
