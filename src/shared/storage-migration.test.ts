import { beforeEach, describe, expect, it, vi } from "vitest";

const { stores, storage } = vi.hoisted(() => {
  const stores: Record<"sync" | "local", Record<string, unknown>> = { sync: {}, local: {} };
  const makeArea = (area: "sync" | "local") => ({
    get: vi.fn(async () => ({ ...stores[area] })),
    set: vi.fn(async (values: Record<string, unknown>) => { Object.assign(stores[area], values); }),
  });
  return { stores, storage: { sync: makeArea("sync"), local: makeArea("local") } };
});
vi.mock("wxt/browser", () => ({ browser: { storage } }));

beforeEach(() => {
  vi.resetModules();
  vi.clearAllMocks();
  stores.sync = {};
  stores.local = {};
});

describe("Refrão storage migration", () => {
  it("preserves the previous appearance preferences", async () => {
    stores.sync.lyricsTySettings = { fontSize: 40, bounds: { width: 500 } };
    const { migrateStorage } = await import("./storage-migration");
    await migrateStorage("sync");
    expect(stores.sync.refraoSettings).toEqual(stores.sync.lyricsTySettings);
    expect(stores.sync.refraoStorageMigratedV1).toBe(true);
  });

  it("preserves cached lyrics, manual choices and per-video timing", async () => {
    Object.assign(stores.local, {
      "lyricsTyCache:v4:video": { record: { id: 123 }, expiresAt: 10 },
      "lyricsTyMapping:video": 123,
      "lyricsTyOffset:v1:video": -2_000,
      unrelated: "keep",
    });
    const { migrateStorage } = await import("./storage-migration");
    await migrateStorage("local");
    expect(stores.local["refraoCache:v4:video"]).toEqual(stores.local["lyricsTyCache:v4:video"]);
    expect(stores.local["refraoMapping:video"]).toBe(123);
    expect(stores.local["refraoOffset:v1:video"]).toBe(-2_000);
    expect(stores.local.unrelated).toBe("keep");
  });

  it("does not replace newer preferences or repeat concurrent migrations", async () => {
    stores.sync.lyricsTySettings = { fontSize: 30 };
    stores.sync.refraoSettings = { fontSize: 45 };
    const { migrateStorage } = await import("./storage-migration");
    await Promise.all([migrateStorage("sync"), migrateStorage("sync")]);
    expect(stores.sync.refraoSettings).toEqual({ fontSize: 45 });
    expect(storage.sync.set).toHaveBeenCalledTimes(1);
  });

  it("does not resurrect a cleared manual choice after the background restarts", async () => {
    stores.local["lyricsTyMapping:video"] = 123;
    const first = await import("./storage-migration");
    await first.migrateStorage("local");
    delete stores.local["refraoMapping:video"];
    vi.resetModules();
    const restarted = await import("./storage-migration");
    await restarted.migrateStorage("local");
    expect(stores.local["refraoMapping:video"]).toBeUndefined();
  });

  it("retries a failed migration without marking it complete", async () => {
    storage.local.set.mockRejectedValueOnce(new Error("Storage unavailable"));
    const { migrateStorage } = await import("./storage-migration");
    await expect(migrateStorage("local")).rejects.toThrow("Storage unavailable");
    expect(stores.local.refraoStorageMigratedV1).toBeUndefined();
    await migrateStorage("local");
    expect(stores.local.refraoStorageMigratedV1).toBe(true);
  });
});
