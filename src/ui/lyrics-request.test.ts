import { afterEach, describe, expect, it, vi } from "vitest";
import { sendLyricsRequest } from "./lyrics-request";

const { sendMessage } = vi.hoisted(() => ({ sendMessage: vi.fn() }));
vi.mock("wxt/browser", () => ({ browser: { runtime: { sendMessage } } }));
afterEach(() => { sendMessage.mockReset(); });

describe("cancelable lyrics requests", () => {
  it("includes a unique identifier and returns the provider response", async () => {
    const response = { ok: true, record: null, candidates: [] };
    sendMessage.mockResolvedValue(response);
    const controller = new AbortController();
    expect(await sendLyricsRequest({ type: "SEARCH_LYRICS", query: "Song" }, controller.signal)).toEqual(response);
    const id = sendMessage.mock.calls[0][0].requestId;
    expect(id).toEqual(expect.any(String));
    expect(await sendLyricsRequest({ type: "GET_LYRICS_BY_ID", id: 1 }, controller.signal)).toEqual(response);
    expect(sendMessage.mock.calls[1][0].requestId).not.toBe(id);
    controller.abort();
    expect(sendMessage).toHaveBeenCalledTimes(2);
  });

  it("cancels the background request and ignores a late result", async () => {
    let resolveResponse!: (response: unknown) => void;
    sendMessage.mockImplementationOnce(() => new Promise((resolve) => { resolveResponse = resolve; }));
    sendMessage.mockResolvedValue({ ok: true, record: null });
    const controller = new AbortController();
    const result = sendLyricsRequest({ type: "SEARCH_LYRICS", query: "Song" }, controller.signal);
    const assertion = expect(result).rejects.toMatchObject({ name: "AbortError" });
    const requestId = sendMessage.mock.calls[0][0].requestId;
    controller.abort();
    await assertion;
    expect(sendMessage).toHaveBeenLastCalledWith({ type: "CANCEL_LYRICS", requestId });
    resolveResponse({ ok: true, record: { id: 123 } });
    await Promise.resolve();
    expect(sendMessage).toHaveBeenCalledTimes(2);
  });

  it("does not send requests with an already cancelled signal", () => {
    const controller = new AbortController();
    controller.abort();
    expect(() => sendLyricsRequest({ type: "GET_LYRICS_BY_ID", id: 1 }, controller.signal)).toThrow();
    expect(sendMessage).not.toHaveBeenCalled();
  });
});
