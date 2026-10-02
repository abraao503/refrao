import { afterEach, describe, expect, it, vi } from "vitest";
import { canShowLyricsPanel, observePlayerAvailability } from "./player-state";

const watchUrl = "https://www.youtube.com/watch?v=video-id&list=playlist";
let stopObserving: (() => void) | undefined;

afterEach(() => {
  stopObserving?.();
  stopObserving = undefined;
  document.body.replaceChildren();
});

describe("lyrics panel availability", () => {
  it("allows the full watch page with a playlist", () => {
    expect(canShowLyricsPanel(document, watchUrl)).toBe(true);
  });

  it.each(["/", "/results?search_query=song", "/feed/subscriptions", "/watch", "/shorts/video-id?v=video-id"])("does not show a perpetual loading panel on %s", (path) => {
    expect(canShowLyricsPanel(document, `https://www.youtube.com${path}`)).toBe(false);
  });

  it.each([
    '<ytd-app miniplayer-is-active></ytd-app>',
    '<ytd-miniplayer active></ytd-miniplayer>',
    '<div class="html5-video-player ytp-player-minimized"></div>',
    '<div class="html5-video-player ytp-miniplayer-active"></div>',
  ])("blocks an active miniplayer: %s", (markup) => {
    document.body.innerHTML = markup;
    expect(canShowLyricsPanel(document, watchUrl)).toBe(false);
  });

  it("does not confuse an inactive miniplayer component with minimization", () => {
    document.body.innerHTML = '<ytd-app miniplayer-is-active="false"><ytd-miniplayer></ytd-miniplayer></ytd-app>';
    expect(canShowLyricsPanel(document, watchUrl)).toBe(true);
  });

  it("detects minimization and restoration through attribute changes, without replacing the DOM", async () => {
    document.body.innerHTML = "<ytd-app><ytd-miniplayer></ytd-miniplayer></ytd-app>";
    const onChange = vi.fn();
    stopObserving = observePlayerAvailability(document, () => watchUrl, onChange);
    const app = document.querySelector("ytd-app")!;
    app.setAttribute("miniplayer-is-active", "");
    await Promise.resolve();
    expect(onChange).toHaveBeenLastCalledWith(false);
    app.removeAttribute("miniplayer-is-active");
    await Promise.resolve();
    expect(onChange).toHaveBeenLastCalledWith(true);
    expect(onChange).toHaveBeenCalledTimes(2);
  });

  it("detects player class changes and ignores unrelated DOM updates", async () => {
    document.body.innerHTML = '<div class="html5-video-player"></div>';
    const onChange = vi.fn();
    stopObserving = observePlayerAvailability(document, () => watchUrl, onChange);
    document.body.classList.add("unrelated");
    await Promise.resolve();
    expect(onChange).not.toHaveBeenCalled();
    document.querySelector(".html5-video-player")!.classList.add("ytp-player-minimized");
    await Promise.resolve();
    expect(onChange).toHaveBeenCalledWith(false);
    document.body.classList.remove("unrelated");
  });

  it("notifies when SPA navigation leaves the watch page and stops observing on cleanup", async () => {
    let href = watchUrl;
    const onChange = vi.fn();
    stopObserving = observePlayerAvailability(document, () => href, onChange);
    href = "https://www.youtube.com/";
    document.dispatchEvent(new Event("yt-navigate-finish"));
    expect(onChange).toHaveBeenCalledWith(false);
    stopObserving();
    href = watchUrl;
    document.dispatchEvent(new Event("yt-navigate-finish"));
    document.body.appendChild(document.createElement("div"));
    await Promise.resolve();
    expect(onChange).toHaveBeenCalledTimes(1);
  });
});
