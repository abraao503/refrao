import { browser } from "wxt/browser";
import { getCacheKey, getMappingKey, getVideoOffsetKey } from "./settings";
import type { LyricsRecord } from "./types";
import { migrateStorage } from "./storage-migration";

interface CacheEntry {
  record: LyricsRecord | null;
  expiresAt: number;
  lastUsedAt: number;
}

export async function readCachedLyrics(videoId: string): Promise<LyricsRecord | null | undefined> {
  await migrateStorage("local");
  const key = getCacheKey(videoId);
  const result = await browser.storage.local.get(key);
  const entry = result[key] as CacheEntry | undefined;
  if (!entry) return undefined;
  if (entry.expiresAt <= Date.now()) {
    await browser.storage.local.remove(key);
    return undefined;
  }
  await browser.storage.local.set({ [key]: { ...entry, lastUsedAt: Date.now() } });
  return entry.record;
}

export async function writeCachedLyrics(videoId: string, record: LyricsRecord | null): Promise<void> {
  await migrateStorage("local");
  const entry: CacheEntry = {
    record,
    expiresAt: Date.now() + (record ? 7 * 24 * 60 * 60_000 : 24 * 60 * 60_000),
    lastUsedAt: Date.now(),
  };
  await browser.storage.local.set({
    [getCacheKey(videoId)]: entry,
  });
  const all = await browser.storage.local.get(null);
  const cacheEntries = Object.entries(all)
    .filter(([key, value]) => key.startsWith("refraoCache:") && value && typeof value === "object")
    .map(([key, value]) => ({ key, lastUsedAt: Number((value as CacheEntry).lastUsedAt) || 0 }))
    .sort((a, b) => b.lastUsedAt - a.lastUsedAt);
  if (cacheEntries.length > 200) await browser.storage.local.remove(cacheEntries.slice(200).map((item) => item.key));
}

export async function readManualMapping(videoId: string): Promise<number | undefined> {
  await migrateStorage("local");
  const result = await browser.storage.local.get(getMappingKey(videoId));
  const id = result[getMappingKey(videoId)];
  return typeof id === "number" ? id : undefined;
}

export async function writeManualMapping(videoId: string, id: number): Promise<void> {
  await migrateStorage("local");
  await browser.storage.local.set({ [getMappingKey(videoId)]: id });
}

export async function clearManualMapping(videoId: string): Promise<void> {
  await migrateStorage("local");
  await browser.storage.local.remove([getMappingKey(videoId), getCacheKey(videoId), getVideoOffsetKey(videoId)]);
}
