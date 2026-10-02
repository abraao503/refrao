import { browser } from "wxt/browser";

const MIGRATED_KEY = "refraoStorageMigratedV1";
const migrations: Partial<Record<"sync" | "local", Promise<void>>> = {};

/** Old names are kept only here so existing installations retain their data. */
export function migrateStorage(area: "sync" | "local"): Promise<void> {
  return migrations[area] ||= migrateArea(area).catch((error) => {
    delete migrations[area];
    throw error;
  });
}

async function migrateArea(area: "sync" | "local"): Promise<void> {
  const storage = browser.storage[area];
  const stored = await storage.get(null);
  if (stored[MIGRATED_KEY]) return;
  const updates: Record<string, unknown> = { [MIGRATED_KEY]: true };
  for (const [key, value] of Object.entries(stored)) {
    let nextKey: string | undefined;
    if (area === "sync" && key === "lyricsTySettings") nextKey = "refraoSettings";
    if (area === "local" && /^(lyricsTyCache:|lyricsTyMapping:|lyricsTyOffset:)/.test(key)) {
      nextKey = key.replace(/^lyricsTy/, "refrao");
    }
    if (nextKey && !(nextKey in stored)) updates[nextKey] = value;
  }
  // Keep the original entries as a fallback. The marker prevents deleted
  // selections from being imported again on the next background startup.
  await storage.set(updates);
}
