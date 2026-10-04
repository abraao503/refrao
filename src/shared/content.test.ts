import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import contentScript from "../../entrypoints/content";
import type { VideoMetadata } from "./types";
import { ContentScriptContext } from "wxt/utils/content-script-context";

const { render, unmount, readMetadata, onMessage, removeMessage, runtime } = vi.hoisted(() => ({
  render: vi.fn(), unmount: vi.fn(), readMetadata: vi.fn(), onMessage: vi.fn(), removeMessage: vi.fn(),
  runtime: { id: "refrao-test" as string | undefined },
}));
vi.mock("react-dom/client", () => ({ createRoot: () => ({ render, unmount }) }));
vi.mock("wxt/utils/define-content-script", () => ({ defineContentScript: (definition: unknown) => definition }));
vi.mock("wxt/browser", () => ({ browser: { runtime: Object.assign(runtime, { onMessage: { addListener: onMessage, removeListener: removeMessage } }) } }));
vi.mock("./metadata", () => ({ readVideoMetadata: readMetadata }));
vi.mock("../ui/Panel", () => ({ Panel: () => null }));

const cleanups: (() => void)[] = [];
let removeListeners: (() => void) | undefined;
let context: ContentScriptContext;
beforeEach(() => { vi.clearAllMocks(); runtime.id = "refrao-test"; });
afterEach(() => {
  cleanups.splice(0).forEach((cleanup) => cleanup());
  removeListeners?.();
  vi.restoreAllMocks();
  vi.useRealTimers();
  document.body.replaceChildren();
  document.getElementById("refrao-player-styles")?.remove();
});

function startContent() {
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
    injectContent();
    return location;
}

function injectContent() {
  context = new ContentScriptContext("content", { noScriptStartedPostMessage: true });
  const current = context;
  cleanups.push(() => current.notifyInvalidated());
  (contentScript.main as (ctx: ContentScriptContext) => void)(current);
}

