import { describe, expect, it, vi } from "vitest";
import { runAutoCatalogSync } from "../../src/jobs/auto-catalog-sync.job";

/**
 * Both suppliers are unconfigured in the test environment (no LIBYA_PLAY_API_KEY /
 * PLUS_API_KEY), so this is really testing the one thing that matters for a background
 * job: a misconfigured/unreachable supplier must never throw out of the job or take the
 * other supplier down with it.
 */
describe("runAutoCatalogSync", () => {
  it("never throws, even when both suppliers are unconfigured", async () => {
    const errorSpy = vi.spyOn(console, "error").mockImplementation(() => {});
    await expect(runAutoCatalogSync()).resolves.toBeUndefined();
    expect(errorSpy).toHaveBeenCalled(); // both failures were logged, not swallowed silently
    errorSpy.mockRestore();
  });
});
