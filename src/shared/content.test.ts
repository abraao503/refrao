import { afterEach, describe, expect, it, vi } from "vitest";
import contentScript from "../../entrypoints/content";
import type { VideoMetadata } from "./types";

const { render, unmount, readMetadata, onMessage } = vi.hoisted(() => ({
  render: vi.fn(), unmount: vi.fn(), readMetadata: vi.fn(), onMessage: vi.fn(),
}));
vi.mock("react-dom/client", () => ({ createRoot: () => ({ render, unmount }) }));
vi.mock("wxt/utils/define-content-script", () => ({ defineContentScript: (definition: unknown) => definition }));
vi.mock("wxt/browser", () => ({ browser: { runtime: { onMessage: { addListener: onMessage } } } }));
vi.mock("./metadata", () => ({ readVideoMetadata: readMetadata }));
vi.mock("../ui/Panel", () => ({ Panel: () => null }));

const cleanups: (() => void)[] = [];
let removeListeners: (() => void) | undefined;
afterEach(() => {
  cleanups.splice(0).forEach((cleanup) => cleanup());
  removeListeners?.();
  vi.restoreAllMocks();
  vi.useRealTimers();
  document.body.replaceChildren();
  document.getElementById("refrao-player-styles")?.remove();
});

describe("miniplayer content-script integration", () => {
  it("closes an open panel immediately, blocks opening in miniplayer, and allows manual reopening after restoration", async () => {
    vi.useFakeTimers();
    const registered: { event: string; listener: EventListenerOrEventListenerObject; options?: boolean | AddEventListenerOptions }[] = [];
    const addListener = document.addEventListener.bind(document);
    vi.spyOn(document, "addEventListener").mockImplementation((event, listener, options) => {
      if (listener) registered.push({ event, listener, options });
      addListener(event, listener, options);
    });
    removeListeners = () => registered.forEach(({ event, listener, options }) => document.removeEventListener(event, listener, options));
    const location = { href: "https://www.youtube.com/watch?v=song" };
    vi.spyOn(window, "location", "get").mockReturnValue(location as Location);
    document.body.innerHTML = '<ytd-app><div class="html5-video-player"><div class="ytp-right-controls"></div></div><ytd-miniplayer></ytd-miniplayer></ytd-app>';
    readMetadata.mockReturnValue({
      videoId: "song", title: "Song", artist: "Artist", duration: 200, channel: "Artist", likelyMusic: true,
    } as VideoMetadata);
    const main = contentScript.main as (ctx: { onInvalidated: (cleanup: () => void) => void }) => void;
    main({ onInvalidated: (cleanup) => { cleanups.push(cleanup); } });
    await vi.advanceTimersByTimeAsync(200);
    const button = document.querySelector<HTMLButtonElement>(".refrao-player-button")!;
    button.click();
    expect(render.mock.lastCall?.[0].props).toMatchObject({ visible: true, metadata: { videoId: "song" } });

    const app = document.querySelector("ytd-app")!;
    app.setAttribute("miniplayer-is-active", "");
    await Promise.resolve();
    expect(render.mock.lastCall?.[0].props).toMatchObject({ visible: false, metadata: null });
    expect(button.hidden).toBe(true);
    const readCount = readMetadata.mock.calls.length;
    const toggle = onMessage.mock.lastCall?.[0];
    toggle({ type: "TOGGLE_PANEL" });
    await vi.advanceTimersByTimeAsync(500);
    expect(readMetadata).toHaveBeenCalledTimes(readCount);
    expect(render.mock.lastCall?.[0].props.visible).toBe(false);

    // Navigating back to the full player must not reopen the panel by itself.
    app.removeAttribute("miniplayer-is-active");
    await vi.advanceTimersByTimeAsync(200);
    expect(button.hidden).toBe(false);
    expect(render.mock.lastCall?.[0].props.visible).toBe(false);
    button.click();
    expect(render.mock.lastCall?.[0].props.visible).toBe(true);

    // Leaving /watch can also happen before any miniplayer attribute is set.
    document.dispatchEvent(new Event("yt-navigate-start"));
    location.href = "https://www.youtube.com/";
    document.dispatchEvent(new Event("yt-navigate-finish"));
    expect(render.mock.lastCall?.[0].props).toMatchObject({ visible: false, metadata: null });
    expect(button.hidden).toBe(true);

    // Returning to the same video must not be rejected as stale navigation.
    document.dispatchEvent(new Event("yt-navigate-start"));
    location.href = "https://www.youtube.com/watch?v=song";
    document.dispatchEvent(new Event("yt-navigate-finish"));
    await vi.advanceTimersByTimeAsync(200);
    expect(button.hidden).toBe(false);
    expect(render.mock.lastCall?.[0].props).toMatchObject({ visible: false, metadata: { videoId: "song" } });
    button.click();
    expect(render.mock.lastCall?.[0].props.visible).toBe(true);
  });
});
