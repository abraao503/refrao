import { browser } from "wxt/browser";
import { defineBackground } from "wxt/utils/define-background";
import { clearManualMapping, readCachedLyrics, readManualMapping, writeCachedLyrics, writeManualMapping } from "../src/shared/cache";
import { getLyricsById, getLyricsByMetadata, hasCompatibleDuration, isCompatibleRecord, rankCandidates, searchLyrics, searchLyricsForMetadata } from "../src/shared/lrclib";
import type { ExtensionRequest, ExtensionResponse } from "../src/shared/types";

async function lookup(request: Extract<ExtensionRequest, { type: "LOOKUP_LYRICS" }>, signal?: AbortSignal): Promise<ExtensionResponse> {
  const { metadata, query } = request;
  try {
    const mappedId = await readManualMapping(metadata.videoId);
    signal?.throwIfAborted();
    if (mappedId) {
      const mapped = await getLyricsById(mappedId, signal);
      if (mapped) {
        await writeCachedLyrics(metadata.videoId, mapped);
        return { ok: true, record: mapped };
      }
    }

    if (!query) {
      const cached = await readCachedLyrics(metadata.videoId);
      signal?.throwIfAborted();
      if (cached !== undefined && (!cached || (cached.mode !== "plain" && isCompatibleRecord(metadata, cached)))) return { ok: true, record: cached };
    }

    const exact = query ? null : await getLyricsByMetadata(metadata, signal);
    if (exact) {
      await writeCachedLyrics(metadata.videoId, exact);
      return { ok: true, record: exact };
    }

    const candidates = rankCandidates(metadata, query ? await searchLyrics(query, signal) : await searchLyricsForMetadata(metadata, signal));
    const top = candidates[0];
    if (top && top.confidence >= 0.9 && hasCompatibleDuration(metadata, top)) {
      const accepted = await getLyricsById(top.id, signal);
      if (accepted) {
        await writeCachedLyrics(metadata.videoId, accepted);
        return { ok: true, record: accepted, candidates };
      }
    }
    return { ok: true, record: null, candidates: candidates.slice(0, 8) };
  } catch (error) {
    const typed = error as Error & { retryAfter?: number };
    return { ok: false, error: typed.message || "Não foi possível consultar o LRCLIB.", retryAfter: typed.retryAfter };
  }
}

export default defineBackground(() => {
  const pendingRequests = new Map<string, AbortController>();
  browser.action.onClicked.addListener((tab) => {
    if (!tab.id || !tab.url?.startsWith("https://www.youtube.com/")) return;
    void browser.tabs.sendMessage(tab.id, { type: "TOGGLE_PANEL" }).catch(() => undefined);
  });

  browser.runtime.onMessage.addListener((message: ExtensionRequest, sender, sendResponse) => {
    const key = "requestId" in message && message.requestId
      ? `${sender.tab?.id}:${message.requestId}` : undefined;
    if (message.type === "CANCEL_LYRICS") {
      if (key) pendingRequests.get(key)?.abort();
      sendResponse({ ok: true, record: null } satisfies ExtensionResponse);
      return false;
    }
    const controller = key ? new AbortController() : undefined;
    if (key && controller) pendingRequests.set(key, controller);
    const task = message.type === "LOOKUP_LYRICS"
      ? lookup(message, controller?.signal)
      : message.type === "SEARCH_LYRICS"
        ? searchLyrics(message.query, controller?.signal).then((candidates) => ({ ok: true, record: null, candidates } satisfies ExtensionResponse))
        : message.type === "GET_LYRICS_BY_ID"
          ? getLyricsById(message.id, controller?.signal).then((record) => ({ ok: true, record } satisfies ExtensionResponse))
          : message.type === "CLEAR_MAPPING"
            ? clearManualMapping(message.videoId).then(() => ({ ok: true, record: null } satisfies ExtensionResponse))
          : Promise.resolve({ ok: true, record: null } satisfies ExtensionResponse);
    task.then(sendResponse).catch((error: Error & { retryAfter?: number }) => sendResponse({ ok: false, error: error.message, retryAfter: error.retryAfter } satisfies ExtensionResponse)).finally(() => {
      if (key) pendingRequests.delete(key);
    });
    return true;
  });

  browser.runtime.onMessage.addListener((message: { type?: string; videoId?: string; id?: number }) => {
    if (message.type === "SAVE_MAPPING" && message.videoId && typeof message.id === "number") {
      void writeManualMapping(message.videoId, message.id);
    }
  });
});
