import { browser } from "wxt/browser";
import type { UserSettings } from "./types";
import { migrateStorage } from "./storage-migration";

export const defaultSettings: UserSettings = {
  fontFamily: "Inter, ui-sans-serif, system-ui, sans-serif",
  fontSize: 31,
  fontWeight: 700,
  lineHeight: 1.25,
  textAlign: "left",
  activeColor: "#ffffff",
  inactiveColor: "#ffffff",
  inactiveOpacity: 0.34,
  backgroundOpacity: 0.78,
  backgroundBlur: 24,
  animationIntensity: 1,
  autoScroll: true,
  reducedMotion: "system",
  bounds: { left: null, top: null, width: 420, height: 680 },
};

const SETTINGS_KEY = "refraoSettings";
const CACHE_VERSION = "v4";
const VIDEO_OFFSET_VERSION = "v1";

function mergeSettings(value: Partial<UserSettings> | undefined): UserSettings {
  return {
    ...defaultSettings,
    ...value,
    bounds: { ...defaultSettings.bounds, ...value?.bounds },
  };
}

export async function loadSettings(): Promise<UserSettings> {
  await migrateStorage("sync");
  const stored = await browser.storage.sync.get(SETTINGS_KEY);
  return mergeSettings(stored[SETTINGS_KEY] as Partial<UserSettings> | undefined);
}

export async function saveSettings(settings: UserSettings): Promise<void> {
  await migrateStorage("sync");
  await browser.storage.sync.set({ [SETTINGS_KEY]: settings });
}

export function settingsFromStorage(value: unknown): UserSettings {
  return mergeSettings(value as Partial<UserSettings> | undefined);
}

export function getCacheKey(videoId: string): string {
  return `refraoCache:${CACHE_VERSION}:${videoId}`;
}

export function getMappingKey(videoId: string): string {
  return `refraoMapping:${videoId}`;
}

export function getVideoOffsetKey(videoId: string): string {
  return `refraoOffset:${VIDEO_OFFSET_VERSION}:${videoId}`;
}

export async function loadVideoOffset(videoId: string): Promise<number> {
  await migrateStorage("local");
  const result = await browser.storage.local.get(getVideoOffsetKey(videoId));
  const value = Number(result[getVideoOffsetKey(videoId)]);
  return Number.isFinite(value) ? value : 0;
}

export async function saveVideoOffset(videoId: string, offsetMs: number): Promise<void> {
  await migrateStorage("local");
  await browser.storage.local.set({ [getVideoOffsetKey(videoId)]: offsetMs });
}

export const settingsStorageKey = SETTINGS_KEY;
