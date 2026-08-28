import { LibyaPlayAdapter } from "../adapters/giftcards/libyaplay.adapter";
import { PlusAdapter } from "../adapters/smm/plus.adapter";
import { syncLibyaPlay, syncPlus } from "../modules/catalog/catalog-sync.service";

/**
 * Keeps the catalog current without an admin having to remember to press "مزامنة من
 * الموردين" — a new product either supplier starts listing appears within a few hours
 * instead of whenever someone next opens the dashboard, and one they stop listing drops
 * out of the store on the same schedule (see markStaleProductsUnavailable, already called
 * by both sync functions below).
 *
 * The two suppliers are synced independently and each swallows its own failure: Libya
 * Play being unconfigured, down, or rate-limiting must never stop Plus from syncing (or
 * vice versa), and neither may ever crash the server process a purchase could be in the
 * middle of.
 */
export async function runAutoCatalogSync(): Promise<void> {
  try {
    const result = await syncLibyaPlay(new LibyaPlayAdapter());
    // eslint-disable-next-line no-console
    console.info(
      `[auto-catalog-sync] Libya Play: ${result.categories} categories, ${result.products} products, ${result.removed} removed`
    );
  } catch (err) {
    // eslint-disable-next-line no-console
    console.error("[auto-catalog-sync] Libya Play sync failed:", err instanceof Error ? err.message : err);
  }

  try {
    const result = await syncPlus(new PlusAdapter());
    // eslint-disable-next-line no-console
    console.info(
      `[auto-catalog-sync] Plus: ${result.categories} categories, ${result.products} products, ${result.removed} removed`
    );
  } catch (err) {
    // eslint-disable-next-line no-console
    console.error("[auto-catalog-sync] Plus sync failed:", err instanceof Error ? err.message : err);
  }
}

export function startAutoCatalogSyncJob(intervalMs: number): NodeJS.Timeout {
  return setInterval(() => {
    runAutoCatalogSync().catch((err) => {
      // Unreachable in practice — runAutoCatalogSync catches both suppliers internally —
      // kept only so a future refactor that removes one of those catches fails loud in
      // logs instead of silently killing the interval.
      // eslint-disable-next-line no-console
      console.error("[auto-catalog-sync.job] unexpected top-level failure:", err);
    });
  }, intervalMs);
}
