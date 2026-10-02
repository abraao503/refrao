import { browser } from "wxt/browser";
import type { ExtensionRequest, ExtensionResponse } from "../shared/types";

export type LyricsRequest = Extract<ExtensionRequest, { type: "LOOKUP_LYRICS" | "SEARCH_LYRICS" | "GET_LYRICS_BY_ID" }>;

/** Cancel both the UI promise and the background fetch/retry timer. */
export function sendLyricsRequest(message: LyricsRequest, signal: AbortSignal): Promise<ExtensionResponse> {
  signal.throwIfAborted();
  const requestId = crypto.randomUUID();
  return new Promise((resolve, reject) => {
    const onAbort = () => {
      void browser.runtime.sendMessage({ type: "CANCEL_LYRICS", requestId }).catch(() => undefined);
      reject(signal.reason);
    };
    signal.addEventListener("abort", onAbort, { once: true });
    void browser.runtime.sendMessage({ ...message, requestId }).then((response: ExtensionResponse) => {
      signal.removeEventListener("abort", onAbort);
      if (!signal.aborted) resolve(response);
    }, (error) => {
      signal.removeEventListener("abort", onAbort);
      reject(error);
    });
  });
}