describe("content-script navigation integration", () => {
  it("closes an open panel immediately, blocks opening in miniplayer, and allows manual reopening after restoration", async () => {
    const location = startContent();
    await vi.advanceTimersByTimeAsync(600);
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
    await vi.advanceTimersByTimeAsync(600);
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
    await vi.advanceTimersByTimeAsync(600);
    expect(button.hidden).toBe(false);
    expect(render.mock.lastCall?.[0].props).toMatchObject({ visible: false, metadata: { videoId: "song" } });
    button.click();
    expect(render.mock.lastCall?.[0].props.visible).toBe(true);
  });

  it("keeps one panel instance and never publishes transient track metadata on a playlist change", async () => {
    const location = startContent();
    await vi.advanceTimersByTimeAsync(600);
    document.querySelector<HTMLButtonElement>(".refrao-player-button")!.click();
    render.mockClear();
    document.dispatchEvent(new Event("yt-navigate-start"));
    expect(render.mock.lastCall?.[0].props).toMatchObject({ visible: true, metadata: null });
    location.href = "https://www.youtube.com/watch?v=angels&list=mix";
    document.dispatchEvent(new Event("yt-navigate-finish"));
    // The old page's metadata must not be published under the new route.
    await vi.advanceTimersByTimeAsync(180);
    readMetadata.mockReturnValue({ videoId: "angels", title: "Angeles (Spanish Version)", artist: "Robbie Williams", channel: "Robbie Williams", duration: 236, likelyMusic: true });
    await vi.advanceTimersByTimeAsync(180);
    readMetadata.mockReturnValue({ videoId: "angels", title: "Angels", artist: "Robbie Williams", channel: "Robbie Williams", duration: 235.741, likelyMusic: true });
    document.dispatchEvent(new Event("yt-page-data-updated"));
    await vi.advanceTimersByTimeAsync(600);
    expect(render.mock.calls.map(([element]) => element.props.metadata?.title).filter(Boolean)).toEqual(["Angels"]);
    expect(render.mock.lastCall?.[0].props.visible).toBe(true);
    expect(render.mock.calls.every(([element]) => element.key === null)).toBe(true);
  });

  it("does not reload the same recording for fractional duration changes, but updates ad state", async () => {
    startContent();
    await vi.advanceTimersByTimeAsync(600);
    const initial = render.mock.lastCall?.[0].props.metadata;
    render.mockClear();
    readMetadata.mockReturnValue({ ...initial, duration: 200.1 });
    document.dispatchEvent(new Event("durationchange"));
    await vi.advanceTimersByTimeAsync(600);
    expect(render).not.toHaveBeenCalled();
    readMetadata.mockReturnValue({ ...initial, isAd: true });
    document.dispatchEvent(new Event("yt-page-data-updated"));
    await vi.advanceTimersByTimeAsync(600);
    expect(render.mock.lastCall?.[0].props.metadata.isAd).toBe(true);
  });

  it("removes controls, listeners and pending timers on invalidation without resurrecting the panel", async () => {
    startContent();
    await vi.advanceTimersByTimeAsync(600);
    const button = document.querySelector<HTMLButtonElement>(".refrao-player-button")!;
    const oldMessage = onMessage.mock.lastCall![0];
    document.dispatchEvent(new Event("yt-navigate-start"));
    context.notifyInvalidated();
    expect(unmount).toHaveBeenCalledTimes(1);
    expect(removeMessage).toHaveBeenCalledWith(oldMessage);
    expect(document.querySelector("#refrao-host, .refrao-player-button, #refrao-player-styles")).toBeNull();
    expect(document.getElementById("refrao-reload-notice")).toBeNull();
    render.mockClear(); readMetadata.mockClear();
    button.click();
    oldMessage({ type: "TOGGLE_PANEL" });
    ["yt-navigate-start", "yt-navigate-finish", "yt-page-data-updated", "loadedmetadata", "durationchange", "fullscreenchange"].forEach((event) => document.dispatchEvent(new Event(event)));
    window.dispatchEvent(new Event("popstate"));
    document.body.appendChild(document.createElement("div"));
    await vi.advanceTimersByTimeAsync(3000);
    expect(render).not.toHaveBeenCalled();
    expect(readMetadata).not.toHaveBeenCalled();
    expect(vi.getTimerCount()).toBe(0);
  });

  it("detects a detached runtime on an idle page and provides a page-only reload action", async () => {
    startContent();
    await vi.advanceTimersByTimeAsync(600);
    runtime.id = undefined;
    await vi.advanceTimersByTimeAsync(400);
    expect(context.isInvalid).toBe(true);
    expect(unmount).toHaveBeenCalledTimes(1);
    expect(document.getElementById("refrao-host")).toBeNull();
    expect(document.querySelector(".refrao-player-button")).toBeNull();
    const notice = document.getElementById("refrao-reload-notice")!;
    expect(notice.textContent).toContain("Recarregue esta página");
    expect(notice.querySelector("button")?.textContent).toBe("Recarregar YouTube");
    const reload = vi.fn();
    vi.spyOn(window, "location", "get").mockReturnValue({ href: "https://www.youtube.com/watch?v=song", reload } as unknown as Location);
    notice.querySelector("button")!.click();
    expect(reload).toHaveBeenCalledTimes(1);
    expect(vi.getTimerCount()).toBe(0);
  });

  it("replaces old controls and orphaned UI on reinjection with only the new click handler", async () => {
    startContent();
    await vi.advanceTimersByTimeAsync(600);
    const oldButton = document.querySelector<HTMLButtonElement>(".refrao-player-button")!;
    const oldContext = context;
    const orphan = document.createElement("div");
    orphan.id = "refrao-host";
    document.body.appendChild(orphan);
    injectContent();
    expect(oldContext.isInvalid).toBe(true);
    expect(orphan.isConnected).toBe(false);
    expect(document.querySelectorAll("#refrao-host")).toHaveLength(1);
    expect(document.querySelectorAll(".refrao-player-button")).toHaveLength(1);
    const button = document.querySelector<HTMLButtonElement>(".refrao-player-button")!;
    expect(button).not.toBe(oldButton);
    render.mockClear();
    oldButton.click();
    expect(render).not.toHaveBeenCalled();
    button.click();
    expect(render).toHaveBeenCalledTimes(1);
    expect(render.mock.lastCall![0].props.visible).toBe(true);
  });
});
