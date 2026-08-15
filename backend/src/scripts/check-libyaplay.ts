/**
 * Connectivity/credentials smoke check against the real Libya Play API. Run after
 * setting LIBYA_PLAY_API_KEY and LIBYA_PLAY_EMAIL in .env:
 *
 *   npm run check:libyaplay
 */
import { LibyaPlayAdapter } from "../adapters/giftcards/libyaplay.adapter";
import { LibyaPlayApiError } from "../adapters/giftcards/libyaplay.client";

async function main() {
  const adapter = new LibyaPlayAdapter();
  try {
    const info = await adapter.getAppInfo();
    console.log("✅ Connected to Libya Play API:");
    console.log(info);
    if (info.maintenance) {
      console.warn("⚠️  Libya Play reports maintenance mode is ON (maintenance=1).");
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
